/**
 * Moteur de categorisation.
 *
 * Ordre volontaire : les regles deterministes passent AVANT l'IA. Une regle est
 * reproductible, verifiable et gratuite ; l'IA ne sert qu'a ce qu'aucune regle
 * ne couvre. Et toute correction manuelle produit une nouvelle regle, ce qui
 * fait decroitre l'usage de l'IA au fil des mois plutot que croitre.
 *
 * Si aucune cle Anthropic n'est configuree, le moteur fonctionne quand meme :
 * les operations non couvertes restent "Non categorise" et attendent un
 * classement manuel.
 */

import type { CategorySource } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { env } from '@/lib/env';
import { normalizeLabel } from '@/lib/normalize';
import { mapBankCategory } from './bankMapping';

export interface CategorizationInput {
  rawLabel: string;
  amountCents: number;
  date: Date;
  /** Categorie proposee par la banque, quand l'export la fournit. */
  bankCategory?: string;
}

export interface CategorizationDecision {
  categoryId: string | null;
  source: CategorySource;
  confidence?: number;
}

/** Index des categories par chemin ("Parent > Enfant" ou "Parent"). */
async function categoriesByPath(profileId: string): Promise<Map<string, string>> {
  const categories = await db.category.findMany({
    where: { profileId },
    include: { parent: true },
  });
  const map = new Map<string, string>();
  for (const c of categories) {
    map.set(c.parent ? `${c.parent.name} > ${c.name}` : c.name, c.id);
  }
  return map;
}

interface LoadedRule {
  id: string;
  pattern: string;
  match: 'CONTAINS' | 'STARTS_WITH' | 'REGEX' | 'EXACT';
  categoryId: string;
  amountMin: number | null;
  amountMax: number | null;
  priority: number;
}

async function loadRules(profileId: string): Promise<LoadedRule[]> {
  const rules = await db.categoryRule.findMany({
    where: { profileId },
    orderBy: [{ priority: 'asc' }, { pattern: 'desc' }],
  });
  return rules.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    match: r.match,
    categoryId: r.categoryId,
    amountMin: r.amountMin ? r.amountMin.toNumber() * 100 : null,
    amountMax: r.amountMax ? r.amountMax.toNumber() * 100 : null,
    priority: r.priority,
  }));
}

export function ruleMatches(
  rule: LoadedRule,
  normalized: string,
  amountCents: number,
): boolean {
  if (rule.amountMin !== null && amountCents < rule.amountMin) return false;
  if (rule.amountMax !== null && amountCents > rule.amountMax) return false;

  switch (rule.match) {
    case 'EXACT':
      return normalized === rule.pattern;
    case 'STARTS_WITH':
      return normalized.startsWith(rule.pattern);
    case 'REGEX':
      try {
        return new RegExp(rule.pattern).test(normalized);
      } catch {
        return false; // une regex invalide ne doit pas casser l'import
      }
    case 'CONTAINS':
    default:
      return normalized.includes(rule.pattern);
  }
}

function applyRules(
  rules: LoadedRule[],
  input: CategorizationInput,
): LoadedRule | null {
  const normalized = normalizeLabel(input.rawLabel);
  for (const rule of rules) {
    if (ruleMatches(rule, normalized, input.amountCents)) return rule;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classification par modele
// ---------------------------------------------------------------------------

interface AiCandidate {
  index: number;
  label: string;
  amountEur: number;
}

/**
 * Envoie au modele les operations qu'aucune regle ne couvre, par lots.
 * Le modele ne recoit que le libelle et le montant — rien qui identifie la
 * personne, ni numero de compte, ni solde.
 */
async function classifyWithAi(
  candidates: AiCandidate[],
  categories: { id: string; path: string }[],
): Promise<Map<number, { categoryId: string; confidence: number }>> {
  const out = new Map<number, { categoryId: string; confidence: number }>();
  if (candidates.length === 0 || !env.aiAvailable) return out;

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const catalogue = categories.map((c, i) => `${i}. ${c.path}`).join('\n');
  const BATCH = 60;

  for (let start = 0; start < candidates.length; start += BATCH) {
    const batch = candidates.slice(start, start + BATCH);
    const list = batch
      .map((c, i) => `${i}|${c.label}|${c.amountEur.toFixed(2)} EUR`)
      .join('\n');

    const prompt = [
      "Tu classes des operations bancaires francaises dans une taxonomie fermee.",
      '',
      'Categories disponibles (indice. chemin) :',
      catalogue,
      '',
      'Operations a classer (indice|libelle|montant) :',
      list,
      '',
      'Regles :',
      "- Reponds UNIQUEMENT par du JSON, un tableau d'objets {\"i\": <indice operation>, \"c\": <indice categorie>, \"conf\": <0..1>}.",
      "- Un montant negatif est une depense, un montant positif une entree d'argent.",
      "- Si tu hesites entre deux categories, choisis la plus generale et baisse la confiance.",
      "- Si le libelle ne permet pas de trancher, omets l'operation du tableau plutot que de deviner.",
      '- Aucun texte avant ou apres le JSON.',
    ].join('\n');

    try {
      const response = await client.messages.create({
        model: env.anthropicModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;
      const parsed = JSON.parse(jsonMatch[0]) as {
        i: number;
        c: number;
        conf?: number;
      }[];
      for (const item of parsed) {
        const candidate = batch[item.i];
        const category = categories[item.c];
        if (!candidate || !category) continue;
        const confidence = typeof item.conf === 'number' ? item.conf : 0.6;
        // En dessous de 0.5, mieux vaut "Non categorise" qu'une categorie fausse
        // qui pollue silencieusement les statistiques.
        if (confidence < 0.5) continue;
        out.set(candidate.index, { categoryId: category.id, confidence });
      }
    } catch (error) {
      // Une panne de l'IA ne doit jamais faire echouer un import.
      console.error('[categorize] classification IA en echec :', error);
    }
  }

  return out;
}

async function categoryCatalogue(profileId: string): Promise<{ id: string; path: string }[]> {
  const categories = await db.category.findMany({
    where: { profileId, archived: false },
    include: { parent: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return categories
    .filter((c) => c.name !== 'Non categorise')
    .map((c) => ({
      id: c.id,
      path: c.parent ? `${c.parent.name} > ${c.name}` : c.name,
    }));
}

/** Categorise un lot d'operations. Renvoie une decision par entree, dans l'ordre. */
export async function categorizeRows(
  profileId: string,
  inputs: CategorizationInput[],
): Promise<CategorizationDecision[]> {
  if (inputs.length === 0) return [];

  const rules = await loadRules(profileId);
  const decisions: CategorizationDecision[] = inputs.map(() => ({
    categoryId: null,
    source: 'UNSET' as CategorySource,
  }));

  const ruleHits = new Map<string, number>();
  const leftovers: AiCandidate[] = [];

  // La categorie de la banque n'est consultee que si aucune regle ne s'applique.
  // Une regle apprise par l'utilisateur doit toujours l'emporter : c'est lui qui
  // connait ses depenses, pas sa banque.
  const byPath = inputs.some((i) => i.bankCategory)
    ? await categoriesByPath(profileId)
    : new Map<string, string>();

  inputs.forEach((input, index) => {
    const rule = applyRules(rules, input);
    if (rule) {
      decisions[index] = {
        categoryId: rule.categoryId,
        source: 'IMPORT_RULE',
      };
      ruleHits.set(rule.id, (ruleHits.get(rule.id) ?? 0) + 1);
      return;
    }

    const mapped = mapBankCategory(input.bankCategory);
    const mappedId = mapped ? byPath.get(mapped) : undefined;
    if (mappedId) {
      // Source IMPORT_RULE : comme une regle, c'est deterministe et
      // reproductible, et l'utilisateur peut le corriger a la main.
      decisions[index] = { categoryId: mappedId, source: 'IMPORT_RULE' };
      return;
    }

    leftovers.push({
      index,
      label: input.rawLabel,
      amountEur: input.amountCents / 100,
    });
  });

  const profile = await db.profile.findUnique({ where: { id: profileId } });
  if (profile?.aiEnabled !== false && leftovers.length > 0 && env.aiAvailable) {
    const catalogue = await categoryCatalogue(profileId);
    const aiResults = await classifyWithAi(leftovers, catalogue);
    for (const [index, result] of aiResults) {
      decisions[index] = {
        categoryId: result.categoryId,
        source: 'AI',
        confidence: result.confidence,
      };
    }
  }

  // Compteur d'usage des regles : sert a reperer les regles mortes.
  await Promise.all(
    [...ruleHits.entries()].map(([id, hits]) =>
      db.categoryRule.update({ where: { id }, data: { hits: { increment: hits } } }),
    ),
  );

  return decisions;
}

/**
 * Recategorisation manuelle. Au-dela de la mise a jour de l'operation, on cree
 * une regle apprise pour que le meme marchand soit classe seul la prochaine
 * fois. C'est le mecanisme qui fait converger le systeme.
 */
export async function recategorize(
  profileId: string,
  transactionId: string,
  categoryId: string,
  options: { learn?: boolean; applyToSimilar?: boolean } = {},
): Promise<{ updated: number; ruleCreated: boolean }> {
  const { learn = true, applyToSimilar = false } = options;
  const transaction = await db.transaction.findFirst({
    where: { id: transactionId, profileId },
  });
  if (!transaction) throw new Error('Operation introuvable.');

  await db.transaction.update({
    where: { id: transactionId },
    data: { categoryId, categorySource: 'MANUAL', aiConfidence: null },
  });

  let updated = 1;
  let ruleCreated = false;

  if (learn) {
    // Le motif appris est la partie signifiante du libelle, pas le libelle
    // entier : sinon la regle ne se declencherait plus jamais (dates, references).
    const { recurringKey } = await import('@/lib/normalize');
    const pattern = recurringKey(transaction.rawLabel);
    if (pattern.length >= 3) {
      const existing = await db.categoryRule.findFirst({
        where: { profileId, pattern, match: 'CONTAINS', amountMin: null, amountMax: null },
      });
      if (existing) {
        if (existing.categoryId !== categoryId) {
          await db.categoryRule.update({
            where: { id: existing.id },
            data: { categoryId, learned: true },
          });
        }
      } else {
        await db.categoryRule.create({
          data: {
            profileId,
            pattern,
            match: 'CONTAINS',
            categoryId,
            // Les regles apprises priment sur les regles livrees : l'utilisateur
            // a toujours raison contre le catalogue par defaut.
            priority: 10,
            learned: true,
          },
        });
        ruleCreated = true;
      }
    }

    if (applyToSimilar && pattern.length >= 3) {
      // On ne touche jamais a ce qui a deja ete tranche a la main.
      const similar = await db.transaction.findMany({
        where: {
          profileId,
          id: { not: transactionId },
          categorySource: { not: 'MANUAL' },
        },
        select: { id: true, rawLabel: true },
      });
      const targets = similar
        .filter((t) => recurringKey(t.rawLabel) === pattern)
        .map((t) => t.id);
      if (targets.length > 0) {
        const result = await db.transaction.updateMany({
          where: { profileId, id: { in: targets } },
          data: { categoryId, categorySource: 'LEARNED', aiConfidence: null },
        });
        updated += result.count;
      }
    }
  }

  return { updated, ruleCreated };
}

/** Relance la categorisation sur les operations encore non classees. */
export async function recategorizeUnset(profileId: string, limit = 500): Promise<number> {
  const uncategorized = await db.transaction.findMany({
    where: { profileId, OR: [{ categoryId: null }, { categorySource: 'UNSET' }] },
    orderBy: { date: 'desc' },
    take: limit,
  });
  if (uncategorized.length === 0) return 0;

  const decisions = await categorizeRows(
    profileId,
    uncategorized.map((t) => ({
      rawLabel: t.rawLabel,
      amountCents: Math.round(t.amount.toNumber() * 100),
      date: t.date,
    })),
  );

  let updated = 0;
  for (let i = 0; i < uncategorized.length; i++) {
    const decision = decisions[i];
    if (!decision.categoryId) continue;
    await db.transaction.update({
      where: { id: uncategorized[i].id },
      data: {
        categoryId: decision.categoryId,
        categorySource: decision.source,
        aiConfidence: decision.confidence ?? null,
      },
    });
    updated += 1;
  }
  return updated;
}

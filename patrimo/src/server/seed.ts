/**
 * Amorcage d'un profil : plan de categories, regles de depart, alertes, compte
 * par defaut. Idempotent — on peut le relancer sans rien casser.
 *
 * Tout est seme *par profil*. Deux personnes qui partagent l'installation ont
 * chacune son propre plan de categories : renommer "Courses" en "Alimentation"
 * chez l'un ne change rien chez l'autre. Seuls les indices de reference, qui
 * sont des donnees de marche, restent communs.
 */

import { db } from './db';
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from './categorize/taxonomy';
import { ensureAlertRules } from './analysis/alerts';
import { ensureBenchmarks } from './patrimoine/quotes';

export async function seedCategories(profileId: string): Promise<Map<string, string>> {
  const byPath = new Map<string, string>();
  let order = 0;

  for (const parent of DEFAULT_CATEGORIES) {
    // Postgres n'applique pas la contrainte d'unicite quand parentId est NULL :
    // pour les categories racines, on cherche a la main avant de creer.
    const existing = await db.category.findFirst({
      where: { profileId, name: parent.name, parentId: null },
    });
    const created =
      existing ??
      (await db.category.create({
        data: {
          profileId,
          name: parent.name,
          kind: parent.kind,
          icon: parent.icon,
          color: parent.color,
          sortOrder: order++,
          isSystem: parent.name === 'Non categorise',
        },
      }));
    byPath.set(parent.name, created.id);

    for (const child of parent.children ?? []) {
      const childRow = await db.category.upsert({
        where: {
          profileId_name_parentId: { profileId, name: child.name, parentId: created.id },
        },
        create: {
          profileId,
          name: child.name,
          kind: parent.kind,
          icon: child.icon ?? parent.icon,
          color: parent.color,
          parentId: created.id,
          sortOrder: order++,
        },
        update: {},
      });
      byPath.set(`${parent.name} > ${child.name}`, childRow.id);
    }
  }

  return byPath;
}

export async function seedRules(
  profileId: string,
  byPath: Map<string, string>,
): Promise<number> {
  let created = 0;
  for (const rule of DEFAULT_RULES) {
    const categoryId = byPath.get(rule.category);
    if (!categoryId) {
      console.warn(`[seed] categorie inconnue pour la regle "${rule.pattern}" : ${rule.category}`);
      continue;
    }
    const existing = await db.categoryRule.findFirst({
      where: {
        profileId,
        pattern: rule.pattern,
        match: 'CONTAINS',
        amountMin: rule.amountMin ?? null,
        amountMax: rule.amountMax ?? null,
      },
    });
    if (existing) continue;

    await db.categoryRule.create({
      data: {
        profileId,
        pattern: rule.pattern,
        match: 'CONTAINS',
        categoryId,
        priority: rule.priority ?? 100,
        amountMin: rule.amountMin ?? null,
        amountMax: rule.amountMax ?? null,
      },
    });
    created += 1;
  }
  return created;
}

export async function seedIfEmpty(profileId: string): Promise<{
  categories: number;
  rules: number;
}> {
  const existing = await db.category.count({ where: { profileId } });
  const byPath =
    existing === 0
      ? await seedCategories(profileId)
      : await (async () => {
          const map = new Map<string, string>();
          const all = await db.category.findMany({
            where: { profileId },
            include: { parent: true },
          });
          for (const c of all) {
            map.set(c.parent ? `${c.parent.name} > ${c.name}` : c.name, c.id);
          }
          return map;
        })();

  const rules = await seedRules(profileId, byPath);
  await ensureAlertRules(profileId);
  await ensureBenchmarks();

  // Un compte courant par defaut : sans compte, l'ecran d'import est bloque.
  const accounts = await db.account.count({ where: { profileId } });
  if (accounts === 0) {
    await db.account.create({
      data: { profileId, name: 'Compte courant', kind: 'CHECKING' },
    });
  }

  return { categories: byPath.size, rules };
}

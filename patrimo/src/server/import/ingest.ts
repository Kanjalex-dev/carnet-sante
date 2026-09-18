/**
 * Pipeline d'import : fichier -> operations en base.
 *
 * La deduplication est le point delicat. Deux exigences contradictoires :
 *
 *  - reimporter un fichier deja traite, ou un fichier qui chevauche le
 *    precedent, ne doit rien creer ;
 *  - deux cafes identiques payes le meme jour au meme endroit sont deux
 *    operations distinctes et doivent toutes deux exister.
 *
 * Solution : l'empreinte inclut un rang d'occurrence calcule DANS le fichier
 * (0, 1, 2...) pour chaque groupe (compte, date, montant, libelle). Le meme
 * fichier reimporte reproduit exactement les memes rangs, donc les memes
 * empreintes, donc zero insertion. Et deux cafes identiques recoivent les rangs
 * 0 et 1, donc deux empreintes distinctes.
 *
 * Quand la banque fournit un identifiant (FITID en OFX), il l'emporte : la
 * deduplication devient exacte au lieu d'heuristique.
 */

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { cleanLabel, guessMerchant } from '@/lib/normalize';
import { dateOnly } from '@/lib/dates';
import { categorizeRows } from '../categorize/engine';
import type { ParseResult, ParsedRow } from './types';
import { ImportError } from './types';
import { parseCsv } from './csv';
import { parseOfx } from './ofx';
import { parseQif } from './qif';

export function detectFormat(filename: string, buffer: Buffer): 'CSV' | 'OFX' | 'QIF' {
  const lower = filename.toLowerCase();
  const head = buffer.subarray(0, 2048).toString('latin1');
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx') || /<OFX>/i.test(head)) return 'OFX';
  if (lower.endsWith('.qif') || /^!Type:/im.test(head)) return 'QIF';
  return 'CSV';
}

export function parseFile(filename: string, buffer: Buffer): ParseResult {
  switch (detectFormat(filename, buffer)) {
    case 'OFX':
      return parseOfx(buffer);
    case 'QIF':
      return parseQif(buffer);
    default:
      return parseCsv(buffer, filename);
  }
}

function fingerprintOf(
  accountId: string,
  row: ParsedRow,
  ordinal: number,
): string {
  const base = row.externalId
    ? `${accountId}|fitid|${row.externalId}`
    : [
        accountId,
        row.date.toISOString().slice(0, 10),
        row.amountCents,
        row.rawLabel.trim().toUpperCase().replace(/\s+/g, ' '),
        ordinal,
      ].join('|');
  return createHash('sha256').update(base).digest('hex').slice(0, 40);
}

/** Assigne a chaque ligne son rang d'occurrence dans le fichier. */
export function assignOrdinals(rows: ParsedRow[]): number[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = [
      row.date.toISOString().slice(0, 10),
      row.amountCents,
      row.rawLabel.trim().toUpperCase().replace(/\s+/g, ' '),
    ].join('|');
    const next = seen.get(key) ?? 0;
    seen.set(key, next + 1);
    return next;
  });
}

/**
 * Associe chaque compte du fichier a un compte en base, en le creant au besoin.
 *
 * Un export BoursoBank melange le compte courant et la carte a debit differe
 * dans un seul fichier. Les verser tous les deux sur un meme compte fausse tout :
 * le solde additionne deux choses qui n'en font pas une, et surtout chaque
 * depense carte est comptee deux fois — une fois a l'achat, une fois au
 * prelevement mensuel de la carte.
 */
async function resolveAccounts(
  profileId: string,
  fallbackAccountId: string,
  accounts: { key: string; label: string }[] | undefined,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!accounts || accounts.length === 0) return map;

  // Un seul compte dans le fichier : on le rattache a celui choisi dans
  // l'interface, et on memorise sa reference pour les imports suivants.
  if (accounts.length === 1) {
    const existing = await db.account.findFirst({
      where: { id: fallbackAccountId, profileId },
    });
    if (existing && !existing.externalRef) {
      const taken = await db.account.findUnique({
        where: { profileId_externalRef: { profileId, externalRef: accounts[0].key } },
      });
      if (!taken) {
        await db.account.update({
          where: { id: fallbackAccountId },
          data: { externalRef: accounts[0].key },
        });
      }
    }
    map.set(accounts[0].key, fallbackAccountId);
    return map;
  }

  for (const account of accounts) {
    const known = await db.account.findUnique({
      where: { profileId_externalRef: { profileId, externalRef: account.key } },
    });
    if (known) {
      map.set(account.key, known.id);
      continue;
    }

    // Une reference de carte est masquee facon "4810********8543" : c'est le
    // signe d'une carte, pas d'un compte courant.
    const looksLikeCard = /\*{2,}/.test(account.key);
    let name = account.label || account.key;
    // Le nom est unique en base : on desambiguise plutot que d'echouer.
    let suffix = 0;
    while (await db.account.findFirst({ where: { profileId, name } })) {
      suffix += 1;
      name = `${account.label || account.key} (${suffix})`;
    }

    const created = await db.account.create({
      data: {
        profileId,
        name,
        kind: looksLikeCard ? 'CARD' : 'CHECKING',
        externalRef: account.key,
      },
    });
    map.set(account.key, created.id);
  }

  return map;
}

export interface IngestSummary {
  batchId: string;
  profile: string;
  format: 'CSV' | 'OFX' | 'QIF';
  parsed: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  warnings: { line: number; message: string }[];
  categorized: { byRule: number; byAi: number; unset: number };
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Repartition par compte quand le fichier en contenait plusieurs. */
  accounts: { name: string; inserted: number; balanceCents: number | null }[];
  /** Operations marquees virement interne d'apres la categorie de la banque. */
  internalMarked: number;
}

export async function ingestFile(
  profileId: string,
  accountId: string,
  filename: string,
  buffer: Buffer,
): Promise<IngestSummary> {
  // Le compte doit appartenir au profil : c'est le seul point d'entree par
  // lequel un fichier peut ecrire des operations, il doit donc etre etanche.
  const account = await db.account.findFirst({
    where: { id: accountId, profileId },
  });
  if (!account) throw new ImportError('Compte introuvable.');

  const result = parseFile(filename, buffer);

  // Chaque ligne part sur SON compte. L'empreinte inclut l'identifiant du
  // compte : deux operations identiques sur deux comptes differents restent
  // deux operations distinctes.
  const accountByKey = await resolveAccounts(profileId, accountId, result.accounts);
  const accountIdFor = (row: ParsedRow): string =>
    (row.accountKey ? accountByKey.get(row.accountKey) : undefined) ?? accountId;

  const ordinals = assignOrdinals(result.rows);
  const fingerprints = result.rows.map((row, i) =>
    fingerprintOf(accountIdFor(row), row, ordinals[i]),
  );

  // Une seule requete pour savoir ce qui existe deja.
  const existing = await db.transaction.findMany({
    where: { profileId, fingerprint: { in: fingerprints } },
    select: { fingerprint: true },
  });
  const known = new Set(existing.map((e) => e.fingerprint));

  const toInsert = result.rows
    .map((row, i) => ({ row, fingerprint: fingerprints[i] }))
    .filter(({ fingerprint }) => !known.has(fingerprint));

  const duplicates = result.rows.length - toInsert.length;

  // Categorisation avant insertion : on evite un second passage sur la base.
  const decisions = await categorizeRows(
    profileId,
    toInsert.map(({ row }) => ({
      rawLabel: row.rawLabel,
      amountCents: row.amountCents,
      date: row.date,
      bankCategory: row.bankCategory,
    })),
  );

  const batch = await db.importBatch.create({
    data: {
      profileId,
      accountId,
      filename,
      format: result.format,
      profileUsed: result.profile,
      rowsParsed: result.rows.length,
      rowsInserted: toInsert.length,
      rowsDuplicate: duplicates,
      rowsRejected: result.warnings.length,
      warnings: result.warnings as unknown as Prisma.InputJsonValue,
    },
  });

  let internalMarked = 0;

  if (toInsert.length > 0) {
    await db.transaction.createMany({
      data: toInsert.map(({ row, fingerprint }, i) => {
        // Le prelevement mensuel d'une carte a debit differe n'est pas une
        // depense : c'est le reglement d'achats deja comptes sur la carte. La
        // banque le range dans "Mouvements internes", on lui fait confiance.
        const isInternal = /mouvements? internes/i.test(row.bankCategory ?? '');
        if (isInternal) internalMarked += 1;

        return {
          profileId,
          accountId: accountIdFor(row),
          date: dateOnly(row.date),
          valueDate: row.valueDate ? dateOnly(row.valueDate) : null,
          amount: new Prisma.Decimal(row.amountCents).dividedBy(100),
          rawLabel: row.rawLabel,
          label: cleanLabel(row.rawLabel),
          merchant: guessMerchant(row.rawLabel),
          categoryId: decisions[i].categoryId,
          categorySource: decisions[i].source,
          aiConfidence: decisions[i].confidence ?? null,
          isTransfer: isInternal,
          fingerprint,
          importBatchId: batch.id,
        };
      }),
      skipDuplicates: true,
    });
  }

  // --- Ancrage du solde -----------------------------------------------------
  //
  // Un solde declare vaut mieux qu'un cumul de mouvements, qui derive des
  // qu'une operation manque. L'OFX le donne globalement ; les CSV qui portent
  // une colonne de solde le donnent par compte, ligne a ligne : on retient la
  // valeur de l'operation la plus recente de chaque compte.
  const balanceByAccount = new Map<string, { cents: number; date: Date }>();
  for (const row of result.rows) {
    if (row.balanceCents === undefined) continue;
    const target = accountIdFor(row);
    const current = balanceByAccount.get(target);
    if (!current || current.date < row.date) {
      balanceByAccount.set(target, { cents: row.balanceCents, date: row.date });
    }
  }

  if (result.statedBalanceCents !== undefined) {
    balanceByAccount.set(accountId, {
      cents: result.statedBalanceCents,
      date: result.statedBalanceDate ?? new Date(),
    });
  }

  for (const [targetId, balance] of balanceByAccount) {
    const target = await db.account.findFirst({ where: { id: targetId, profileId } });
    if (!target) continue;
    if (target.statedBalanceDate && target.statedBalanceDate >= balance.date) continue;
    await db.account.update({
      where: { id: targetId },
      data: {
        statedBalance: new Prisma.Decimal(balance.cents).dividedBy(100),
        statedBalanceDate: dateOnly(balance.date),
      },
    });
  }

  const dates = result.rows.map((r) => r.date.getTime());
  const counts = { byRule: 0, byAi: 0, unset: 0 };
  for (const d of decisions) {
    if (d.source === 'AI') counts.byAi += 1;
    else if (d.categoryId) counts.byRule += 1;
    else counts.unset += 1;
  }

  // Repartition par compte, pour que l'ecran d'import montre ce qui est parti ou.
  const perAccount = new Map<string, number>();
  for (const { row } of toInsert) {
    const target = accountIdFor(row);
    perAccount.set(target, (perAccount.get(target) ?? 0) + 1);
  }
  const accountsSummary: IngestSummary['accounts'] = [];
  for (const [targetId, count] of perAccount) {
    const target = await db.account.findFirst({ where: { id: targetId, profileId } });
    if (!target) continue;
    accountsSummary.push({
      name: target.name,
      inserted: count,
      balanceCents: target.statedBalance
        ? Math.round(target.statedBalance.toNumber() * 100)
        : null,
    });
  }

  return {
    batchId: batch.id,
    profile: result.profile,
    format: result.format,
    parsed: result.rows.length,
    inserted: toInsert.length,
    duplicates,
    rejected: result.warnings.length,
    warnings: result.warnings,
    categorized: counts,
    periodStart: dates.length ? new Date(Math.min(...dates)) : null,
    periodEnd: dates.length ? new Date(Math.max(...dates)) : null,
    accounts: accountsSummary.sort((a, b) => b.inserted - a.inserted),
    internalMarked,
  };
}

/**
 * Detecte les virements internes entre deux comptes suivis, pour ne pas les
 * compter comme des depenses. Critere : montants opposes, ecart de date <= 3
 * jours, comptes differents, pas deja apparies.
 */
export async function detectInternalTransfers(
  profileId: string,
  windowDays = 3,
): Promise<number> {
  const candidates = await db.transaction.findMany({
    where: { profileId, isTransfer: false, transferPairId: null },
    select: { id: true, accountId: true, date: true, amount: true },
    orderBy: { date: 'asc' },
  });

  const used = new Set<string>();
  let paired = 0;

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (used.has(a.id) || a.amount.isZero() || a.amount.isPositive()) continue;
    const target = a.amount.negated();

    for (let j = 0; j < candidates.length; j++) {
      const b = candidates[j];
      if (b.id === a.id || used.has(b.id)) continue;
      if (b.accountId === a.accountId) continue;
      if (!b.amount.equals(target)) continue;
      const gap = Math.abs(b.date.getTime() - a.date.getTime()) / 86_400_000;
      if (gap > windowDays) continue;

      used.add(a.id);
      used.add(b.id);
      await db.$transaction([
        db.transaction.update({
          where: { id: a.id },
          data: { isTransfer: true, transferPairId: b.id },
        }),
        db.transaction.update({
          where: { id: b.id },
          data: { isTransfer: true, transferPairId: a.id },
        }),
      ]);
      paired += 1;
      break;
    }
  }

  return paired;
}

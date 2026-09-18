/**
 * Moteur de recommandations d'economies.
 *
 * Choix assume : les recommandations sont DETERMINISTES. Chacune sort d'une
 * regle explicite, chiffree, avec les operations qui la justifient. Aucune n'est
 * generee par un modele de langage.
 *
 * La raison est simple : une recommandation financiere qu'on ne peut pas
 * verifier ne vaut rien. Ici, chaque suggestion porte son calcul et la liste des
 * operations concernees ; on peut la contredire en trente secondes.
 */

import { db } from '../db';
import { monthRange, lastMonths, addMonths, type MonthKey } from '@/lib/dates';
import { relativeGap } from '@/lib/normalize';
import { listSubscriptions, monthlyEquivalentCents } from './recurring';

export type RecommendationKind =
  | 'DUPLICATE_SUBSCRIPTION'
  | 'PRICE_INCREASE'
  | 'DORMANT_SUBSCRIPTION'
  | 'CATEGORY_DRIFT'
  | 'HIGH_FEES'
  | 'FREQUENT_SMALL_SPEND'
  | 'BUDGET_MISMATCH';

export interface Recommendation {
  kind: RecommendationKind;
  title: string;
  detail: string;
  /** Economie mensuelle potentielle, en centimes. Null si non chiffrable. */
  monthlySavingCents: number | null;
  /** Ce sur quoi repose la recommandation, pour pouvoir la verifier. */
  evidence: string[];
  severity: 'info' | 'warn';
}

/** Familles d'abonnements ou payer deux fournisseurs est rarement volontaire. */
const OVERLAP_FAMILIES: { name: string; patterns: string[] }[] = [
  { name: 'musique en streaming', patterns: ['SPOTIFY', 'DEEZER', 'APPLE MUSIC', 'YOUTUBE PREMIUM', 'AMAZON MUSIC', 'QOBUZ', 'TIDAL'] },
  { name: 'video en streaming', patterns: ['NETFLIX', 'DISNEY', 'PRIME VIDEO', 'CANAL', 'OCS', 'PARAMOUNT', 'APPLE TV', 'MAX'] },
  { name: 'stockage en ligne', patterns: ['ICLOUD', 'GOOGLE ONE', 'DROPBOX', 'ONEDRIVE', 'PCLOUD'] },
  { name: 'salle de sport', patterns: ['BASIC FIT', 'FITNESS PARK', 'NEONESS', 'KEEP COOL', 'ON AIR'] },
  { name: 'VPN', patterns: ['NORDVPN', 'EXPRESSVPN', 'SURFSHARK', 'PROTONVPN', 'CYBERGHOST'] },
];

export async function buildRecommendations(
  profileId: string,
  month: MonthKey,
  monthStartDay = 1,
): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  const subscriptions = await listSubscriptions(profileId);

  // --- 1. Doublons d'abonnements ------------------------------------------
  for (const family of OVERLAP_FAMILIES) {
    const matches = subscriptions.filter((s) =>
      family.patterns.some((p) =>
        `${s.label} ${s.merchant ?? ''}`.toUpperCase().includes(p),
      ),
    );
    if (matches.length < 2) continue;

    // On propose d'abandonner le moins cher : garder le plus cher suppose qu'il
    // rend plus de services. C'est discutable, donc on donne les deux chiffres.
    const sorted = [...matches].sort(
      (a, b) => Math.abs(a.monthlyEquivalentCents) - Math.abs(b.monthlyEquivalentCents),
    );
    const cheapest = sorted[0];
    out.push({
      kind: 'DUPLICATE_SUBSCRIPTION',
      title: `${matches.length} abonnements de ${family.name}`,
      detail:
        `Tu paies ${matches.length} services de ${family.name} en parallele. ` +
        `En resilier un libere entre ${Math.abs(cheapest.monthlyEquivalentCents) / 100} € ` +
        `et ${Math.abs(sorted[sorted.length - 1].monthlyEquivalentCents) / 100} € par mois.`,
      monthlySavingCents: Math.abs(cheapest.monthlyEquivalentCents),
      evidence: matches.map(
        (s) =>
          `${s.label} — ${(Math.abs(s.monthlyEquivalentCents) / 100).toFixed(2)} €/mois equivalent`,
      ),
      severity: 'warn',
    });
  }

  // --- 2. Hausses de tarif -------------------------------------------------
  for (const s of subscriptions) {
    if (!s.priceIncrease) continue;
    if (s.priceIncrease.percent < 0.08) continue; // sous 8 %, c'est du bruit
    const monthlyDelta = Math.abs(
      monthlyEquivalentCents(s.priceIncrease.toCents, s.frequency) -
        monthlyEquivalentCents(s.priceIncrease.fromCents, s.frequency),
    );
    out.push({
      kind: 'PRICE_INCREASE',
      title: `${s.merchant ?? s.label} a augmente de ${(s.priceIncrease.percent * 100).toFixed(0)} %`,
      detail:
        `Le montant est passe de ${(Math.abs(s.priceIncrease.fromCents) / 100).toFixed(2)} € ` +
        `a ${(Math.abs(s.priceIncrease.toCents) / 100).toFixed(2)} €, ` +
        `soit ${(monthlyDelta / 100).toFixed(2)} € de plus par mois ` +
        `(${((monthlyDelta * 12) / 100).toFixed(0)} € sur un an).`,
      monthlySavingCents: monthlyDelta,
      evidence: [
        `${s.occurrences} prelevements observes`,
        `Dernier le ${s.lastSeen.toISOString().slice(0, 10)}`,
      ],
      severity: 'warn',
    });
  }

  // --- 3. Abonnements dormants --------------------------------------------
  // Un abonnement preleve regulierement mais dont l'usage ne se voit nulle part
  // ailleurs : impossible a prouver depuis un releve. On se limite donc au cas
  // verifiable — l'abonnement continue alors que la serie est marquee arretee.
  const ended = await db.recurringSeries.findMany({
    where: { profileId, isSubscription: true, status: 'ENDED' },
  });
  for (const s of ended) {
    const monthly = Math.abs(
      monthlyEquivalentCents(Math.round(s.amountLast.toNumber() * 100), s.frequency),
    );
    if (monthly < 300) continue;
    out.push({
      kind: 'DORMANT_SUBSCRIPTION',
      title: `${s.merchant ?? s.label} : plus de prelevement depuis ${s.lastSeen.toISOString().slice(0, 10)}`,
      detail:
        "Le prelevement a cesse. Soit l'abonnement est resilie — rien a faire —, " +
        'soit le libelle a change et la serie doit etre rattachee a la main.',
      monthlySavingCents: null,
      evidence: [`${s.occurrences} prelevements avant l'arret`],
      severity: 'info',
    });
  }

  // --- 4. Derive par categorie --------------------------------------------
  const months = lastMonths(addMonths(month, -1), 3);
  const categoryTotals = new Map<string, { name: string; values: number[] }>();

  for (const m of months) {
    const { start, end } = monthRange(m, monthStartDay);
    const rows = await db.transaction.groupBy({
      by: ['categoryId'],
      where: { profileId, date: { gte: start, lt: end }, isTransfer: false, amount: { lt: 0 } },
      _sum: { amount: true },
    });
    for (const row of rows) {
      if (!row.categoryId) continue;
      const entry = categoryTotals.get(row.categoryId) ?? { name: '', values: [] };
      entry.values.push(Math.abs(Math.round((row._sum.amount?.toNumber() ?? 0) * 100)));
      categoryTotals.set(row.categoryId, entry);
    }
  }

  const { start: curStart, end: curEnd } = monthRange(month, monthStartDay);
  const currentRows = await db.transaction.groupBy({
    by: ['categoryId'],
    where: {
      profileId,
      date: { gte: curStart, lt: curEnd },
      isTransfer: false,
      amount: { lt: 0 },
    },
    _sum: { amount: true },
  });

  for (const row of currentRows) {
    if (!row.categoryId) continue;
    const history = categoryTotals.get(row.categoryId);
    if (!history || history.values.length < 3) continue;
    const avg = history.values.reduce((s, v) => s + v, 0) / history.values.length;
    const current = Math.abs(Math.round((row._sum.amount?.toNumber() ?? 0) * 100));
    if (avg < 2000) continue; // sous 20 €/mois, la derive n'a pas d'interet
    if (current <= avg * 1.35) continue;

    const category = await db.category.findFirst({
      where: { id: row.categoryId, profileId },
    });
    if (!category) continue;

    out.push({
      kind: 'CATEGORY_DRIFT',
      title: `${category.name} : +${(((current - avg) / avg) * 100).toFixed(0)} % ce mois-ci`,
      detail:
        `${(current / 100).toFixed(0)} € contre ${(avg / 100).toFixed(0)} € en moyenne ` +
        `sur les 3 mois precedents, soit ${((current - avg) / 100).toFixed(0)} € de plus.`,
      monthlySavingCents: current - Math.round(avg),
      evidence: history.values.map(
        (v, i) => `${months[i]} : ${(v / 100).toFixed(0)} €`,
      ),
      severity: 'info',
    });
  }

  // --- 5. Frais bancaires --------------------------------------------------
  const feesCategory = await db.category.findFirst({
    where: { profileId, name: 'Frais bancaires' },
  });
  if (feesCategory) {
    const twelve = lastMonths(month, 12);
    const { start } = monthRange(twelve[0], monthStartDay);
    const fees = await db.transaction.aggregate({
      where: { profileId, categoryId: feesCategory.id, date: { gte: start }, amount: { lt: 0 } },
      _sum: { amount: true },
      _count: true,
    });
    const totalCents = Math.abs(Math.round((fees._sum.amount?.toNumber() ?? 0) * 100));
    if (totalCents > 6000) {
      out.push({
        kind: 'HIGH_FEES',
        title: `${(totalCents / 100).toFixed(0)} € de frais bancaires sur 12 mois`,
        detail:
          `${fees._count} operations de frais. Les banques en ligne facturent ` +
          "generalement zero frais de tenue de compte : c'est le poste le plus " +
          'simple a ramener a zero.',
        monthlySavingCents: Math.round(totalCents / 12),
        evidence: [`${fees._count} operations sur 12 mois`],
        severity: 'warn',
      });
    }
  }

  // --- 6. Petites depenses repetees ---------------------------------------
  const { start: mStart, end: mEnd } = monthRange(month, monthStartDay);
  const small = await db.transaction.findMany({
    where: {
      profileId,
      date: { gte: mStart, lt: mEnd },
      isTransfer: false,
      amount: { lt: 0, gt: -2500 },
    },
    select: { merchant: true, amount: true },
  });
  const byMerchant = new Map<string, { count: number; totalCents: number }>();
  for (const tx of small) {
    if (!tx.merchant) continue;
    const entry = byMerchant.get(tx.merchant) ?? { count: 0, totalCents: 0 };
    entry.count += 1;
    entry.totalCents += Math.abs(Math.round(tx.amount.toNumber() * 100));
    byMerchant.set(tx.merchant, entry);
  }
  for (const [merchant, { count, totalCents }] of byMerchant) {
    if (count < 8 || totalCents < 5000) continue;
    out.push({
      kind: 'FREQUENT_SMALL_SPEND',
      title: `${merchant} : ${count} petits achats ce mois-ci`,
      detail:
        `${(totalCents / 100).toFixed(0)} € cumules en ${count} operations, ` +
        `soit ${(totalCents / count / 100).toFixed(2)} € en moyenne. ` +
        'Ce type de depense passe inapercu individuellement.',
      monthlySavingCents: Math.round(totalCents * 0.3),
      evidence: [`${count} operations`, `${(totalCents / 100).toFixed(2)} € au total`],
      severity: 'info',
    });
  }

  // --- 7. Budgets systematiquement faux ------------------------------------
  const budgets = await db.budget.findMany({
    where: { profileId, month },
    include: { category: true },
  });
  for (const budget of budgets) {
    const history = categoryTotals.get(budget.categoryId);
    if (!history || history.values.length < 3) continue;
    const avg = history.values.reduce((s, v) => s + v, 0) / history.values.length;
    const budgetCents = Math.round(budget.amount.toNumber() * 100);
    if (budgetCents === 0) continue;
    if (relativeGap(avg, budgetCents) < 0.4) continue;

    out.push({
      kind: 'BUDGET_MISMATCH',
      title: `Budget "${budget.category.name}" decorrele du reel`,
      detail:
        `Budget fixe a ${(budgetCents / 100).toFixed(0)} €, depense moyenne ` +
        `${(avg / 100).toFixed(0)} € sur 3 mois. Un budget qu'on depasse ` +
        "systematiquement ne sert a rien : autant l'ajuster.",
      monthlySavingCents: null,
      evidence: history.values.map((v, i) => `${months[i]} : ${(v / 100).toFixed(0)} €`),
      severity: 'info',
    });
  }

  // Les recommandations chiffrees d'abord, du plus gros gain au plus petit.
  return out.sort((a, b) => {
    if (a.monthlySavingCents === null && b.monthlySavingCents === null) return 0;
    if (a.monthlySavingCents === null) return 1;
    if (b.monthlySavingCents === null) return -1;
    return b.monthlySavingCents - a.monthlySavingCents;
  });
}

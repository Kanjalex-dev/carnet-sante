/**
 * Previsionnel de solde de fin de mois.
 *
 * Le solde projete = solde connu aujourd'hui + echeances recurrentes restantes
 * + estimation des depenses variables du reste du mois.
 *
 * Deux precautions importantes :
 *
 *  1. On part du solde DECLARE par le dernier releve quand il existe, et on
 *     n'ajoute que les mouvements posterieurs. Cumuler les mouvements depuis
 *     l'origine derive des qu'une operation manque.
 *  2. Les depenses variables sont estimees a partir du rythme journalier des
 *     mois precedents, hors recurrences (sinon on les compterait deux fois).
 *
 * Ce previsionnel est une estimation, pas une promesse. L'ecart type observe
 * est renvoye pour que l'interface puisse afficher une fourchette plutot qu'un
 * chiffre unique faussement precis.
 */

import { db } from '../db';
import {
  monthRange,
  addDays,
  dateOnly,
  lastMonths,
  addMonths,
  type MonthKey,
} from '@/lib/dates';

export interface UpcomingItem {
  seriesId: string;
  label: string;
  amountCents: number;
  expectedDate: Date;
  frequency: string;
  confidence: number;
  isSubscription: boolean;
}

export interface ForecastResult {
  month: MonthKey;
  /** Point de depart : solde connu et sa date. */
  currentBalanceCents: number;
  balanceAsOf: Date;
  balanceSource: 'releve' | 'cumul';
  upcoming: UpcomingItem[];
  upcomingTotalCents: number;
  /** Depenses variables estimees d'ici la fin du mois. */
  estimatedVariableCents: number;
  projectedBalanceCents: number;
  /** Fourchette a environ un ecart type. */
  projectedLowCents: number;
  projectedHighCents: number;
  daysRemaining: number;
  /** Jour ou le solde projete passe sous zero, si cela arrive. */
  negativeOn: Date | null;
  dailyPath: { date: string; balanceCents: number }[];
}

async function currentBalance(profileId: string): Promise<{
  cents: number;
  asOf: Date;
  source: 'releve' | 'cumul';
}> {
  const accounts = await db.account.findMany({
    where: { profileId, isActive: true, kind: { in: ['CHECKING', 'CARD'] } },
  });

  // Cas favorable : au moins un compte porte un solde declare par un releve.
  const anchored = accounts.filter((a) => a.statedBalance && a.statedBalanceDate);
  if (anchored.length > 0) {
    let total = 0;
    let asOf = anchored[0].statedBalanceDate!;
    for (const account of anchored) {
      total += Math.round(account.statedBalance!.toNumber() * 100);
      if (account.statedBalanceDate! < asOf) asOf = account.statedBalanceDate!;
    }
    // Mouvements survenus apres la date d'ancrage.
    const after = await db.transaction.aggregate({
      where: {
        accountId: { in: anchored.map((a) => a.id) },
        date: { gt: asOf },
      },
      _sum: { amount: true },
    });
    total += Math.round((after._sum.amount?.toNumber() ?? 0) * 100);

    // Comptes sans ancrage : on cumule, faute de mieux.
    const others = accounts.filter((a) => !a.statedBalance || !a.statedBalanceDate);
    if (others.length > 0) {
      const sum = await db.transaction.aggregate({
        where: { accountId: { in: others.map((a) => a.id) } },
        _sum: { amount: true },
      });
      total += Math.round((sum._sum.amount?.toNumber() ?? 0) * 100);
    }
    return { cents: total, asOf: new Date(), source: 'releve' };
  }

  const sum = await db.transaction.aggregate({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    _sum: { amount: true },
  });
  return {
    cents: Math.round((sum._sum.amount?.toNumber() ?? 0) * 100),
    asOf: new Date(),
    source: 'cumul',
  };
}

/**
 * Series projetees explicitement dans le previsionnel.
 *
 * Piege a eviter : le detecteur de recurrences rattache aussi les courses
 * hebdomadaires ou les cafes quotidiens a une "serie". Si l'on exclut des
 * depenses variables TOUTE transaction rattachee a une serie, ces depenses
 * disparaissent du previsionnel sans etre reprojetees pour autant — et le solde
 * de fin de mois est massivement surestime.
 *
 * On ne projette donc a la ligne que ce qui est reellement une echeance : les
 * abonnements et prelevements fixes, plus les entrees d'argent regulieres
 * (salaire). Tout le reste alimente le rythme journalier.
 */
async function projectableSeriesIds(profileId: string): Promise<Set<string>> {
  const series = await db.recurringSeries.findMany({
    where: { profileId, status: 'ACTIVE' },
    select: { id: true, isSubscription: true, amountAvg: true, frequency: true },
  });

  const regularIncome = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY'];
  return new Set(
    series
      .filter(
        (s) =>
          s.isSubscription ||
          (s.amountAvg.greaterThan(0) && regularIncome.includes(s.frequency)),
      )
      .map((s) => s.id),
  );
}

/**
 * Rythme journalier des depenses variables : total des depenses non projetees
 * des N derniers mois, ramene au jour. On renvoie aussi l'ecart type entre
 * mois, qui donne la largeur de la fourchette.
 */
async function variableDailyRate(
  profileId: string,
  month: MonthKey,
  monthStartDay: number,
  projectable: Set<string>,
  lookback = 3,
): Promise<{ perDayCents: number; stdDevPerDayCents: number }> {
  const months = lastMonths(addMonths(month, -1), lookback);
  const totals: number[] = [];

  for (const m of months) {
    const { start, end } = monthRange(m, monthStartDay);
    const transactions = await db.transaction.findMany({
      where: {
        profileId,
        date: { gte: start, lt: end },
        isTransfer: false,
        amount: { lt: 0 },
        // Seules les echeances reellement projetees a la ligne sont exclues.
        OR: [
          { recurringSeriesId: null },
          { recurringSeriesId: { notIn: [...projectable] } },
        ],
      },
      select: { amount: true },
    });
    const total = transactions.reduce(
      (s, t) => s + Math.abs(Math.round(t.amount.toNumber() * 100)),
      0,
    );
    const days = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000);
    totals.push(total / days);
  }

  if (totals.length === 0) return { perDayCents: 0, stdDevPerDayCents: 0 };
  const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
  const variance =
    totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length;
  return {
    perDayCents: Math.round(mean),
    stdDevPerDayCents: Math.round(Math.sqrt(variance)),
  };
}

export async function forecastMonth(
  profileId: string,
  month: MonthKey,
  monthStartDay = 1,
  now = new Date(),
): Promise<ForecastResult> {
  const { end } = monthRange(month, monthStartDay);
  const today = dateOnly(now);
  const balance = await currentBalance(profileId);

  const daysRemaining = Math.max(
    0,
    Math.ceil((end.getTime() - today.getTime()) / 86_400_000),
  );

  // Echeances attendues d'ici la fin du mois. Uniquement les series projetables :
  // un rythme de courses hebdomadaires n'est pas une echeance, il est deja
  // couvert par le rythme journalier des depenses variables.
  const projectable = await projectableSeriesIds(profileId);
  const series = await db.recurringSeries.findMany({
    where: {
      profileId,
      status: 'ACTIVE',
      nextExpected: { not: null },
      id: { in: [...projectable] },
    },
  });

  const upcoming: UpcomingItem[] = [];
  for (const s of series) {
    let expected = s.nextExpected!;
    // Une serie dont l'echeance est passee sans mouvement : on la reporte au
    // prochain creneau plutot que de l'ignorer.
    const stepDays: Record<string, number> = {
      WEEKLY: 7,
      BIWEEKLY: 14,
      MONTHLY: 30,
      BIMONTHLY: 61,
      QUARTERLY: 91,
      SEMIANNUAL: 182,
      ANNUAL: 365,
      IRREGULAR: 30,
    };
    const step = stepDays[s.frequency] ?? 30;
    let guard = 0;
    while (expected < today && guard < 24) {
      expected = addDays(expected, step);
      guard += 1;
    }
    if (expected >= end) continue;

    upcoming.push({
      seriesId: s.id,
      label: s.label,
      amountCents: Math.round(s.amountLast.toNumber() * 100),
      expectedDate: expected,
      frequency: s.frequency,
      confidence: s.confidence,
      isSubscription: s.isSubscription,
    });
  }
  upcoming.sort((a, b) => a.expectedDate.getTime() - b.expectedDate.getTime());

  const upcomingTotalCents = upcoming.reduce((s, u) => s + u.amountCents, 0);

  const { perDayCents, stdDevPerDayCents } = await variableDailyRate(
    profileId,
    month,
    monthStartDay,
    projectable,
  );
  const estimatedVariableCents = -perDayCents * daysRemaining;
  const uncertaintyCents = stdDevPerDayCents * daysRemaining;

  const projectedBalanceCents =
    balance.cents + upcomingTotalCents + estimatedVariableCents;

  // Trajectoire jour par jour, pour le graphique et pour reperer le jour ou
  // le solde passe sous zero.
  const dailyPath: { date: string; balanceCents: number }[] = [];
  let running = balance.cents;
  let negativeOn: Date | null = null;

  for (let d = 0; d <= daysRemaining; d++) {
    const day = addDays(today, d);
    const dayKey = day.toISOString().slice(0, 10);
    for (const item of upcoming) {
      if (item.expectedDate.toISOString().slice(0, 10) === dayKey) {
        running += item.amountCents;
      }
    }
    if (d > 0) running -= perDayCents;
    if (running < 0 && negativeOn === null) negativeOn = day;
    dailyPath.push({ date: dayKey, balanceCents: Math.round(running) });
  }

  return {
    month,
    currentBalanceCents: balance.cents,
    balanceAsOf: balance.asOf,
    balanceSource: balance.source,
    upcoming,
    upcomingTotalCents,
    estimatedVariableCents,
    projectedBalanceCents: Math.round(projectedBalanceCents),
    projectedLowCents: Math.round(projectedBalanceCents - uncertaintyCents),
    projectedHighCents: Math.round(projectedBalanceCents + uncertaintyCents),
    daysRemaining,
    negativeOn,
    dailyPath,
  };
}

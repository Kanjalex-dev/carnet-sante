/**
 * Consolidation patrimoniale, performance, et signaux d'arbitrage.
 *
 * Position de principe sur les "recommandations d'arbitrage" : elles sont
 * calculees par des regles explicites, jamais generees par un modele de langage.
 *
 * Un LLM qui produit "reallouer 15 % vers les obligations" fabrique une phrase
 * plausible, pas une analyse. Il n'a ni backtest, ni modele de risque, ni acces
 * a la situation fiscale, et son erreur coute de l'argent reel. Ce qui est
 * calculable ici et utile : l'ecart entre l'allocation reelle et l'allocation
 * cible, la concentration sur une ligne, et l'ecart de performance a un indice.
 * Ces trois signaux se verifient en trente secondes. C'est ce qui est produit.
 */

import type { AssetClass } from '@prisma/client';
import { db } from '../db';
import { dateOnly, addDays } from '@/lib/dates';
import { getQuoteSeries, rebase100 } from './quotes';

export interface AllocationSlice {
  assetClass: AssetClass;
  label: string;
  valueCents: number;
  share: number;
}

export interface NetWorthSummary {
  totalCents: number;
  investedCents: number | null;
  gainCents: number | null;
  gainPercent: number | null;
  bySource: {
    id: string;
    provider: string;
    label: string;
    valueCents: number;
    share: number;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
    unofficial: boolean;
  }[];
  allocation: AllocationSlice[];
  /** Evolution depuis la veille, la semaine, le mois, l'an. */
  changes: {
    day: { cents: number; percent: number } | null;
    week: { cents: number; percent: number } | null;
    month: { cents: number; percent: number } | null;
    year: { cents: number; percent: number } | null;
  };
  asOf: Date;
}

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  EQUITY: 'Actions',
  ETF: 'ETF',
  BOND: 'Obligations',
  EURO_FUND: 'Fonds euros',
  REAL_ESTATE: 'Immobilier',
  CRYPTO: 'Crypto',
  CASH: 'Liquidites',
  OTHER: 'Autres',
};

const UNOFFICIAL_PROVIDERS = new Set(['TRADE_REPUBLIC']);

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Valeur du patrimoine a une date passee.
 *
 * On lit UNIQUEMENT les points consolides (`assetAccountId = null`), enregistres
 * a chaque synchronisation. Une premiere version additionnait le dernier releve
 * de chaque source : quand une source n'avait pas encore de releve a la date
 * visee, le passe etait calcule sur moins de sources que le present, et
 * l'evolution affichee etait absurde (« +68 % en 24 h » a la premiere
 * synchronisation d'un second compte).
 *
 * Conséquence assumée : tant qu'aucun point consolide n'existe avant la date,
 * on renvoie null et l'interface affiche « — ». Mieux vaut un tiret qu'un
 * pourcentage faux.
 */
async function consolidatedAt(profileId: string, date: Date): Promise<number | null> {
  const snapshot = await db.valuationSnapshot.findFirst({
    where: { profileId, assetAccountId: null, date: { lte: dateOnly(date) } },
    orderBy: { date: 'desc' },
  });
  return snapshot ? toCents(snapshot.totalValue.toNumber()) : null;
}

export async function getNetWorth(profileId: string): Promise<NetWorthSummary> {
  const accounts = await db.assetAccount.findMany({
    where: { profileId, isActive: true },
    include: {
      holdings: true,
      snapshots: { orderBy: { date: 'desc' }, take: 1 },
    },
  });

  const bySource = accounts.map((account) => {
    const fromHoldings = account.holdings.reduce(
      (sum, h) => sum + toCents(h.value.toNumber()),
      0,
    );
    const fromSnapshot = account.snapshots[0]
      ? toCents(account.snapshots[0].totalValue.toNumber())
      : 0;
    // Le releve fait foi quand il existe : il inclut les liquidites, que les
    // positions seules ignorent.
    const valueCents = fromSnapshot || fromHoldings;
    return {
      id: account.id,
      provider: account.provider as string,
      label: account.label,
      valueCents,
      share: 0,
      lastSyncAt: account.lastSyncAt,
      lastSyncError: account.lastSyncError,
      unofficial: UNOFFICIAL_PROVIDERS.has(account.provider),
    };
  });

  const totalCents = bySource.reduce((sum, s) => sum + s.valueCents, 0);
  for (const source of bySource) {
    source.share = totalCents > 0 ? source.valueCents / totalCents : 0;
  }

  // Repartition par classe d'actifs.
  const byClass = new Map<AssetClass, number>();
  for (const account of accounts) {
    for (const holding of account.holdings) {
      byClass.set(
        holding.assetClass,
        (byClass.get(holding.assetClass) ?? 0) + toCents(holding.value.toNumber()),
      );
    }
  }
  const allocationTotal = [...byClass.values()].reduce((a, b) => a + b, 0);
  const allocation: AllocationSlice[] = [...byClass.entries()]
    .map(([assetClass, valueCents]) => ({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass],
      valueCents,
      share: allocationTotal > 0 ? valueCents / allocationTotal : 0,
    }))
    .sort((a, b) => b.valueCents - a.valueCents);

  // Versements cumules, quand la source les fournit.
  const investedRows = await db.valuationSnapshot.findMany({
    where: { profileId, assetAccountId: { not: null }, invested: { not: null } },
    orderBy: { date: 'desc' },
  });
  const investedBySource = new Map<string, number>();
  for (const row of investedRows) {
    if (!row.assetAccountId || investedBySource.has(row.assetAccountId)) continue;
    investedBySource.set(row.assetAccountId, toCents(row.invested!.toNumber()));
  }
  const investedCents =
    investedBySource.size > 0
      ? [...investedBySource.values()].reduce((a, b) => a + b, 0)
      : null;

  const now = new Date();
  const [dayAgo, weekAgo, monthAgo, yearAgo] = await Promise.all([
    consolidatedAt(profileId, addDays(now, -1)),
    consolidatedAt(profileId, addDays(now, -7)),
    consolidatedAt(profileId, addDays(now, -30)),
    consolidatedAt(profileId, addDays(now, -365)),
  ]);

  const change = (past: number | null) =>
    past !== null && past > 0
      ? { cents: totalCents - past, percent: (totalCents - past) / past }
      : null;

  return {
    totalCents,
    investedCents,
    gainCents: investedCents !== null ? totalCents - investedCents : null,
    gainPercent:
      investedCents !== null && investedCents > 0
        ? (totalCents - investedCents) / investedCents
        : null,
    bySource,
    allocation,
    changes: {
      day: change(dayAgo),
      week: change(weekAgo),
      month: change(monthAgo),
      year: change(yearAgo),
    },
    asOf: now,
  };
}

/** Enregistre un point d'historique consolide. Appele apres chaque synchronisation. */
export async function snapshotConsolidated(profileId: string): Promise<number> {
  const summary = await getNetWorth(profileId);
  const date = dateOnly(new Date());
  const breakdown: Record<string, number> = {};
  for (const slice of summary.allocation) {
    breakdown[slice.assetClass] = slice.valueCents / 100;
  }

  // Postgres n'applique pas de contrainte d'unicite quand une colonne du couple
  // est NULL : l'upsert Prisma ne peut donc pas cibler la ligne consolidee.
  // On fait la recherche a la main.
  const existing = await db.valuationSnapshot.findFirst({
    where: { profileId, assetAccountId: null, date },
  });
  const payload = {
    totalValue: summary.totalCents / 100,
    invested: summary.investedCents !== null ? summary.investedCents / 100 : null,
    breakdown,
  };
  if (existing) {
    await db.valuationSnapshot.update({ where: { id: existing.id }, data: payload });
  } else {
    await db.valuationSnapshot.create({
      data: { profileId, assetAccountId: null, date, ...payload },
    });
  }

  return summary.totalCents;
}

export interface PerformancePoint {
  date: string;
  portfolioIndex: number;
  benchmarks: Record<string, number>;
}

/**
 * Compare la performance du portefeuille aux indices, en base 100.
 *
 * Limite a enoncer clairement : cette courbe compare des VALORISATIONS, pas des
 * performances au sens strict. Un versement fait monter la courbe du
 * portefeuille sans qu'aucune performance ait ete realisee. Tant que les flux ne
 * sont pas tous connus, la comparaison n'est indicative que sur des periodes
 * sans versement.
 */
export async function comparePerformance(
  profileId: string,
  days = 365,
): Promise<{ series: PerformancePoint[]; warning: string | null }> {
  const from = addDays(new Date(), -days);
  const snapshots = await db.valuationSnapshot.findMany({
    where: { profileId, assetAccountId: null, date: { gte: dateOnly(from) } },
    orderBy: { date: 'asc' },
  });

  if (snapshots.length < 2) {
    return {
      series: [],
      warning:
        "Historique insuffisant : il faut au moins deux points de valorisation. " +
        'Les points sont crees a chaque synchronisation ou saisie.',
    };
  }

  const benchmarks = await db.benchmark.findMany({ where: { enabled: true } });
  const benchmarkSeries = new Map<string, Map<string, number>>();
  for (const b of benchmarks) {
    const points = await getQuoteSeries(b.symbol, from);
    const rebased = rebase100(points);
    benchmarkSeries.set(
      b.key,
      new Map(rebased.map((p) => [p.date.toISOString().slice(0, 10), p.index])),
    );
  }

  const base = snapshots[0].totalValue.toNumber();
  const series: PerformancePoint[] = snapshots.map((s) => {
    const key = s.date.toISOString().slice(0, 10);
    const marks: Record<string, number> = {};
    for (const [benchKey, map] of benchmarkSeries) {
      const value = map.get(key);
      if (value !== undefined) marks[benchKey] = value;
    }
    return {
      date: key,
      portfolioIndex: base > 0 ? (s.totalValue.toNumber() / base) * 100 : 100,
      benchmarks: marks,
    };
  });

  // Detection des versements : un saut de valorisation entre deux points
  // consecutifs qui depasse largement la volatilite normale.
  let hasLikelyContribution = false;
  for (let i = 1; i < snapshots.length; i++) {
    const previous = snapshots[i - 1].totalValue.toNumber();
    const current = snapshots[i].totalValue.toNumber();
    if (previous > 0 && (current - previous) / previous > 0.08) {
      hasLikelyContribution = true;
      break;
    }
  }

  return {
    series,
    warning: hasLikelyContribution
      ? "Un ou plusieurs sauts de valorisation ressemblent a des versements. " +
        "La comparaison a l'indice est faussee sur ces periodes : un versement " +
        "fait monter la courbe sans performance."
      : null,
  };
}

// ---------------------------------------------------------------------------
// Signaux d'arbitrage — deterministes
// ---------------------------------------------------------------------------

export interface TargetAllocation {
  assetClass: AssetClass;
  targetShare: number;
}

/**
 * Allocation cible deduite du profil de risque et de l'horizon.
 *
 * Baree sur une regle simple et lisible : la part actions monte avec le profil
 * de risque et avec l'horizon, le reste va en obligations et fonds euros. Ce
 * n'est PAS un conseil en investissement, c'est une reference contre laquelle
 * mesurer une derive. Elle est modifiable dans les reglages.
 */
export function defaultTargetAllocation(
  riskProfile: number,
  horizonYears: number,
): TargetAllocation[] {
  const risk = Math.min(10, Math.max(1, riskProfile));
  const horizon = Math.min(30, Math.max(1, horizonYears));

  // Part actions : 30 % a 90 %, moderee par un horizon court.
  const horizonFactor = Math.min(1, horizon / 15);
  const equityShare = Math.round((0.3 + (risk - 1) * 0.0667) * horizonFactor * 100) / 100;
  const bounded = Math.min(0.9, Math.max(0.1, equityShare));

  const remainder = 1 - bounded;
  return [
    { assetClass: 'ETF', targetShare: Math.round(bounded * 100) / 100 },
    { assetClass: 'BOND', targetShare: Math.round(remainder * 0.6 * 100) / 100 },
    { assetClass: 'EURO_FUND', targetShare: Math.round(remainder * 0.4 * 100) / 100 },
  ];
}

export interface PortfolioSignal {
  kind: 'DRIFT' | 'CONCENTRATION' | 'CASH_DRAG' | 'BENCHMARK_GAP' | 'STALE_DATA';
  severity: 'info' | 'warn';
  title: string;
  detail: string;
  /** Le calcul complet, pour que le signal soit verifiable. */
  computation: string;
}

/**
 * Produit les signaux du portefeuille. Chaque signal porte son calcul : c'est la
 * condition pour qu'on puisse le contredire.
 */
export async function portfolioSignals(profileId: string): Promise<PortfolioSignal[]> {
  const settings = await db.profile.findUnique({ where: { id: profileId } });
  const summary = await getNetWorth(profileId);
  const signals: PortfolioSignal[] = [];

  if (summary.totalCents === 0) return signals;

  // --- Derive d'allocation -------------------------------------------------
  const targets = defaultTargetAllocation(
    settings?.riskProfile ?? 5,
    settings?.horizonYears ?? 15,
  );
  const actualByClass = new Map(summary.allocation.map((a) => [a.assetClass, a.share]));

  for (const target of targets) {
    const actual = actualByClass.get(target.assetClass) ?? 0;
    const gap = actual - target.targetShare;
    if (Math.abs(gap) < 0.05) continue; // sous 5 points, ce n'est pas une derive

    signals.push({
      kind: 'DRIFT',
      severity: Math.abs(gap) > 0.12 ? 'warn' : 'info',
      title: `${ASSET_CLASS_LABELS[target.assetClass]} : ${gap > 0 ? '+' : ''}${(gap * 100).toFixed(1)} points vs cible`,
      detail:
        `Part actuelle ${(actual * 100).toFixed(1)} %, cible ${(target.targetShare * 100).toFixed(0)} % ` +
        `pour un profil ${settings?.riskProfile ?? 5}/10 a ${settings?.horizonYears ?? 15} ans. ` +
        `Ecart de ${Math.abs((gap * summary.totalCents) / 100 / 100).toFixed(0)} €.`,
      computation:
        `part_actuelle(${(actual * 100).toFixed(2)} %) - cible(${(target.targetShare * 100).toFixed(0)} %) ` +
        `= ${(gap * 100).toFixed(2)} points`,
    });
  }

  // --- Concentration sur une ligne -----------------------------------------
  const holdings = await db.holding.findMany({
    where: { profileId },
    include: { assetAccount: true },
    orderBy: { value: 'desc' },
  });
  for (const holding of holdings.slice(0, 5)) {
    const share = toCents(holding.value.toNumber()) / summary.totalCents;
    if (share < 0.25) continue;
    signals.push({
      kind: 'CONCENTRATION',
      severity: share > 0.4 ? 'warn' : 'info',
      title: `${holding.name} represente ${(share * 100).toFixed(0)} % du patrimoine`,
      detail:
        "Une ligne unique au-dela de 25 % concentre le risque specifique. " +
        "Cela peut etre volontaire — un ETF World large, par exemple, n'est pas " +
        'une ligne concentree malgre son poids.',
      computation: `${holding.value.toFixed(2)} € / ${(summary.totalCents / 100).toFixed(2)} € = ${(share * 100).toFixed(2)} %`,
    });
  }

  // --- Liquidites dormantes ------------------------------------------------
  const cashSlice = summary.allocation.find((a) => a.assetClass === 'CASH');
  if (cashSlice && cashSlice.share > 0.15 && cashSlice.valueCents > 500_000) {
    signals.push({
      kind: 'CASH_DRAG',
      severity: 'info',
      title: `${(cashSlice.share * 100).toFixed(0)} % en liquidites non investies`,
      detail:
        `${(cashSlice.valueCents / 100).toFixed(0)} € dorment sur les comptes-titres. ` +
        "Si ce n'est pas une reserve volontaire en attente d'un point d'entree, " +
        "c'est du rendement laisse de cote.",
      computation: `liquidites(${(cashSlice.valueCents / 100).toFixed(2)} €) / total = ${(cashSlice.share * 100).toFixed(2)} %`,
    });
  }

  // --- Donnees perimees ----------------------------------------------------
  for (const source of summary.bySource) {
    if (!source.lastSyncAt) {
      signals.push({
        kind: 'STALE_DATA',
        severity: 'warn',
        title: `${source.label} : jamais synchronise`,
        detail: "Cette source n'a aucune valorisation. Le patrimoine total est sous-estime.",
        computation: 'lastSyncAt = null',
      });
      continue;
    }
    const ageDays = (Date.now() - source.lastSyncAt.getTime()) / 86_400_000;
    if (ageDays > 40) {
      signals.push({
        kind: 'STALE_DATA',
        severity: 'warn',
        title: `${source.label} : donnees vieilles de ${Math.round(ageDays)} jours`,
        detail: source.unofficial
          ? "Connecteur non officiel : il a probablement cesse de fonctionner. " +
            'Verifier la session, ou saisir la valeur a la main.'
          : 'Saisir une valorisation a jour.',
        computation: `aujourd'hui - derniere_sync = ${Math.round(ageDays)} jours`,
      });
    }
  }

  // --- Ecart au benchmark --------------------------------------------------
  const { series } = await comparePerformance(profileId, 365);
  if (series.length >= 2) {
    const last = series[series.length - 1];
    for (const [key, value] of Object.entries(last.benchmarks)) {
      const gap = last.portfolioIndex - value;
      if (Math.abs(gap) < 8) continue;
      const benchmark = await db.benchmark.findUnique({ where: { key } });
      signals.push({
        kind: 'BENCHMARK_GAP',
        severity: 'info',
        title: `${gap > 0 ? 'Surperformance' : 'Sous-performance'} de ${Math.abs(gap).toFixed(1)} points vs ${benchmark?.label ?? key}`,
        detail:
          `Portefeuille a ${last.portfolioIndex.toFixed(1)}, indice a ${value.toFixed(1)} (base 100). ` +
          'Attention : les versements de la periode faussent cette comparaison.',
        computation: `portefeuille(${last.portfolioIndex.toFixed(2)}) - indice(${value.toFixed(2)}) = ${gap.toFixed(2)}`,
      });
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

export interface ProjectionScenario {
  name: string;
  annualReturn: number;
  points: { year: number; valueCents: number }[];
  finalCents: number;
}

/**
 * Projection de patrimoine par scenario.
 *
 * Simple interet compose, volontairement. Une simulation de Monte-Carlo
 * donnerait des intervalles de confiance d'apparence savante, batis sur une
 * hypothese de rendements normalement distribues que les marches ne respectent
 * pas. Trois scenarios lisibles disent la meme chose sans faire croire a une
 * precision qui n'existe pas.
 *
 * Les taux ci-dessous sont des HYPOTHESES DE TRAVAIL, pas des previsions.
 */
export function projectWealth(
  currentCents: number,
  monthlyContributionCents: number,
  years: number,
): ProjectionScenario[] {
  const scenarios = [
    { name: 'Defavorable', annualReturn: 0.02 },
    { name: 'Median', annualReturn: 0.05 },
    { name: 'Favorable', annualReturn: 0.08 },
  ];

  return scenarios.map((scenario) => {
    const points: { year: number; valueCents: number }[] = [];
    let value = currentCents;
    const monthlyRate = (1 + scenario.annualReturn) ** (1 / 12) - 1;

    points.push({ year: 0, valueCents: Math.round(value) });
    for (let year = 1; year <= years; year++) {
      for (let month = 0; month < 12; month++) {
        value = value * (1 + monthlyRate) + monthlyContributionCents;
      }
      points.push({ year, valueCents: Math.round(value) });
    }

    return {
      name: scenario.name,
      annualReturn: scenario.annualReturn,
      points,
      finalCents: Math.round(value),
    };
  });
}

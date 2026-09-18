/**
 * Detection des depenses recurrentes et des abonnements.
 *
 * Principe : on regroupe les operations par cle de libelle debruitee, puis on
 * regarde la regularite des intervalles entre occurrences. Trois occurrences au
 * minimum — avec deux, on ne distingue pas une recurrence d'une coincidence.
 *
 * Un abonnement est une recurrence dont le montant forme un ou deux paliers
 * stables. C'est cette stabilite qui permet de detecter ensuite les hausses de
 * tarif, qui sont le vrai sujet : un abonnement qui passe de 9,99 € a 13,99 €
 * ne se voit pas a l'oeil nu sur un releve.
 *
 * Deux mecanismes viennent de l'epreuve du feu sur un export bancaire reel de
 * six ans, ou la version initiale ne detectait qu'une seule serie :
 *
 *  - la regularite se mesure autour de la MEDIANE des intervalles, pas de leur
 *    moyenne : une echeance doublee ou sautee ne doit pas tuer la serie ;
 *  - un groupe trop erratique est re-examine palier de montant par palier de
 *    montant, ce qui fait ressortir l'abonnement mensuel noye dans les achats
 *    d'une plateforme (App Store, PayPal, Google Play).
 */

import type { Frequency } from '@prisma/client';
import { db } from '../db';
import { recurringKey, guessMerchant, relativeGap } from '@/lib/normalize';
import { addDays, dateOnly } from '@/lib/dates';

const MIN_OCCURRENCES = 3;

/**
 * Tolerance de regroupement des montants en paliers.
 *
 * Volontairement tres serree : entre deux hausses, un abonnement preleve le
 * meme montant au centime pres. Une tolerance large (15 %, par exemple) fait
 * s'effondrer un panier de courses variant de 48 a 79 € en deux ou trois
 * "paliers", et les courses hebdomadaires passent alors pour un abonnement dont
 * le tarif aurait augmente de 58 %.
 */
const PLATEAU_TOLERANCE = 0.02;

interface Occurrence {
  id: string;
  date: Date;
  amountCents: number;
  rawLabel: string;
  categoryId: string | null;
}

/** Deduit la frequence a partir de l'intervalle median entre occurrences. */
export function inferFrequency(medianDays: number): {
  frequency: Frequency;
  expectedDays: number;
} {
  const table: { frequency: Frequency; days: number; tolerance: number }[] = [
    { frequency: 'WEEKLY', days: 7, tolerance: 2 },
    { frequency: 'BIWEEKLY', days: 14, tolerance: 3 },
    { frequency: 'MONTHLY', days: 30.4, tolerance: 6 },
    { frequency: 'BIMONTHLY', days: 61, tolerance: 9 },
    { frequency: 'QUARTERLY', days: 91, tolerance: 12 },
    { frequency: 'SEMIANNUAL', days: 182, tolerance: 20 },
    { frequency: 'ANNUAL', days: 365, tolerance: 35 },
  ];
  for (const entry of table) {
    if (Math.abs(medianDays - entry.days) <= entry.tolerance) {
      return { frequency: entry.frequency, expectedDays: entry.days };
    }
  }
  return { frequency: 'IRREGULAR', expectedDays: medianDays };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Regroupe des montants en paliers.
 *
 * Point important : un abonnement dont le tarif augmente n'est PAS un montant
 * instable, c'est un montant stable qui a change de palier. Juger la stabilite
 * sur l'ecart min/max ferait perdre exactement les series qu'on veut suivre —
 * celles qui augmentent. On regarde donc le nombre de paliers, pas l'amplitude.
 */
export function clusterAmounts(
  amounts: number[],
  tolerance = 0.05,
): { value: number; count: number }[] {
  if (amounts.length === 0) return [];

  // On travaille sur les montants tries, et l'ancre d'un palier ne bouge PAS.
  //
  // Une premiere version faisait glisser le centre du palier a chaque ajout.
  // Effet de chaine : une suite de montants proches de proche en proche (des
  // courses entre 48 et 83 €) finissait absorbee dans un palier unique, et le
  // panier de courses passait pour un abonnement. Avec une ancre fixe, un
  // continuum produit autant de paliers qu'il a de valeurs distinctes, ce qui
  // est le comportement voulu.
  const sorted = [...amounts].sort((a, b) => a - b);
  const clusters: { anchor: number; count: number; sum: number }[] = [];

  for (const amount of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && relativeGap(current.anchor, amount) <= tolerance) {
      current.count += 1;
      current.sum += amount;
    } else {
      clusters.push({ anchor: amount, count: 1, sum: amount });
    }
  }

  return clusters
    .map((c) => ({ value: Math.round(c.sum / c.count), count: c.count }))
    .sort((a, b) => b.count - a.count);
}

/** Ecart relatif tolere entre un intervalle et l'intervalle median. */
const INTERVAL_TOLERANCE = 0.35;

/**
 * Regularite des intervalles, entre 0 et 1 : la proportion d'echeances qui
 * tombent au rythme median.
 *
 * Une premiere version mesurait le coefficient de variation autour de la
 * MOYENNE. C'est fragile au point d'etre inutilisable sur un vrai releve : il
 * suffit d'un mois a deux prelevements, ou d'une echeance sautee, pour qu'un
 * intervalle vaille 2 ou 60 jours au lieu de 30. La moyenne se decale,
 * l'ecart-type explose, et l'abonnement le plus regulier du monde est rejete.
 * Sur un export reel de six ans, ce seul critere ecartait 47 series sur 73 —
 * c'est-a-dire la quasi-totalite des abonnements.
 *
 * La mediane, elle, ignore les valeurs aberrantes. On compte donc simplement
 * combien d'intervalles s'en approchent : c'est ce qu'on veut dire par
 * "regulier" — la plupart des echeances tombent au bon rythme, meme si une ou
 * deux derapent.
 */
export function regularityOfIntervals(intervals: number[]): number {
  if (intervals.length < 2) return 0;
  const reference = median(intervals);
  if (reference <= 0) return 0;
  const conforming = intervals.filter(
    (v) => Math.abs(v - reference) / reference <= INTERVAL_TOLERANCE,
  ).length;
  return conforming / intervals.length;
}

export interface DetectionResult {
  seriesFound: number;
  subscriptions: number;
  transactionsLinked: number;
}

export async function detectRecurring(
  profileId: string,
  lookbackDays = 540,
): Promise<DetectionResult> {
  const since = addDays(new Date(), -lookbackDays);
  const transactions = await db.transaction.findMany({
    where: { profileId, date: { gte: dateOnly(since) }, isTransfer: false },
    select: {
      id: true,
      date: true,
      amount: true,
      rawLabel: true,
      categoryId: true,
    },
    orderBy: { date: 'asc' },
  });

  const groups = new Map<string, Occurrence[]>();
  for (const tx of transactions) {
    const cents = Math.round(tx.amount.toNumber() * 100);
    // Les entrees d'argent recurrentes (salaire) comptent aussi : elles sont
    // indispensables au previsionnel de solde.
    const key = recurringKey(tx.rawLabel);
    if (key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push({
      id: tx.id,
      date: tx.date,
      amountCents: cents,
      rawLabel: tx.rawLabel,
      categoryId: tx.categoryId,
    });
    groups.set(key, list);
  }

  // ---------------------------------------------------------------------
  // Sous-series a montant constant
  //
  // Certaines plateformes agregent tout sous un libelle unique : "APPLE COM
  // BILL" couvre aussi bien un achat ponctuel a 4,99 € qu'un abonnement iCloud
  // a 0,99 € preleve chaque mois. Le groupe entier est alors irregulier et
  // l'abonnement reste invisible — c'est justement le petit prelevement qu'on
  // oublie de resilier.
  //
  // Quand un groupe est trop erratique pour etre une serie, on regarde donc
  // s'il contient un palier de montant qui, lui, revient a intervalle regulier.
  // Le meme raisonnement vaut pour PayPal, Google Play ou un compte Amazon.
  // ---------------------------------------------------------------------
  const SUBSERIES_MIN_OCCURRENCES = 4;
  const candidates: { key: string; occurrences: Occurrence[] }[] = [];

  for (const [key, occurrences] of groups) {
    candidates.push({ key, occurrences });
    if (occurrences.length < SUBSERIES_MIN_OCCURRENCES * 2) continue;

    const days = [...new Set(occurrences.map((o) => o.date.toISOString().slice(0, 10)))]
      .sort();
    const wholeIntervals: number[] = [];
    for (let i = 1; i < days.length; i++) {
      wholeIntervals.push(
        (new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86_400_000,
      );
    }
    // Un groupe deja regulier n'a pas besoin d'etre decoupe.
    if (regularityOfIntervals(wholeIntervals) >= 0.55) continue;

    for (const cluster of clusterAmounts(
      occurrences.map((o) => o.amountCents),
      PLATEAU_TOLERANCE,
    )) {
      if (cluster.count < SUBSERIES_MIN_OCCURRENCES) continue;
      const subset = occurrences.filter(
        (o) => relativeGap(o.amountCents, cluster.value) <= PLATEAU_TOLERANCE,
      );
      if (subset.length < SUBSERIES_MIN_OCCURRENCES) continue;
      // La cle porte le montant : la sous-serie doit rester distincte du groupe.
      candidates.push({
        key: `${key} @ ${(Math.abs(cluster.value) / 100).toFixed(2)}`,
        occurrences: subset,
      });
    }
  }

  let seriesFound = 0;
  let subscriptions = 0;
  let transactionsLinked = 0;
  const seenKeys = new Set<string>();

  for (const { key, occurrences } of candidates) {
    if (occurrences.length < MIN_OCCURRENCES) continue;
    // Une operation deja rattachee au groupe parent ne doit pas etre reprise
    // par une sous-serie, et inversement : on traite le parent en premier.
    if (seenKeys.has(key)) continue;

    // Les operations d'un meme jour sont des achats multiples, pas une
    // recurrence : on les fusionne pour l'analyse d'intervalles.
    const byDay = new Map<string, Occurrence>();
    for (const o of occurrences) {
      const day = o.date.toISOString().slice(0, 10);
      const existing = byDay.get(day);
      if (existing) existing.amountCents += o.amountCents;
      else byDay.set(day, { ...o });
    }
    const daily = [...byDay.values()].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    if (daily.length < MIN_OCCURRENCES) continue;

    const intervals: number[] = [];
    for (let i = 1; i < daily.length; i++) {
      intervals.push(
        (daily[i].date.getTime() - daily[i - 1].date.getTime()) / 86_400_000,
      );
    }
    const medianInterval = median(intervals);
    if (medianInterval < 5) continue; // trop rapproche pour etre une echeance

    const reg = regularityOfIntervals(intervals);
    if (reg < 0.55) continue; // intervalles trop erratiques

    const { frequency, expectedDays } = inferFrequency(medianInterval);
    if (frequency === 'IRREGULAR' && reg < 0.8) continue;

    const amounts = daily.map((d) => d.amountCents);
    const amountMin = Math.min(...amounts);
    const amountMax = Math.max(...amounts);
    const amountAvg = Math.round(
      amounts.reduce((s, v) => s + v, 0) / amounts.length,
    );
    const amountLast = amounts[amounts.length - 1];

    // Stabilite par paliers : un abonnement a un ou deux tarifs successifs, des
    // courses hebdomadaires ont un montant different a chaque fois.
    const clusters = clusterAmounts(amounts, PLATEAU_TOLERANCE);
    const dominantShare = clusters[0].count / amounts.length;
    // Un palier isole (une seule occurrence) n'est pas un tarif, c'est du bruit.
    const everyClusterRepeats = clusters.every((c) => c.count >= 2);
    const amountStable =
      clusters.length === 1 ||
      // Jusqu'a trois paliers, chacun repete, avec un palier dominant : c'est la
      // signature d'un tarif qui a change une ou deux fois.
      (clusters.length <= 3 &&
        everyClusterRepeats &&
        dominantShare >= 0.4 &&
        amounts.length >= 4);

    const first = daily[0].date;
    const last = daily[daily.length - 1].date;
    const nextExpected = dateOnly(addDays(last, Math.round(expectedDays)));

    const categoryId =
      daily.map((d) => d.categoryId).find((c) => c !== null) ?? null;

    // Un virement d'epargne ou d'investissement est recurrent et de montant
    // stable, mais ce n'est pas un abonnement : le compter dans le "cout des
    // abonnements" rendrait ce total inexploitable.
    let isSavingsTransfer = false;
    if (categoryId) {
      const category = await db.category.findFirst({
        where: { id: categoryId, profileId },
        include: { parent: true },
      });
      const kind = category?.parent?.kind ?? category?.kind;
      isSavingsTransfer = kind === 'TRANSFER';
    }

    // Un abonnement : montant a paliers stables, sortie d'argent, frequence courte.
    const isSubscription =
      amountStable &&
      amountAvg < 0 &&
      !isSavingsTransfer &&
      ['WEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'].includes(
        frequency,
      );

    // Confiance : regularite des intervalles, nombre d'occurrences, stabilite
    // du montant. Elle sert a trier l'affichage, pas a decider seule.
    const confidence = Math.min(
      1,
      reg * 0.5 +
        Math.min(daily.length / 8, 1) * 0.3 +
        (clusters.length === 1 ? 0.2 : amountStable ? 0.12 : 0),
    );

    const series = await db.recurringSeries.upsert({
      where: { profileId_key: { profileId, key } },
      create: {
        profileId,
        key,
        label: daily[daily.length - 1].rawLabel,
        merchant: guessMerchant(daily[daily.length - 1].rawLabel),
        categoryId,
        frequency,
        amountAvg: amountAvg / 100,
        amountLast: amountLast / 100,
        amountMin: amountMin / 100,
        amountMax: amountMax / 100,
        dayOfMonth: last.getUTCDate(),
        occurrences: daily.length,
        firstSeen: first,
        lastSeen: last,
        nextExpected,
        confidence,
        isSubscription,
        status: 'ACTIVE',
      },
      update: {
        label: daily[daily.length - 1].rawLabel,
        merchant: guessMerchant(daily[daily.length - 1].rawLabel),
        categoryId: categoryId ?? undefined,
        frequency,
        amountAvg: amountAvg / 100,
        amountLast: amountLast / 100,
        amountMin: amountMin / 100,
        amountMax: amountMax / 100,
        dayOfMonth: last.getUTCDate(),
        occurrences: daily.length,
        firstSeen: first,
        lastSeen: last,
        nextExpected,
        confidence,
        isSubscription,
      },
    });

    seenKeys.add(key);
    seriesFound += 1;
    if (isSubscription) subscriptions += 1;

    const ids = occurrences.map((o) => o.id);
    const linked = await db.transaction.updateMany({
      where: { profileId, id: { in: ids }, recurringSeriesId: null },
      data: { recurringSeriesId: series.id },
    });
    transactionsLinked += linked.count;
  }

  // Une serie dont la derniere occurrence remonte a plus de trois echeances est
  // consideree comme arretee : l'abonnement a ete resilie, ou le prelevement a
  // change de libelle.
  const stale = await db.recurringSeries.findMany({
    where: { profileId, status: 'ACTIVE' },
  });
  for (const series of stale) {
    if (!series.nextExpected) continue;
    const overdueDays =
      (Date.now() - series.nextExpected.getTime()) / 86_400_000;
    const window = series.frequency === 'ANNUAL' ? 120 : 70;
    if (overdueDays > window) {
      await db.recurringSeries.update({
        where: { id: series.id },
        data: { status: 'ENDED' },
      });
    }
  }

  return { seriesFound, subscriptions, transactionsLinked };
}

/** Cout mensuel equivalent d'une serie, pour comparer des frequences differentes. */
export function monthlyEquivalentCents(
  amountCents: number,
  frequency: Frequency,
): number {
  const perYear: Record<Frequency, number> = {
    WEEKLY: 52,
    BIWEEKLY: 26,
    MONTHLY: 12,
    BIMONTHLY: 6,
    QUARTERLY: 4,
    SEMIANNUAL: 2,
    ANNUAL: 1,
    IRREGULAR: 12,
  };
  return Math.round((amountCents * perYear[frequency]) / 12);
}

/**
 * Categories dont les prelevements recurrents sont des CHARGES FIXES, pas des
 * abonnements.
 *
 * La distinction n'est pas cosmetique : additionner le loyer avec Netflix
 * produit un "cout des abonnements" de 1 700 €/mois, chiffre exact et
 * parfaitement inutile — on ne resilie pas son loyer. Les deux familles sont
 * detectees de la meme facon mais presentees et totalisees separement.
 */
const FIXED_CHARGE_PARENTS = new Set([
  'Logement',
  'Assurances et frais',
  'Impots et taxes',
  'Sante',
]);

export type RecurringKind = 'SUBSCRIPTION' | 'FIXED_CHARGE';

export interface SubscriptionView {
  id: string;
  kind: RecurringKind;
  label: string;
  merchant: string | null;
  categoryName: string | null;
  frequency: Frequency;
  amountLastCents: number;
  monthlyEquivalentCents: number;
  annualCostCents: number;
  lastSeen: Date;
  nextExpected: Date | null;
  occurrences: number;
  confidence: number;
  status: string;
  /** Hausse detectee : ancien montant -> nouveau. */
  priceIncrease: { fromCents: number; toCents: number; percent: number } | null;
}

export async function listSubscriptions(profileId: string): Promise<SubscriptionView[]> {
  const series = await db.recurringSeries.findMany({
    where: { profileId, isSubscription: true, status: { in: ['ACTIVE', 'PAUSED'] } },
    include: { category: { include: { parent: true } } },
    orderBy: { amountAvg: 'asc' },
  });

  return series.map((s) => {
    const lastCents = Math.round(s.amountLast.toNumber() * 100);
    // Les montants sont negatifs : le tarif historique le PLUS BAS est donc la
    // valeur la moins negative des deux bornes. Une hausse se lit comme un
    // montant courant plus negatif que ce plancher.
    const historicalLow = Math.max(
      Math.round(s.amountMin.toNumber() * 100),
      Math.round(s.amountMax.toNumber() * 100),
    );
    let priceIncrease: SubscriptionView['priceIncrease'] = null;
    if (
      Math.abs(lastCents) > Math.abs(historicalLow) &&
      Math.abs(historicalLow) > 0 &&
      relativeGap(lastCents, historicalLow) > 0.05
    ) {
      priceIncrease = {
        fromCents: historicalLow,
        toCents: lastCents,
        percent:
          (Math.abs(lastCents) - Math.abs(historicalLow)) / Math.abs(historicalLow),
      };
    }

    const parentName = s.category?.parent?.name ?? s.category?.name ?? null;
    const kind: RecurringKind =
      parentName && FIXED_CHARGE_PARENTS.has(parentName)
        ? 'FIXED_CHARGE'
        : 'SUBSCRIPTION';

    return {
      id: s.id,
      kind,
      label: s.label,
      merchant: s.merchant,
      categoryName: s.category?.name ?? null,
      frequency: s.frequency,
      amountLastCents: lastCents,
      monthlyEquivalentCents: monthlyEquivalentCents(lastCents, s.frequency),
      annualCostCents: monthlyEquivalentCents(lastCents, s.frequency) * 12,
      lastSeen: s.lastSeen,
      nextExpected: s.nextExpected,
      occurrences: s.occurrences,
      confidence: s.confidence,
      status: s.status,
      priceIncrease,
    };
  });
}

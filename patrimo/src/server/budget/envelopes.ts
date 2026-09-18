/**
 * Mode Enveloppes (facon YNAB).
 *
 * Regle fondatrice : budget base zero. Chaque euro qui entre est affecte a une
 * enveloppe avant d'etre depense. La somme des allocations ne peut pas depasser
 * l'argent reellement disponible, et ce qui n'est pas encore affecte apparait
 * comme "a repartir".
 *
 * Trois notions a ne pas confondre :
 *
 *   allocated  ce que j'ai mis dans l'enveloppe CE mois-ci
 *   spent      ce qui est sorti de l'enveloppe CE mois-ci
 *   available  ce qui reste vraiment = report du mois precedent + allocated - spent
 *
 * Le report est ce qui distingue YNAB d'un simple budget mensuel : un reste de
 * 40 € en octobre est encore la en novembre, et un depassement de -30 € l'est
 * aussi. On ne remet pas les compteurs a zero.
 */

import { db } from '../db';
import {
  monthRange,
  addMonths,
  lastMonths,
  type MonthKey,
} from '@/lib/dates';

export interface EnvelopeState {
  id: string;
  name: string;
  group: string;
  icon: string;
  color: string;
  categoryId: string | null;
  /** Report du mois precedent (peut etre negatif). */
  carriedCents: number;
  allocatedCents: number;
  spentCents: number;
  availableCents: number;
  targetType: 'NONE' | 'MONTHLY' | 'BY_DATE' | 'BALANCE';
  targetAmountCents: number | null;
  /** Ce qu'il faudrait encore allouer ce mois-ci pour tenir l'objectif. */
  neededCents: number | null;
}

export interface EnvelopeBudgetState {
  month: MonthKey;
  /** Argent reellement disponible sur les comptes courants a la fin du mois. */
  availableCashCents: number;
  /** Somme de tout ce qui a ete alloue, tous mois et toutes enveloppes. */
  totalAllocatedCents: number;
  /** Ce qui reste a repartir. Negatif = on a alloue de l'argent qu'on n'a pas. */
  toBeBudgetedCents: number;
  envelopes: EnvelopeState[];
  groups: { name: string; availableCents: number; allocatedCents: number }[];
  overspentCount: number;
  /** Age de l'argent, en jours. Null si l'historique est insuffisant. */
  ageOfMoneyDays: number | null;
}

/**
 * Depenses par enveloppe pour un mois. Une operation est rattachee a une
 * enveloppe soit explicitement (`envelopeId`), soit via sa categorie.
 */
async function spentByEnvelope(
  profileId: string,
  month: MonthKey,
  monthStartDay: number,
  envelopes: { id: string; categoryId: string | null }[],
): Promise<Map<string, number>> {
  const { start, end } = monthRange(month, monthStartDay);
  const transactions = await db.transaction.findMany({
    where: { profileId, date: { gte: start, lt: end }, isTransfer: false },
    select: { amount: true, envelopeId: true, categoryId: true },
  });

  const byCategory = new Map<string, string>();
  for (const e of envelopes) {
    if (e.categoryId) byCategory.set(e.categoryId, e.id);
  }

  const spent = new Map<string, number>();
  for (const tx of transactions) {
    const cents = Math.round(tx.amount.toNumber() * 100);
    if (cents >= 0) continue; // les entrees d'argent ne sortent d'aucune enveloppe
    const envelopeId =
      tx.envelopeId ?? (tx.categoryId ? byCategory.get(tx.categoryId) : undefined);
    if (!envelopeId) continue;
    spent.set(envelopeId, (spent.get(envelopeId) ?? 0) + -cents);
  }
  return spent;
}

/**
 * Premier mois ou une allocation a ete faite : c'est le point de depart du
 * budget par enveloppes.
 *
 * Sans cette notion, tout l'historique importe compterait comme du
 * "non budgete", et les enveloppes ouvriraient avec un report negatif egal a
 * douze mois de depenses. Comme dans YNAB, on commence a budgeter aujourd'hui :
 * ce qui precede reste consultable dans les operations mais ne pese pas sur les
 * enveloppes.
 */
async function envelopeEpoch(profileId: string, fallback: MonthKey): Promise<MonthKey> {
  const first = await db.envelopeAllocation.findFirst({
    where: { profileId },
    orderBy: { month: 'asc' },
    select: { month: true },
  });
  return first?.month ?? fallback;
}

/**
 * Report cumule d'une enveloppe a l'ouverture du mois : somme de tout ce qui a
 * ete alloue et depense entre le debut du budget par enveloppes et ce mois.
 */
async function carriedBalances(
  profileId: string,
  month: MonthKey,
  monthStartDay: number,
  envelopes: { id: string; categoryId: string | null }[],
): Promise<Map<string, number>> {
  const { start } = monthRange(month, monthStartDay);
  const epoch = await envelopeEpoch(profileId, month);
  const { start: epochStart } = monthRange(epoch, monthStartDay);

  const allocations = await db.envelopeAllocation.findMany({
    where: { profileId, month: { lt: month } },
  });
  const carried = new Map<string, number>();
  for (const a of allocations) {
    carried.set(
      a.envelopeId,
      (carried.get(a.envelopeId) ?? 0) + Math.round(a.allocated.toNumber() * 100),
    );
  }

  const byCategory = new Map<string, string>();
  for (const e of envelopes) {
    if (e.categoryId) byCategory.set(e.categoryId, e.id);
  }

  const past = await db.transaction.findMany({
    where: { profileId, date: { gte: epochStart, lt: start }, isTransfer: false },
    select: { amount: true, envelopeId: true, categoryId: true },
  });
  for (const tx of past) {
    const cents = Math.round(tx.amount.toNumber() * 100);
    if (cents >= 0) continue;
    const envelopeId =
      tx.envelopeId ?? (tx.categoryId ? byCategory.get(tx.categoryId) : undefined);
    if (!envelopeId) continue;
    carried.set(envelopeId, (carried.get(envelopeId) ?? 0) - -cents);
  }

  return carried;
}

/** Ce qu'il reste a allouer pour atteindre l'objectif de l'enveloppe. */
function computeNeeded(
  envelope: {
    targetType: string;
    targetAmountCents: number | null;
    targetDate: Date | null;
  },
  month: MonthKey,
  availableCents: number,
  allocatedCents: number,
): number | null {
  if (!envelope.targetAmountCents || envelope.targetType === 'NONE') return null;

  switch (envelope.targetType) {
    case 'MONTHLY':
      return Math.max(0, envelope.targetAmountCents - allocatedCents);
    case 'BALANCE':
      return Math.max(0, envelope.targetAmountCents - availableCents);
    case 'BY_DATE': {
      if (!envelope.targetDate) return null;
      const target = envelope.targetDate;
      const [y, m] = month.split('-').map(Number);
      const monthsLeft =
        (target.getUTCFullYear() - y) * 12 + (target.getUTCMonth() + 1 - m);
      const remaining = Math.max(0, envelope.targetAmountCents - availableCents);
      if (monthsLeft <= 0) return remaining;
      return Math.ceil(remaining / (monthsLeft + 1));
    }
    default:
      return null;
  }
}

export async function getEnvelopeState(
  profileId: string,
  month: MonthKey,
  monthStartDay = 1,
): Promise<EnvelopeBudgetState> {
  const envelopes = await db.envelope.findMany({
    where: { profileId, archived: false },
    include: { category: true },
    orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  const lean = envelopes.map((e) => ({ id: e.id, categoryId: e.categoryId }));
  const [spent, carried, allocations] = await Promise.all([
    spentByEnvelope(profileId, month, monthStartDay, lean),
    carriedBalances(profileId, month, monthStartDay, lean),
    db.envelopeAllocation.findMany({ where: { profileId, month } }),
  ]);

  const allocatedByEnvelope = new Map(
    allocations.map((a) => [a.envelopeId, Math.round(a.allocated.toNumber() * 100)]),
  );

  const states: EnvelopeState[] = envelopes.map((e) => {
    const carriedCents = carried.get(e.id) ?? 0;
    const allocatedCents = allocatedByEnvelope.get(e.id) ?? 0;
    const spentCents = spent.get(e.id) ?? 0;
    const availableCents = carriedCents + allocatedCents - spentCents;
    return {
      id: e.id,
      name: e.name,
      group: e.group,
      icon: e.category?.icon ?? '📁',
      color: e.category?.color ?? '#8b8b8b',
      categoryId: e.categoryId,
      carriedCents,
      allocatedCents,
      spentCents,
      availableCents,
      targetType: e.targetType,
      targetAmountCents: e.targetAmount
        ? Math.round(e.targetAmount.toNumber() * 100)
        : null,
      neededCents: computeNeeded(
        {
          targetType: e.targetType,
          targetAmountCents: e.targetAmount
            ? Math.round(e.targetAmount.toNumber() * 100)
            : null,
          targetDate: e.targetDate,
        },
        month,
        availableCents,
        allocatedCents,
      ),
    };
  });

  // "A repartir".
  //
  // On ne le calcule PAS comme "somme des revenus moins somme des allocations" :
  // sur un historique importe de douze mois, cela afficherait des dizaines de
  // milliers d'euros a repartir qui n'existent pas sur le compte.
  //
  // L'invariant retenu est celui de YNAB : l'argent disponible sur les comptes
  // est soit range dans une enveloppe, soit a repartir.
  //
  //     a_repartir = argent disponible - somme des enveloppes positives
  //
  // Les enveloppes en depassement ne sont pas deduites : leur decouvert est deja
  // sorti du compte, le retrancher une seconde fois serait un double comptage.
  const { end } = monthRange(month, monthStartDay);

  const cash = await db.transaction.aggregate({
    where: {
      profileId,
      date: { lt: end },
      account: { isActive: true, kind: { in: ['CHECKING', 'CARD', 'CASH'] } },
    },
    _sum: { amount: true },
  });
  const availableCashCents = Math.round((cash._sum.amount?.toNumber() ?? 0) * 100);

  const allAllocations = await db.envelopeAllocation.aggregate({
    where: { profileId, month: { lte: month } },
    _sum: { allocated: true },
  });
  const totalAllocatedCents = Math.round(
    (allAllocations._sum.allocated?.toNumber() ?? 0) * 100,
  );

  const parkedCents = states.reduce(
    (sum, state) => sum + Math.max(0, state.availableCents),
    0,
  );

  const groupMap = new Map<string, { availableCents: number; allocatedCents: number }>();
  for (const s of states) {
    const g = groupMap.get(s.group) ?? { availableCents: 0, allocatedCents: 0 };
    g.availableCents += s.availableCents;
    g.allocatedCents += s.allocatedCents;
    groupMap.set(s.group, g);
  }

  return {
    month,
    availableCashCents,
    totalAllocatedCents,
    toBeBudgetedCents: availableCashCents - parkedCents,
    envelopes: states,
    groups: [...groupMap.entries()].map(([name, v]) => ({ name, ...v })),
    overspentCount: states.filter((s) => s.availableCents < 0).length,
    ageOfMoneyDays: await computeAgeOfMoney(profileId),
  };
}

export async function allocate(
  profileId: string,
  envelopeId: string,
  month: MonthKey,
  amountCents: number,
): Promise<void> {
  await assertOwnedEnvelopes(profileId, [envelopeId]);
  await db.envelopeAllocation.upsert({
    where: { envelopeId_month: { envelopeId, month } },
    create: { profileId, envelopeId, month, allocated: amountCents / 100 },
    update: { allocated: amountCents / 100 },
  });
}

/**
 * Verifie que des enveloppes designees par identifiant appartiennent bien au
 * profil. Les identifiants circulent dans les requetes du client : sans ce
 * controle, en deviner un suffirait a ecrire dans le budget d'un autre.
 */
async function assertOwnedEnvelopes(
  profileId: string,
  ids: (string | null)[],
): Promise<void> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  if (wanted.length === 0) return;
  const found = await db.envelope.count({
    where: { profileId, id: { in: wanted } },
  });
  if (found !== wanted.length) throw new Error('Enveloppe inconnue.');
}

/**
 * Reallocation entre enveloppes. C'est le geste central de YNAB : quand une
 * enveloppe deborde, on ne "depasse" pas, on prend dans une autre et on assume
 * l'arbitrage. L'operation est journalisee pour garder trace de ces arbitrages.
 */
export async function moveBetweenEnvelopes(
  profileId: string,
  fromEnvelopeId: string | null,
  toEnvelopeId: string | null,
  month: MonthKey,
  amountCents: number,
  note?: string,
): Promise<void> {
  if (amountCents <= 0) throw new Error('Le montant doit etre positif.');
  if (!fromEnvelopeId && !toEnvelopeId) {
    throw new Error('Il faut au moins une enveloppe source ou destination.');
  }
  await assertOwnedEnvelopes(profileId, [fromEnvelopeId, toEnvelopeId]);

  await db.$transaction(async (tx) => {
    if (fromEnvelopeId) {
      const current = await tx.envelopeAllocation.findUnique({
        where: { envelopeId_month: { envelopeId: fromEnvelopeId, month } },
      });
      const currentCents = current ? Math.round(current.allocated.toNumber() * 100) : 0;
      await tx.envelopeAllocation.upsert({
        where: { envelopeId_month: { envelopeId: fromEnvelopeId, month } },
        create: { profileId, envelopeId: fromEnvelopeId, month, allocated: -amountCents / 100 },
        update: { allocated: (currentCents - amountCents) / 100 },
      });
    }
    if (toEnvelopeId) {
      const current = await tx.envelopeAllocation.findUnique({
        where: { envelopeId_month: { envelopeId: toEnvelopeId, month } },
      });
      const currentCents = current ? Math.round(current.allocated.toNumber() * 100) : 0;
      await tx.envelopeAllocation.upsert({
        where: { envelopeId_month: { envelopeId: toEnvelopeId, month } },
        create: { profileId, envelopeId: toEnvelopeId, month, allocated: amountCents / 100 },
        update: { allocated: (currentCents + amountCents) / 100 },
      });
    }
    await tx.envelopeTransfer.create({
      data: {
        profileId,
        month,
        fromEnvelopeId,
        toEnvelopeId,
        amount: amountCents / 100,
        note,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Age de l'argent
// ---------------------------------------------------------------------------

/**
 * Age de l'argent : combien de temps un euro reste sur le compte entre son
 * arrivee et sa depense. C'est l'indicateur central de YNAB, parce qu'il mesure
 * la seule chose qui compte vraiment — la distance prise avec le mois a mois.
 *
 * Methode : appariement FIFO. Les entrees d'argent forment une file ; chaque
 * depense consomme les euros les plus anciens. L'age d'une depense est la
 * moyenne, ponderee par les montants, du delai entre chaque euro consomme et sa
 * date d'arrivee. L'indicateur final est la moyenne des N dernieres depenses —
 * une moyenne sur toute l'histoire serait insensible aux changements recents.
 *
 * Limite assumee : le calcul demarre a la premiere transaction connue. Sur un
 * historique court, l'age est structurellement sous-estime, d'ou le seuil
 * minimal ci-dessous.
 */
export async function computeAgeOfMoney(
  profileId: string,
  sampleSize = 10,
): Promise<number | null> {
  const transactions = await db.transaction.findMany({
    where: { profileId, isTransfer: false },
    select: { date: true, amount: true },
    orderBy: { date: 'asc' },
  });
  if (transactions.length < 10) return null;

  interface Lot {
    date: number;
    remainingCents: number;
  }
  const queue: Lot[] = [];
  const ages: number[] = [];

  for (const tx of transactions) {
    const cents = Math.round(tx.amount.toNumber() * 100);
    const time = tx.date.getTime();

    if (cents > 0) {
      queue.push({ date: time, remainingCents: cents });
      continue;
    }

    let toConsume = -cents;
    let weightedDays = 0;
    let consumed = 0;

    while (toConsume > 0 && queue.length > 0) {
      const lot = queue[0];
      const take = Math.min(lot.remainingCents, toConsume);
      weightedDays += take * ((time - lot.date) / 86_400_000);
      consumed += take;
      lot.remainingCents -= take;
      toConsume -= take;
      if (lot.remainingCents === 0) queue.shift();
    }

    // Depense non couverte par des entrees connues : l'historique est trop
    // court pour cette operation, on ne la compte pas.
    if (consumed > 0 && toConsume === 0) {
      ages.push(weightedDays / consumed);
    }
  }

  if (ages.length < 5) return null;
  const sample = ages.slice(-sampleSize);
  const mean = sample.reduce((s, a) => s + a, 0) / sample.length;
  return Math.round(mean);
}

// ---------------------------------------------------------------------------
// Bascule entre les deux modes
// ---------------------------------------------------------------------------

/**
 * Passage en mode Enveloppes. Cree une enveloppe par categorie de depense
 * feuille, et reprend les budgets existants comme allocations du mois courant.
 *
 * Aucune transaction n'est modifiee ni supprimee : c'est ce qui garantit que
 * la bascule est reversible et sans perte.
 */
export async function ensureEnvelopesFromCategories(
  profileId: string,
  month: MonthKey,
): Promise<{ created: number; allocated: number }> {
  const categories = await db.category.findMany({
    where: { profileId, archived: false, children: { none: {} } },
    include: { parent: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const existing = await db.envelope.findMany({
    where: { profileId },
    select: { categoryId: true },
  });
  const covered = new Set(existing.map((e) => e.categoryId).filter(Boolean));

  let created = 0;
  for (const category of categories) {
    const kind = category.parent?.kind ?? category.kind;
    if (kind === 'INCOME') continue; // on n'alloue pas les revenus, on les repartit
    if (category.name === 'Non categorise') continue;
    if (covered.has(category.id)) continue;

    await db.envelope.create({
      data: {
        profileId,
        name: category.name,
        categoryId: category.id,
        group: category.parent?.name ?? 'Autres',
        sortOrder: category.sortOrder,
      },
    });
    created += 1;
  }

  // Reprise des budgets du mois en allocations, sans ecraser ce qui existe.
  const budgets = await db.budget.findMany({ where: { profileId, month } });
  const envelopes = await db.envelope.findMany({ where: { profileId } });
  const byCategory = new Map(
    envelopes.filter((e) => e.categoryId).map((e) => [e.categoryId!, e.id]),
  );

  let allocated = 0;
  for (const budget of budgets) {
    const envelopeId = byCategory.get(budget.categoryId);
    if (!envelopeId) continue;
    const already = await db.envelopeAllocation.findUnique({
      where: { envelopeId_month: { envelopeId, month } },
    });
    if (already) continue;
    await db.envelopeAllocation.create({
      data: { profileId, envelopeId, month, allocated: budget.amount },
    });
    allocated += 1;
  }

  return { created, allocated };
}

/**
 * Passage en mode Suivi. Reprend les allocations du mois comme budgets, pour
 * que l'utilisateur ne reparte pas d'une page blanche. Les enveloppes et leurs
 * allocations sont CONSERVEES : rebasculer en mode Enveloppes retrouve l'etat
 * exact, y compris les reports.
 */
export async function syncBudgetsFromEnvelopes(
  profileId: string,
  month: MonthKey,
): Promise<number> {
  const allocations = await db.envelopeAllocation.findMany({
    where: { profileId, month },
    include: { envelope: true },
  });

  let synced = 0;
  for (const a of allocations) {
    const categoryId = a.envelope.categoryId;
    if (!categoryId) continue;
    if (a.allocated.lessThanOrEqualTo(0)) continue;
    await db.budget.upsert({
      where: { categoryId_month: { categoryId, month } },
      create: { profileId, categoryId, month, amount: a.allocated },
      update: { amount: a.allocated },
    });
    synced += 1;
  }
  return synced;
}

export async function switchMode(
  profileId: string,
  mode: 'TRACKING' | 'ENVELOPE',
  month: MonthKey,
): Promise<{ mode: string; details: string }> {
  if (mode === 'ENVELOPE') {
    const { created, allocated } = await ensureEnvelopesFromCategories(profileId, month);
    await db.profile.update({ where: { id: profileId }, data: { budgetMode: 'ENVELOPE' } });
    return {
      mode,
      details: `${created} enveloppe(s) creee(s), ${allocated} allocation(s) reprise(s) des budgets.`,
    };
  }
  const synced = await syncBudgetsFromEnvelopes(profileId, month);
  await db.profile.update({ where: { id: profileId }, data: { budgetMode: 'TRACKING' } });
  return {
    mode,
    details: `${synced} budget(s) repris des enveloppes. Les enveloppes sont conservees.`,
  };
}

/** Historique des reallocations, pour comprendre ses propres arbitrages. */
export async function recentMoves(profileId: string, month: MonthKey, limit = 20) {
  return db.envelopeTransfer.findMany({
    where: { profileId, month },
    include: { fromEnvelope: true, toEnvelope: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function envelopeHistory(
  profileId: string,
  envelopeId: string,
  endMonth: MonthKey,
  count = 6,
) {
  const months = lastMonths(endMonth, count);
  const allocations = await db.envelopeAllocation.findMany({
    where: { profileId, envelopeId, month: { in: months } },
  });
  const map = new Map(
    allocations.map((a) => [a.month, Math.round(a.allocated.toNumber() * 100)]),
  );
  return months.map((month) => ({ month, allocatedCents: map.get(month) ?? 0 }));
}

export { addMonths };

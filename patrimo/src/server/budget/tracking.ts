/**
 * Mode Suivi (facon Bankin').
 *
 * Logique a posteriori : on constate les depenses, on les compare a un budget
 * mensuel defini par categorie. Rien n'est "alloue" : le budget est une cible,
 * pas une reserve. Le depassement est autorise et simplement signale.
 */

import { db } from '../db';
import { monthRange, addMonths, lastMonths, type MonthKey } from '@/lib/dates';

export interface CategorySpending {
  categoryId: string | null;
  name: string;
  parentName: string | null;
  icon: string;
  color: string;
  spentCents: number;
  budgetCents: number | null;
  /** Part de la depense totale du mois, entre 0 et 1. */
  share: number;
  /** Consommation du budget : 0.8 = 80 % consommes. Null si pas de budget. */
  usage: number | null;
  transactionCount: number;
}

export interface MonthOverview {
  month: MonthKey;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  categories: CategorySpending[];
  budgetedTotalCents: number;
  overspentCategories: number;
  uncategorizedCents: number;
  uncategorizedCount: number;
}

/**
 * Les virements internes et les mouvements d'epargne sont exclus des depenses :
 * transferer 500 € sur son livret n'est pas une depense, et les inclure fausse
 * completement la repartition.
 */
const EXCLUDED_KINDS = ['TRANSFER'] as const;

export async function getMonthOverview(
  profileId: string,
  month: MonthKey,
  monthStartDay = 1,
): Promise<MonthOverview> {
  const { start, end } = monthRange(month, monthStartDay);

  const transactions = await db.transaction.findMany({
    where: { profileId, date: { gte: start, lt: end }, isTransfer: false },
    include: { category: { include: { parent: true } } },
  });

  let incomeCents = 0;
  let expenseCents = 0;
  let uncategorizedCents = 0;
  let uncategorizedCount = 0;

  const buckets = new Map<
    string,
    {
      categoryId: string | null;
      name: string;
      parentName: string | null;
      icon: string;
      color: string;
      spentCents: number;
      count: number;
    }
  >();

  for (const tx of transactions) {
    const cents = Math.round(tx.amount.toNumber() * 100);
    const kind = tx.category?.parent?.kind ?? tx.category?.kind ?? 'EXPENSE';

    if (EXCLUDED_KINDS.includes(kind as 'TRANSFER')) continue;

    if (cents > 0) {
      incomeCents += cents;
      continue;
    }

    expenseCents += -cents;

    const key = tx.categoryId ?? '__none__';
    if (!tx.categoryId) {
      uncategorizedCents += -cents;
      uncategorizedCount += 1;
    }

    const existing = buckets.get(key);
    if (existing) {
      existing.spentCents += -cents;
      existing.count += 1;
    } else {
      buckets.set(key, {
        categoryId: tx.categoryId,
        name: tx.category?.name ?? 'Non categorise',
        parentName: tx.category?.parent?.name ?? null,
        icon: tx.category?.icon ?? '❓',
        color: tx.category?.color ?? tx.category?.parent?.color ?? '#9ca3af',
        spentCents: -cents,
        count: 1,
      });
    }
  }

  const budgets = await db.budget.findMany({ where: { profileId, month } });
  const budgetByCategory = new Map(
    budgets.map((b) => [b.categoryId, Math.round(b.amount.toNumber() * 100)]),
  );

  const categories: CategorySpending[] = [...buckets.values()]
    .map((b) => {
      const budgetCents = b.categoryId
        ? budgetByCategory.get(b.categoryId) ?? null
        : null;
      return {
        categoryId: b.categoryId,
        name: b.name,
        parentName: b.parentName,
        icon: b.icon,
        color: b.color,
        spentCents: b.spentCents,
        budgetCents,
        share: expenseCents > 0 ? b.spentCents / expenseCents : 0,
        usage: budgetCents && budgetCents > 0 ? b.spentCents / budgetCents : null,
        transactionCount: b.count,
      };
    })
    .sort((a, b) => b.spentCents - a.spentCents);

  // Un budget defini sur une categorie ou rien n'a ete depense doit quand meme
  // apparaitre, sinon on ne voit pas ce qui reste disponible.
  for (const budget of budgets) {
    if (categories.some((c) => c.categoryId === budget.categoryId)) continue;
    const category = await db.category.findFirst({
      where: { id: budget.categoryId, profileId },
      include: { parent: true },
    });
    if (!category) continue;
    categories.push({
      categoryId: category.id,
      name: category.name,
      parentName: category.parent?.name ?? null,
      icon: category.icon,
      color: category.color,
      spentCents: 0,
      budgetCents: Math.round(budget.amount.toNumber() * 100),
      share: 0,
      usage: 0,
      transactionCount: 0,
    });
  }

  return {
    month,
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    categories,
    budgetedTotalCents: budgets.reduce(
      (sum, b) => sum + Math.round(b.amount.toNumber() * 100),
      0,
    ),
    overspentCategories: categories.filter((c) => c.usage !== null && c.usage > 1)
      .length,
    uncategorizedCents,
    uncategorizedCount,
  };
}

export interface MonthlyTrendPoint {
  month: MonthKey;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

/** Serie mensuelle pour les graphiques d'historique. */
export async function getMonthlyTrend(
  profileId: string,
  endMonth: MonthKey,
  count = 12,
  monthStartDay = 1,
): Promise<MonthlyTrendPoint[]> {
  const months = lastMonths(endMonth, count);
  const { start } = monthRange(months[0], monthStartDay);
  const { end } = monthRange(months[months.length - 1], monthStartDay);

  const transactions = await db.transaction.findMany({
    where: { profileId, date: { gte: start, lt: end }, isTransfer: false },
    include: { category: { include: { parent: true } } },
  });

  const byMonth = new Map<MonthKey, { income: number; expense: number }>();
  for (const m of months) byMonth.set(m, { income: 0, expense: 0 });

  for (const tx of transactions) {
    const kind = tx.category?.parent?.kind ?? tx.category?.kind ?? 'EXPENSE';
    if (kind === 'TRANSFER') continue;

    // On retrouve le mois budgetaire par decalage du jour de debut.
    const shifted = new Date(tx.date);
    if (monthStartDay > 1 && shifted.getUTCDate() < monthStartDay) {
      shifted.setUTCMonth(shifted.getUTCMonth() - 1);
    }
    const key = `${shifted.getUTCFullYear()}-${String(
      shifted.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    const bucket = byMonth.get(key);
    if (!bucket) continue;

    const cents = Math.round(tx.amount.toNumber() * 100);
    if (cents > 0) bucket.income += cents;
    else bucket.expense += -cents;
  }

  return months.map((month) => {
    const b = byMonth.get(month)!;
    return {
      month,
      incomeCents: b.income,
      expenseCents: b.expense,
      netCents: b.income - b.expense,
    };
  });
}

/** Definit ou met a jour un budget mensuel. Un montant nul supprime le budget. */
export async function setBudget(
  profileId: string,
  categoryId: string,
  month: MonthKey,
  amountCents: number,
): Promise<void> {
  // La categorie doit appartenir au profil : sans cette verification, un
  // identifiant devine dans une requete suffirait a ecrire chez un autre.
  const owned = await db.category.findFirst({
    where: { id: categoryId, profileId },
    select: { id: true },
  });
  if (!owned) throw new Error('Categorie inconnue.');

  if (amountCents <= 0) {
    await db.budget.deleteMany({ where: { profileId, categoryId, month } });
    return;
  }
  await db.budget.upsert({
    where: { categoryId_month: { categoryId, month } },
    create: { profileId, categoryId, month, amount: amountCents / 100 },
    update: { amount: amountCents / 100 },
  });
}

/**
 * Reconduit les budgets du mois precedent. Appele a l'ouverture d'un nouveau
 * mois : sans cela, il faudrait tout ressaisir chaque mois.
 */
export async function rolloverBudgets(profileId: string, month: MonthKey): Promise<number> {
  const previous = addMonths(month, -1);
  const existing = await db.budget.findMany({ where: { profileId, month } });
  const alreadySet = new Set(existing.map((b) => b.categoryId));

  const source = await db.budget.findMany({
    where: { profileId, month: previous, rollover: true },
  });
  const toCreate = source.filter((b) => !alreadySet.has(b.categoryId));
  if (toCreate.length === 0) return 0;

  await db.budget.createMany({
    data: toCreate.map((b) => ({
      profileId,
      categoryId: b.categoryId,
      month,
      amount: b.amount,
      rollover: true,
    })),
    skipDuplicates: true,
  });
  return toCreate.length;
}

/**
 * Propose un budget par categorie a partir de la mediane des N derniers mois.
 * La mediane plutot que la moyenne : un seul mois avec un achat exceptionnel ne
 * doit pas gonfler la cible de facon durable.
 */
export async function suggestBudgets(
  profileId: string,
  month: MonthKey,
  lookback = 6,
  monthStartDay = 1,
): Promise<{ categoryId: string; name: string; suggestedCents: number }[]> {
  const months = lastMonths(addMonths(month, -1), lookback);
  const perCategory = new Map<string, { name: string; values: number[] }>();

  for (const m of months) {
    const overview = await getMonthOverview(profileId, m, monthStartDay);
    for (const c of overview.categories) {
      if (!c.categoryId) continue;
      const entry = perCategory.get(c.categoryId) ?? { name: c.name, values: [] };
      entry.values.push(c.spentCents);
      perCategory.set(c.categoryId, entry);
    }
  }

  const result: { categoryId: string; name: string; suggestedCents: number }[] = [];
  for (const [categoryId, { name, values }] of perCategory) {
    // Il faut au moins trois mois pour qu'une mediane veuille dire quelque chose.
    if (values.length < 3) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];
    if (median < 500) continue; // sous 5 €/mois, un budget n'apporte rien
    // Arrondi a 5 € : un budget a 87,34 € n'a aucun sens comme cible.
    result.push({
      categoryId,
      name,
      suggestedCents: Math.round(median / 500) * 500,
    });
  }

  return result.sort((a, b) => b.suggestedCents - a.suggestedCents);
}

import { db } from '@/server/db';
import { requireProfile } from '@/server/auth';
import { currentMonthKey, monthRange, monthLabel } from '@/lib/dates';
import { MonthPicker } from '@/components/MonthPicker';
import { TransactionList } from '@/components/TransactionList';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; filter?: string; q?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const startDay = profile.monthStartDay;
  const month = params.month ?? currentMonthKey(startDay);
  const { start, end } = monthRange(month, startDay);

  const where = {
    profileId: profile.id,
    date: { gte: start, lt: end },
    ...(params.filter === 'uncategorized' ? { categoryId: null } : {}),
    ...(params.q
      ? { rawLabel: { contains: params.q, mode: 'insensitive' as const } }
      : {}),
  };

  const [transactions, categories] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { category: { include: { parent: true } }, account: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    }),
    db.category.findMany({
      where: { profileId: profile.id, archived: false },
      include: { parent: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);

  return (
    <>
      <header className="flex items-baseline justify-between pt-2">
        <h1 className="text-2xl font-semibold">Operations</h1>
        <MonthPicker month={month} basePath="/transactions" />
      </header>
      <p className="mt-1 text-sm text-muted">
        {monthLabel(month)} · {transactions.length} operation(s)
        {params.filter === 'uncategorized' && ' non categorisee(s)'}
      </p>

      <TransactionList
        month={month}
        activeFilter={params.filter ?? null}
        transactions={transactions.map((t) => ({
          id: t.id,
          date: t.date.toISOString().slice(0, 10),
          label: t.label,
          rawLabel: t.rawLabel,
          amountCents: Math.round(t.amount.toNumber() * 100),
          categoryId: t.categoryId,
          categoryName: t.category
            ? t.category.parent
              ? `${t.category.parent.name} > ${t.category.name}`
              : t.category.name
            : null,
          categoryIcon: t.category?.icon ?? '❓',
          categorySource: t.categorySource,
          aiConfidence: t.aiConfidence,
          isTransfer: t.isTransfer,
          accountName: t.account.name,
        }))}
        categories={categories.map((c) => ({
          id: c.id,
          label: c.parent ? `${c.parent.name} > ${c.name}` : c.name,
          icon: c.icon,
          isParent: c.parentId === null,
        }))}
      />
    </>
  );
}

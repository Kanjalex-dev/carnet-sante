import { db } from '@/server/db';
import { requireProfile } from '@/server/auth';
import { currentMonthKey, monthLabel } from '@/lib/dates';
import { getMonthOverview } from '@/server/budget/tracking';
import { getEnvelopeState, recentMoves } from '@/server/budget/envelopes';
import { TrackingBudget } from '@/components/budget/TrackingBudget';
import { EnvelopeBudget } from '@/components/budget/EnvelopeBudget';
import { ModeSwitch } from '@/components/budget/ModeSwitch';
import { MonthPicker } from '@/components/MonthPicker';

export const dynamic = 'force-dynamic';

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireProfile();
  const startDay = profile.monthStartDay;
  const month = params.month ?? currentMonthKey(startDay);
  const mode = profile.budgetMode;

  const categories = await db.category.findMany({
    where: { profileId: profile.id, archived: false },
    include: { parent: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return (
    <>
      <header className="flex items-baseline justify-between pt-2">
        <h1 className="text-2xl font-semibold">Budget</h1>
        <MonthPicker month={month} basePath="/budget" />
      </header>
      <p className="mt-1 text-sm text-muted">{monthLabel(month)}</p>

      <div className="mt-4">
        <ModeSwitch mode={mode} month={month} />
      </div>

      {mode === 'ENVELOPE' ? (
        <EnvelopeBudget
          month={month}
          state={await getEnvelopeState(profile.id, month, startDay)}
          moves={(await recentMoves(profile.id, month)).map((m) => ({
            id: m.id,
            from: m.fromEnvelope?.name ?? 'A repartir',
            to: m.toEnvelope?.name ?? 'A repartir',
            amountCents: Math.round(m.amount.toNumber() * 100),
            note: m.note,
            at: m.createdAt.toISOString(),
          }))}
        />
      ) : (
        <TrackingBudget
          month={month}
          overview={await getMonthOverview(profile.id, month, startDay)}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            parentName: c.parent?.name ?? null,
            icon: c.icon,
            kind: c.parent?.kind ?? c.kind,
          }))}
        />
      )}
    </>
  );
}

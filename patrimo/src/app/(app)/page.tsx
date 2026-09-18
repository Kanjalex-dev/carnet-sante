import Link from 'next/link';
import { db } from '@/server/db';
import { requireProfile } from '@/server/auth';
import { currentMonthKey, monthLabel } from '@/lib/dates';
import { getMonthOverview, getMonthlyTrend } from '@/server/budget/tracking';
import { getEnvelopeState } from '@/server/budget/envelopes';
import { forecastMonth } from '@/server/analysis/forecast';
import { getNetWorth } from '@/server/patrimoine/portfolio';
import { Money, StatCard, Section, EmptyState, Notice, Bar } from '@/components/ui';
import { MonthlyTrendChart, CategoryPie, BalanceForecastChart } from '@/components/charts';
import { formatEur } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const profile = await requireProfile();
  const startDay = profile.monthStartDay;
  const month = currentMonthKey(startDay);
  const mode = profile.budgetMode;

  const transactionCount = await db.transaction.count({
    where: { profileId: profile.id },
  });
  if (transactionCount === 0) {
    return (
      <>
        <header className="pt-2">
          <h1 className="text-2xl font-semibold">Bonjour {profile.name}</h1>
        </header>
        <div className="mt-6">
          <EmptyState title="Aucune operation pour l'instant">
            <p>
              Exporte le releve de ton compte courant depuis ton espace bancaire
              (CSV ou OFX), puis importe-le.
            </p>
            <Link href="/import" className="btn-primary mt-4">
              Importer un releve
            </Link>
          </EmptyState>
        </div>
      </>
    );
  }

  const [overview, trend, forecast, netWorth, alerts] = await Promise.all([
    getMonthOverview(profile.id, month, startDay),
    getMonthlyTrend(profile.id, month, 6, startDay),
    forecastMonth(profile.id, month, startDay),
    getNetWorth(profile.id),
    db.alertEvent.findMany({
      where: { profileId: profile.id, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ]);

  const envelopeState =
    mode === 'ENVELOPE' ? await getEnvelopeState(profile.id, month, startDay) : null;

  const topCategories = overview.categories
    .filter((c) => c.spentCents > 0)
    .slice(0, 6);

  return (
    <>
      <header className="flex items-baseline justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{monthLabel(month)}</h1>
          {/* Le prenom est rappele ici : sur une installation partagee, savoir
              d'un coup d'oeil quel profil est ouvert evite de saisir une
              depense dans le budget de quelqu'un d'autre. */}
          <p className="text-sm text-muted">
            {profile.name} · mode {mode === 'ENVELOPE' ? 'Enveloppes' : 'Suivi'}
          </p>
        </div>
        <Link href="/import" className="btn-quiet text-sm">
          Importer
        </Link>
      </header>

      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {alerts.map((alert) => (
            <Link key={alert.id} href="/alertes" className="block">
              <Notice tone={alert.severity === 'info' ? 'info' : 'warn'} title={alert.title}>
                {alert.body}
              </Notice>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Depenses du mois"
          hint={`${overview.categories.reduce((s, c) => s + c.transactionCount, 0)} operations`}
        >
          <Money cents={overview.expenseCents} compact />
        </StatCard>
        <StatCard
          label="Reste a vivre"
          tone={overview.netCents < 0 ? 'negative' : 'neutral'}
          hint={`Entrees ${formatEur(overview.incomeCents, true)}`}
        >
          <Money cents={overview.netCents} compact colorize />
        </StatCard>
      </div>

      {envelopeState && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatCard
            label="A repartir"
            tone={envelopeState.toBeBudgetedCents < 0 ? 'negative' : 'positive'}
            hint={
              envelopeState.toBeBudgetedCents < 0
                ? 'Tu as alloue plus que ce que tu as'
                : 'Chaque euro doit avoir un role'
            }
          >
            <Money cents={envelopeState.toBeBudgetedCents} compact colorize />
          </StatCard>
          <StatCard
            label="Age de l'argent"
            hint={
              envelopeState.ageOfMoneyDays === null
                ? 'Historique insuffisant'
                : "Delai moyen entre l'entree et la depense"
            }
          >
            {envelopeState.ageOfMoneyDays === null
              ? '—'
              : `${envelopeState.ageOfMoneyDays} j`}
          </StatCard>
        </div>
      )}

      <Section
        title="Solde projete en fin de mois"
        description={
          forecast.balanceSource === 'cumul'
            ? "Calcule par cumul des operations : importe un fichier OFX pour ancrer le solde reel de ton releve."
            : undefined
        }
      >
        <div className="card">
          <div className="flex items-baseline justify-between">
            <Money
              cents={forecast.projectedBalanceCents}
              className="text-2xl font-semibold"
              colorize
            />
            <span className="text-xs text-muted">
              entre {formatEur(forecast.projectedLowCents, true)} et{' '}
              {formatEur(forecast.projectedHighCents, true)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Solde actuel {formatEur(forecast.currentBalanceCents)} ·{' '}
            {forecast.upcoming.length} echeance(s) a venir ·{' '}
            {forecast.daysRemaining} jour(s) restants
          </div>
          {forecast.negativeOn && (
            <div className="mt-2">
              <Notice tone="warn">
                Solde negatif attendu a partir du{' '}
                {forecast.negativeOn.toISOString().slice(0, 10)}.
              </Notice>
            </div>
          )}
          <div className="mt-3">
            <BalanceForecastChart data={forecast.dailyPath} />
          </div>
        </div>
      </Section>

      <Section title="Repartition des depenses">
        {topCategories.length === 0 ? (
          <EmptyState title="Aucune depense categorisee ce mois-ci" />
        ) : (
          <div className="card">
            <CategoryPie
              data={topCategories.map((c) => ({
                name: c.name,
                valueCents: c.spentCents,
                color: c.color,
              }))}
            />
            <ul className="mt-2 space-y-2">
              {topCategories.map((c) => (
                <li key={c.categoryId ?? 'none'}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                    <span className="amount">
                      {formatEur(c.spentCents)}
                      <span className="ml-2 text-xs text-muted">
                        {Math.round(c.share * 100)} %
                      </span>
                    </span>
                  </div>
                  {c.usage !== null && (
                    <div className="mt-1">
                      <Bar
                        ratio={c.usage}
                        tone={c.usage > 1 ? 'over' : c.usage > 0.9 ? 'warn' : 'neutral'}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {overview.uncategorizedCount > 0 && (
              <div className="mt-3">
                <Link href="/transactions?filter=uncategorized">
                  <Notice tone="warn">
                    {overview.uncategorizedCount} operation(s) non categorisee(s) —{' '}
                    {formatEur(overview.uncategorizedCents)}. Les classer ameliore
                    tout le reste.
                  </Notice>
                </Link>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Six derniers mois">
        <div className="card">
          <MonthlyTrendChart data={trend} />
        </div>
      </Section>

      {netWorth.totalCents > 0 && (
        <Section
          title="Patrimoine"
          action={
            <Link href="/patrimoine" className="text-sm text-accent">
              Detail
            </Link>
          }
        >
          <div className="card">
            <div className="flex items-baseline justify-between">
              <Money cents={netWorth.totalCents} className="text-2xl font-semibold" />
              {netWorth.changes.month && (
                <span
                  className={
                    netWorth.changes.month.cents >= 0
                      ? 'amount text-sm text-positive'
                      : 'amount text-sm text-negative'
                  }
                >
                  {netWorth.changes.month.cents >= 0 ? '+' : ''}
                  {formatEur(netWorth.changes.month.cents, true)} sur 30 j
                </span>
              )}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {netWorth.bySource.map((source) => (
                <li key={source.id} className="flex justify-between">
                  <span className="text-muted">
                    {source.label}
                    {source.unofficial && (
                      <span className="chip ml-2">non officiel</span>
                    )}
                  </span>
                  <Money cents={source.valueCents} />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      <Section title="Raccourcis">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/abonnements" className="card-tight text-sm">
            Abonnements et economies
          </Link>
          <Link href="/alertes" className="card-tight text-sm">
            Alertes
          </Link>
        </div>
      </Section>
    </>
  );
}

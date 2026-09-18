import { db } from '@/server/db';
import { requireProfile } from '@/server/auth';
import {
  getNetWorth,
  comparePerformance,
  portfolioSignals,
  projectWealth,
  defaultTargetAllocation,
} from '@/server/patrimoine/portfolio';
import { addDays, dateOnly } from '@/lib/dates';
import { formatEur, formatPercent } from '@/lib/money';
import { Money, Section, StatCard, EmptyState, Notice, Bar } from '@/components/ui';
import { NetWorthChart, CategoryPie, PerformanceChart, ProjectionChart } from '@/components/charts';
import { PatrimoineActions } from '@/components/patrimoine/PatrimoineActions';
import { ValuationEntryForm } from '@/components/patrimoine/ValuationEntryForm';

export const dynamic = 'force-dynamic';

const CLASS_COLORS: Record<string, string> = {
  EQUITY: '#3d7ea6',
  ETF: '#205aa0',
  BOND: '#7a5ea8',
  EURO_FUND: '#4f9d69',
  REAL_ESTATE: '#c98b3a',
  CRYPTO: '#b8566b',
  CASH: '#9ca3af',
  OTHER: '#6b7280',
};

export default async function PatrimoinePage() {
  const settings = await requireProfile();
  const accounts = await db.assetAccount.findMany({
    where: { profileId: settings.id },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length === 0) {
    return (
      <>
        <header className="pt-2">
          <h1 className="text-2xl font-semibold">Patrimoine</h1>
        </header>
        <div className="mt-6">
          <EmptyState title="Aucune source declaree">
            <p className="mb-4">
              Ajoute une source pour commencer. Trade Republic se synchronise
              automatiquement via un connecteur non officiel ; Yomoni se saisit a
              la main, faute d&apos;API.
            </p>
          </EmptyState>
        </div>
        <div className="mt-4">
          <PatrimoineActions accounts={[]} />
        </div>
      </>
    );
  }

  const [netWorth, performance, signals, history] = await Promise.all([
    getNetWorth(settings.id),
    comparePerformance(settings.id, 365),
    portfolioSignals(settings.id),
    db.valuationSnapshot.findMany({
      where: {
        profileId: settings.id,
        assetAccountId: null,
        date: { gte: dateOnly(addDays(new Date(), -400)) },
      },
      orderBy: { date: 'asc' },
    }),
  ]);

  const benchmarks = await db.benchmark.findMany({ where: { enabled: true } });
  const benchmarkLabels = Object.fromEntries(benchmarks.map((b) => [b.key, b.label]));

  const targets = defaultTargetAllocation(
    settings.riskProfile,
    settings.horizonYears,
  );

  const projections = projectWealth(netWorth.totalCents, 0, 20);

  return (
    <>
      <header className="pt-2">
        <h1 className="text-2xl font-semibold">Patrimoine</h1>
        <p className="mt-1 text-sm text-muted">
          {accounts.length} source(s) · profil {settings.riskProfile}/10 a{' '}
          {settings.horizonYears} ans
        </p>
      </header>

      <div className="card mt-4">
        <div className="label">Valeur nette totale</div>
        <div className="mt-1 text-3xl font-semibold">
          <Money cents={netWorth.totalCents} />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
          {(
            [
              ['24 h', netWorth.changes.day],
              ['7 j', netWorth.changes.week],
              ['30 j', netWorth.changes.month],
              ['1 an', netWorth.changes.year],
            ] as const
          ).map(([label, change]) => (
            <div key={label}>
              <div className="text-muted">{label}</div>
              <div
                className={
                  change === null
                    ? 'text-muted'
                    : change.cents >= 0
                      ? 'text-positive'
                      : 'text-negative'
                }
              >
                {change === null
                  ? '—'
                  : `${change.cents >= 0 ? '+' : ''}${formatPercent(change.percent)}`}
              </div>
            </div>
          ))}
        </div>
        {netWorth.gainCents !== null && (
          <div className="mt-3 border-t border-line pt-3 text-sm text-muted">
            Verse {formatEur(netWorth.investedCents ?? 0)} · plus-value{' '}
            <span className={netWorth.gainCents >= 0 ? 'text-positive' : 'text-negative'}>
              {formatEur(netWorth.gainCents)}
              {netWorth.gainPercent !== null &&
                ` (${formatPercent(netWorth.gainPercent)})`}
            </span>
          </div>
        )}
      </div>

      {history.length >= 2 && (
        <Section title="Evolution">
          <div className="card">
            <NetWorthChart
              data={history.map((h) => ({
                date: h.date.toISOString().slice(0, 10),
                valueCents: Math.round(h.totalValue.toNumber() * 100),
              }))}
            />
          </div>
        </Section>
      )}

      <Section title="Sources">
        <ul className="card space-y-3 text-sm">
          {netWorth.bySource.map((source) => (
            <li key={source.id}>
              <div className="flex items-baseline justify-between">
                <span className="font-medium">
                  {source.label}
                  {source.unofficial && <span className="chip ml-2">non officiel</span>}
                </span>
                <Money cents={source.valueCents} />
              </div>
              <div className="mt-1 text-xs text-muted">
                {source.lastSyncAt
                  ? `Mis a jour le ${source.lastSyncAt.toLocaleDateString('fr-FR')}`
                  : 'Jamais synchronise'}
                {' · '}
                {Math.round(source.share * 100)} % du patrimoine
              </div>
              {source.lastSyncError && (
                <div className="mt-1 text-xs text-negative">
                  Derniere erreur : {source.lastSyncError}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {netWorth.allocation.length > 0 && (
        <Section title="Repartition par classe d'actifs">
          <div className="card">
            <CategoryPie
              data={netWorth.allocation.map((slice) => ({
                name: slice.label,
                valueCents: slice.valueCents,
                color: CLASS_COLORS[slice.assetClass] ?? '#9ca3af',
              }))}
            />
            <ul className="mt-3 space-y-2 text-sm">
              {netWorth.allocation.map((slice) => {
                const target = targets.find((t) => t.assetClass === slice.assetClass);
                return (
                  <li key={slice.assetClass}>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: CLASS_COLORS[slice.assetClass] ?? '#9ca3af',
                          }}
                        />
                        {slice.label}
                      </span>
                      <span className="amount">
                        {formatEur(slice.valueCents, true)}
                        <span className="ml-2 text-xs text-muted">
                          {Math.round(slice.share * 100)} %
                          {target && ` / ${Math.round(target.targetShare * 100)} %`}
                        </span>
                      </span>
                    </div>
                    {target && (
                      <div className="mt-1">
                        <Bar
                          ratio={slice.share / target.targetShare}
                          tone={
                            Math.abs(slice.share - target.targetShare) > 0.12
                              ? 'warn'
                              : 'neutral'
                          }
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
      )}

      <Section
        title="Performance vs indices"
        description="Base 100 au premier point d'historique."
      >
        {performance.series.length < 2 ? (
          <EmptyState title="Historique insuffisant">
            <p>{performance.warning}</p>
          </EmptyState>
        ) : (
          <div className="card">
            <PerformanceChart
              data={performance.series}
              benchmarkLabels={benchmarkLabels}
            />
            {performance.warning && (
              <div className="mt-3">
                <Notice tone="warn">{performance.warning}</Notice>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Signaux"
        description="Chacun porte son calcul : tu dois pouvoir le contredire."
      >
        {signals.length === 0 ? (
          <EmptyState title="Aucun signal" >
            <p>Allocation conforme a la cible, pas de concentration excessive.</p>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {signals.map((signal, i) => (
              <li key={i} className="card">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{signal.title}</span>
                  <span
                    className={
                      signal.severity === 'warn'
                        ? 'chip border-warn/50 text-warn'
                        : 'chip'
                    }
                  >
                    {signal.kind === 'DRIFT'
                      ? 'derive'
                      : signal.kind === 'CONCENTRATION'
                        ? 'concentration'
                        : signal.kind === 'CASH_DRAG'
                          ? 'liquidites'
                          : signal.kind === 'STALE_DATA'
                            ? 'donnees'
                            : 'indice'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{signal.detail}</p>
                <p className="mt-2 font-mono text-[11px] text-muted opacity-70">
                  {signal.computation}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Projection"
        description="Interet compose, sans versement complementaire. Hypotheses de travail, pas des previsions."
      >
        <div className="card">
          <ProjectionChart scenarios={projections} />
          <ul className="mt-3 space-y-1 text-sm">
            {projections.map((scenario) => (
              <li key={scenario.name} className="flex justify-between">
                <span className="text-muted">
                  {scenario.name} ({formatPercent(scenario.annualReturn, 0)}/an)
                </span>
                <Money cents={scenario.finalCents} compact />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            A 20 ans. Ces chiffres ne tiennent compte ni de la fiscalite, ni de
            l&apos;inflation, ni des frais de gestion.
          </p>
        </div>
      </Section>

      {/* La saisie manuelle est proposee pour TOUTES les sources, y compris
          celles qui ont un connecteur : c'est le repli quand un connecteur non
          officiel cesse de fonctionner, et le seul chemin pour Yomoni. */}
      <Section title="Mettre a jour a la main">
        <ValuationEntryForm
          accounts={accounts.map((a) => ({
            id: a.id,
            label: a.label,
            provider: a.provider,
          }))}
        />
      </Section>

      <Section title="Sources et synchronisation">
        <PatrimoineActions
          accounts={accounts.map((a) => ({
            id: a.id,
            label: a.label,
            provider: a.provider,
          }))}
        />
      </Section>
    </>
  );
}

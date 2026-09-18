import { requireProfile } from '@/server/auth';
import { currentMonthKey } from '@/lib/dates';
import { listSubscriptions } from '@/server/analysis/recurring';
import { buildRecommendations } from '@/server/analysis/recommendations';
import { formatEur } from '@/lib/money';
import { Money, Section, StatCard, EmptyState, Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'hebdomadaire',
  BIWEEKLY: 'bimensuel',
  MONTHLY: 'mensuel',
  BIMONTHLY: 'bimestriel',
  QUARTERLY: 'trimestriel',
  SEMIANNUAL: 'semestriel',
  ANNUAL: 'annuel',
  IRREGULAR: 'irregulier',
};

export default async function AbonnementsPage() {
  const profile = await requireProfile();
  const month = currentMonthKey(profile.monthStartDay);

  const [subscriptions, recommendations] = await Promise.all([
    listSubscriptions(profile.id),
    buildRecommendations(profile.id, month, profile.monthStartDay),
  ]);

  // Deux familles, deux totaux. Un "cout des abonnements" qui inclut le loyer
  // est exact et inutilisable : on ne resilie pas son loyer.
  const realSubscriptions = subscriptions.filter((s) => s.kind === 'SUBSCRIPTION');
  const fixedCharges = subscriptions.filter((s) => s.kind === 'FIXED_CHARGE');

  const monthlyTotal = realSubscriptions.reduce(
    (sum, s) => sum + Math.abs(s.monthlyEquivalentCents),
    0,
  );
  const fixedTotal = fixedCharges.reduce(
    (sum, s) => sum + Math.abs(s.monthlyEquivalentCents),
    0,
  );
  const potentialSaving = recommendations.reduce(
    (sum, r) => sum + (r.monthlySavingCents ?? 0),
    0,
  );

  return (
    <>
      <header className="pt-2">
        <h1 className="text-2xl font-semibold">Abonnements</h1>
        <p className="mt-1 text-sm text-muted">
          Detectes automatiquement a partir de la regularite des prelevements.
        </p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Abonnements"
          hint={`${realSubscriptions.length} service(s) · ${formatEur(monthlyTotal * 12, true)}/an`}
        >
          <Money cents={monthlyTotal} compact />
        </StatCard>
        <StatCard
          label="Charges fixes"
          hint={`${fixedCharges.length} prelevement(s) · ${formatEur(fixedTotal * 12, true)}/an`}
        >
          <Money cents={fixedTotal} compact />
        </StatCard>
      </div>
      <p className="mt-2 text-xs text-muted">
        Les charges fixes (logement, assurances, sante, impots) sont detectees de
        la meme facon mais comptees a part : on ne resilie pas son loyer.
      </p>

      <Section
        title="Pistes d'economies"
        description="Chaque piste porte son calcul et les operations qui la justifient. Aucune n'est generee par un modele de langage."
      >
        {recommendations.length === 0 ? (
          <EmptyState title="Aucune piste identifiee">
            <p>
              Pas de doublon d&apos;abonnement, pas de hausse de tarif, pas de
              derive de categorie sur la periode analysee.
            </p>
          </EmptyState>
        ) : (
          <>
            {potentialSaving > 0 && (
              <div className="mb-3">
                <Notice title={`Jusqu'a ${formatEur(potentialSaving)} par mois`}>
                  Total des economies chiffrables ci-dessous, soit{' '}
                  {formatEur(potentialSaving * 12)} sur un an. Toutes ne sont pas
                  souhaitables : c&apos;est a toi de trancher.
                </Notice>
              </div>
            )}
            <ul className="space-y-2">
              {recommendations.map((recommendation, i) => (
                <li key={i} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">{recommendation.title}</span>
                    {recommendation.monthlySavingCents !== null && (
                      <span className="amount shrink-0 text-sm text-positive">
                        {formatEur(recommendation.monthlySavingCents)}/mois
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">{recommendation.detail}</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted">
                      Sur quoi repose ce calcul
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {recommendation.evidence.map((line, j) => (
                        <li key={j}>· {line}</li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Abonnements detectes">
        {realSubscriptions.length === 0 ? (
          <EmptyState title="Aucun abonnement detecte">
            <p>
              Il faut au moins trois prelevements reguliers de montant stable pour
              qu&apos;une serie soit reconnue.
            </p>
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-line">
            {realSubscriptions.map((subscription) => (
              <li key={subscription.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {subscription.merchant ?? subscription.label}
                  </span>
                  <span className="amount shrink-0 text-sm">
                    {formatEur(Math.abs(subscription.amountLastCents))}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {FREQUENCY_LABELS[subscription.frequency] ?? subscription.frequency}
                  {' · '}
                  {formatEur(Math.abs(subscription.monthlyEquivalentCents))}/mois
                  equivalent
                  {' · '}
                  {subscription.occurrences} prelevements
                  {subscription.nextExpected &&
                    ` · prochain vers le ${subscription.nextExpected.toLocaleDateString('fr-FR')}`}
                </div>
                {subscription.priceIncrease && (
                  <div className="mt-1 text-xs text-warn">
                    Hausse de{' '}
                    {(subscription.priceIncrease.percent * 100).toFixed(0)} % :{' '}
                    {formatEur(Math.abs(subscription.priceIncrease.fromCents))} →{' '}
                    {formatEur(Math.abs(subscription.priceIncrease.toCents))}
                  </div>
                )}
                {subscription.confidence < 0.7 && (
                  <div className="mt-1 text-xs text-muted opacity-70">
                    Detection incertaine ({Math.round(subscription.confidence * 100)} %)
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {fixedCharges.length > 0 && (
        <Section
          title="Charges fixes recurrentes"
          description="Detectees comme les abonnements. Une hausse s'y voit aussi bien, et elle porte souvent sur des montants plus lourds."
        >
          <ul className="card divide-y divide-line">
            {fixedCharges.map((charge) => (
              <li key={charge.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {charge.merchant ?? charge.label}
                  </span>
                  <span className="amount shrink-0 whitespace-nowrap text-sm">
                    {formatEur(Math.abs(charge.amountLastCents))}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {FREQUENCY_LABELS[charge.frequency] ?? charge.frequency}
                  {charge.categoryName && ` · ${charge.categoryName}`}
                  {' · '}
                  {charge.occurrences} prelevements
                </div>
                {charge.priceIncrease && (
                  <div className="mt-1 text-xs text-warn">
                    Hausse de {(charge.priceIncrease.percent * 100).toFixed(0)} % :{' '}
                    {formatEur(Math.abs(charge.priceIncrease.fromCents))} →{' '}
                    {formatEur(Math.abs(charge.priceIncrease.toCents))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

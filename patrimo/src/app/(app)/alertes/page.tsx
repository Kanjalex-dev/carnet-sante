import { db } from '@/server/db';
import { requireProfile } from '@/server/auth';
import { listAlerts } from '@/server/analysis/alerts';
import { EmptyState, Section } from '@/components/ui';
import { AlertActions } from '@/components/AlertActions';

export const dynamic = 'force-dynamic';

export default async function AlertesPage() {
  const profile = await requireProfile();
  const alerts = await listAlerts(profile.id, 60);
  const rules = await db.alertRule.findMany({
    where: { profileId: profile.id },
    orderBy: { type: 'asc' },
  });

  return (
    <>
      <header className="flex items-baseline justify-between pt-2">
        <h1 className="text-2xl font-semibold">Alertes</h1>
        <AlertActions />
      </header>

      <Section title="Recentes">
        {alerts.length === 0 ? (
          <EmptyState title="Aucune alerte">
            <p>
              Les alertes sont evaluees a chaque import et chaque nuit. Une meme
              situation ne notifie qu&apos;une fois.
            </p>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={`card ${alert.readAt ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{alert.title}</span>
                  <span
                    className={
                      alert.severity === 'critical'
                        ? 'chip border-negative/50 text-negative'
                        : alert.severity === 'warn'
                          ? 'chip border-warn/50 text-warn'
                          : 'chip'
                    }
                  >
                    {alert.severity === 'critical'
                      ? 'critique'
                      : alert.severity === 'warn'
                        ? 'attention'
                        : 'info'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{alert.body}</p>
                <p className="mt-1 text-xs text-muted opacity-70">
                  {alert.createdAt.toLocaleString('fr-FR')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Regles actives">
        <ul className="card space-y-2 text-sm">
          {rules.map((rule) => (
            <li key={rule.id} className="flex justify-between text-muted">
              <span>{rule.type}</span>
              <span>
                {rule.enabled ? 'activee' : 'desactivee'}
                {Object.keys(rule.config as object).length > 0 &&
                  ` · ${JSON.stringify(rule.config)}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Les seuils se modifient dans les reglages.
        </p>
      </Section>
    </>
  );
}

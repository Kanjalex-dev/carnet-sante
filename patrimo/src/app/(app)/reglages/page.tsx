import Link from 'next/link';
import { db } from '@/server/db';
import { env } from '@/lib/env';
import { requireProfile, listProfiles } from '@/server/auth';
import { Section } from '@/components/ui';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ProfilesPanel } from '@/components/ProfilesPanel';

export const dynamic = 'force-dynamic';

export default async function ReglagesPage() {
  const me = await requireProfile();
  const [profiles, accounts, rules, ruleCount, learnedCount, syncLogs] =
    await Promise.all([
      listProfiles(),
      db.account.findMany({ where: { profileId: me.id }, orderBy: { name: 'asc' } }),
      db.alertRule.findMany({ where: { profileId: me.id }, orderBy: { type: 'asc' } }),
      db.categoryRule.count({ where: { profileId: me.id } }),
      db.categoryRule.count({ where: { profileId: me.id, learned: true } }),
      db.syncLog.findMany({
        where: { profileId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

  return (
    <>
      <header className="pt-2">
        <h1 className="text-2xl font-semibold">Reglages</h1>
      </header>

      <ProfilesPanel me={me} profiles={profiles} />

      <SettingsPanel
        settings={{
          monthStartDay: me.monthStartDay,
          aiEnabled: me.aiEnabled,
          riskProfile: me.riskProfile,
          horizonYears: me.horizonYears,
        }}
        accounts={accounts.map((a: (typeof accounts)[number]) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          institution: a.institution,
        }))}
        alertRules={rules.map((r: (typeof rules)[number]) => ({
          type: r.type,
          enabled: r.enabled,
          config: r.config as Record<string, number>,
        }))}
        aiAvailable={env.aiAvailable}
      />

      <Section title="Categorisation">
        <div className="card space-y-2 text-sm text-muted">
          <p>
            {ruleCount} regle(s) de categorisation, dont {learnedCount} apprise(s)
            a partir de tes corrections.
          </p>
          <p className="text-xs">
            Chaque recategorisation manuelle cree une regle. L&apos;usage de
            l&apos;IA decroit donc au fil des mois au lieu de croitre.
          </p>
        </div>
      </Section>

      <Section title="Connecteurs patrimoniaux">
        <div className="card space-y-3 text-sm">
          <div>
            <div className="font-medium">Trade Republic</div>
            <div className="text-xs text-muted">
              {env.pytrPython
                ? 'Configure (pont Python actif)'
                : 'Non configure — renseigner PYTR_PYTHON, TR_PHONE et TR_PIN.'}
            </div>
            <div className="mt-1 text-xs text-warn">
              Connecteur non officiel. Contraire aux CGU de Trade Republic, et
              susceptible de cesser de fonctionner sans preavis. La saisie
              manuelle reste disponible et prend le relais sans rien perdre.
            </div>
          </div>
          <div>
            <div className="font-medium">Yomoni</div>
            <div className="text-xs text-muted">
              Saisie manuelle uniquement. Yomoni ne publie aucune API et aucun
              client open source n&apos;existe.
            </div>
          </div>
          <div>
            <div className="font-medium">BoursoBank</div>
            <div className="text-xs text-muted">
              Import de fichier (CSV, OFX, QIF). Aucun connecteur automatique
              n&apos;est branche a ce jour.
            </div>
            <div className="mt-1 text-xs text-muted">
              La voie legale pour automatiser serait un agregateur agree DSP2.
              L&apos;offre gratuite historique (Nordigen, devenue GoCardless
              Bank Account Data) n&apos;accepte plus de nouvelles inscriptions ;
              Enable Banking propose un acces gratuit limite a ses propres
              comptes. A verifier avant de s&apos;engager : ces conditions
              changent souvent.
            </div>
          </div>
          <div>
            <div className="font-medium">Cotations</div>
            <div className="text-xs text-muted">
              Fournisseur : {env.quotesProvider}
            </div>
          </div>
        </div>
        {syncLogs.length > 0 && (
          <ul className="card mt-3 space-y-1 text-xs text-muted">
            {syncLogs.map((log: (typeof syncLogs)[number]) => (
              <li key={log.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {log.ok ? '✓' : '✗'} {log.provider} — {log.message}
                </span>
                <span className="shrink-0">
                  {log.createdAt.toLocaleDateString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Ailleurs">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/abonnements" className="card-tight text-sm">
            Abonnements
          </Link>
          <Link href="/alertes" className="card-tight text-sm">
            Alertes
          </Link>
        </div>
      </Section>
    </>
  );
}

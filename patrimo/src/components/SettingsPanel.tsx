'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Section, Notice } from '@/components/ui';

const ALERT_LABELS: Record<string, { label: string; unit?: string; key?: string }> = {
  BUDGET_OVERRUN: { label: 'Depassement de budget', unit: '%', key: 'percent' },
  LOW_BALANCE: { label: 'Solde bas', unit: '€', key: 'thresholdEur' },
  LARGE_UPCOMING: { label: 'Gros prelevement a venir', unit: '€', key: 'thresholdEur' },
  LARGE_TRANSACTION: { label: 'Operation inhabituelle', unit: '€', key: 'thresholdEur' },
  NEW_SUBSCRIPTION: { label: 'Nouvel abonnement' },
  PRICE_INCREASE: { label: "Hausse d'abonnement", unit: '%', key: 'percent' },
  PORTFOLIO_DRIFT: { label: 'Derive du portefeuille', unit: 'pts', key: 'percentPoints' },
  PORTFOLIO_MOVE: { label: 'Mouvement de marche', unit: '%', key: 'percent' },
};

const ACCOUNT_KINDS = [
  { key: 'CHECKING', label: 'Compte courant' },
  { key: 'SAVINGS', label: 'Livret / epargne' },
  { key: 'CARD', label: 'Carte a debit differe' },
  { key: 'CASH', label: 'Especes' },
];

export function SettingsPanel({
  settings,
  accounts,
  alertRules,
  aiAvailable,
}: {
  settings: {
    monthStartDay: number;
    aiEnabled: boolean;
    riskProfile: number;
    horizonYears: number;
  };
  accounts: { id: string; name: string; kind: string; institution: string | null }[];
  alertRules: { type: string; enabled: boolean; config: Record<string, number> }[];
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [startDay, setStartDay] = useState(settings.monthStartDay);
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
  const [risk, setRisk] = useState(settings.riskProfile);
  const [horizon, setHorizon] = useState(settings.horizonYears);
  const [newAccount, setNewAccount] = useState<{ name: string; kind: string } | null>(
    null,
  );
  const [pinForm, setPinForm] = useState<{ current: string; next: string } | null>(
    null,
  );

  async function post(url: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) setMessage(result.error ?? 'Echec.');
      return result;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message && (
        <div className="mt-4">
          <Notice tone="warn">{message}</Notice>
        </div>
      )}

      <Section title="Mois budgetaire">
        <div className="card space-y-3">
          <label className="block">
            <span className="label">Jour de debut du mois</span>
            <input
              className="input mt-1"
              type="number"
              min={1}
              max={28}
              value={startDay}
              onChange={(e) => setStartDay(Number(e.target.value))}
            />
          </label>
          <p className="text-xs text-muted">
            Mets 1 pour un mois calendaire. Si ton salaire tombe le 5 et que tu
            raisonnes « du 5 au 5 », mets 5 : toutes les agregations suivront.
          </p>
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={busy}
            onClick={async () => {
              await post('/api/settings', { action: 'update', monthStartDay: startDay });
              router.refresh();
            }}
          >
            Enregistrer
          </button>
        </div>
      </Section>

      <Section title="Categorisation par IA">
        <div className="card space-y-3">
          {!aiAvailable && (
            <Notice tone="warn">
              Aucune cle ANTHROPIC_API_KEY configuree. Seules les regles
              deterministes s&apos;appliquent.
            </Notice>
          )}
          <label className="flex items-center justify-between">
            <span className="text-sm">Utiliser l&apos;IA en complement des regles</span>
            <input
              type="checkbox"
              className="h-6 w-6"
              checked={aiEnabled}
              disabled={!aiAvailable}
              onChange={async (e) => {
                setAiEnabled(e.target.checked);
                await post('/api/settings', {
                  action: 'update',
                  aiEnabled: e.target.checked,
                });
                router.refresh();
              }}
            />
          </label>
          <p className="text-xs text-muted">
            L&apos;IA ne recoit que le libelle et le montant des operations qu&apos;aucune
            regle ne couvre. Ni numero de compte, ni solde, ni identite.
          </p>
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={busy}
            onClick={async () => {
              const result = await post('/api/settings', { action: 'recategorize' });
              setMessage(`${result.updated ?? 0} operation(s) recategorisee(s).`);
              router.refresh();
            }}
          >
            Relancer sur les operations non classees
          </button>
        </div>
      </Section>

      <Section title="Comptes bancaires">
        <div className="card space-y-3">
          <ul className="space-y-2 text-sm">
            {accounts.map((account) => (
              <li key={account.id} className="flex justify-between">
                <span>{account.name}</span>
                <span className="text-xs text-muted">
                  {ACCOUNT_KINDS.find((k) => k.key === account.kind)?.label ??
                    account.kind}
                </span>
              </li>
            ))}
          </ul>
          {newAccount ? (
            <div className="space-y-2 border-t border-line pt-3">
              <input
                className="input"
                placeholder="Nom du compte"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              />
              <select
                className="input"
                value={newAccount.kind}
                onChange={(e) => setNewAccount({ ...newAccount, kind: e.target.value })}
              >
                {ACCOUNT_KINDS.map((kind) => (
                  <option key={kind.key} value={kind.key}>
                    {kind.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost flex-1"
                  onClick={() => setNewAccount(null)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={busy || newAccount.name.trim() === ''}
                  onClick={async () => {
                    await post('/api/settings', {
                      action: 'createAccount',
                      name: newAccount.name.trim(),
                      kind: newAccount.kind,
                    });
                    setNewAccount(null);
                    router.refresh();
                  }}
                >
                  Creer
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => setNewAccount({ name: '', kind: 'CHECKING' })}
            >
              Ajouter un compte
            </button>
          )}
        </div>
      </Section>

      <Section title="Profil investisseur">
        <div className="card space-y-3">
          <label className="block">
            <span className="label">
              Profil de risque : {risk}/10
            </span>
            <input
              type="range"
              min={1}
              max={10}
              value={risk}
              className="mt-2 w-full"
              onChange={(e) => setRisk(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="label">Horizon : {horizon} ans</span>
            <input
              type="range"
              min={1}
              max={30}
              value={horizon}
              className="mt-2 w-full"
              onChange={(e) => setHorizon(Number(e.target.value))}
            />
          </label>
          <p className="text-xs text-muted">
            Ces deux valeurs servent uniquement a calculer une allocation cible de
            reference, contre laquelle mesurer une derive. Ce n&apos;est pas un
            conseil en investissement.
          </p>
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={busy}
            onClick={async () => {
              await post('/api/patrimoine', {
                action: 'setProfile',
                riskProfile: risk,
                horizonYears: horizon,
              });
              router.refresh();
            }}
          >
            Enregistrer
          </button>
        </div>
      </Section>

      <Section title="Alertes">
        <div className="card space-y-3">
          {alertRules.map((rule) => {
            const meta = ALERT_LABELS[rule.type] ?? { label: rule.type };
            const configKey = meta.key;
            const value = configKey ? rule.config[configKey] : undefined;
            return (
              <div key={rule.type} className="flex items-center gap-3">
                <span className="flex-1 text-sm">{meta.label}</span>
                {configKey && (
                  <span className="flex items-center gap-1">
                    <input
                      className="input h-9 w-20 text-right"
                      inputMode="numeric"
                      defaultValue={value ?? ''}
                      onBlur={async (e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next)) return;
                        await post('/api/settings', {
                          action: 'setAlertRule',
                          type: rule.type,
                          config: { ...rule.config, [configKey]: next },
                        });
                        router.refresh();
                      }}
                    />
                    <span className="text-xs text-muted">{meta.unit}</span>
                  </span>
                )}
                <input
                  type="checkbox"
                  className="h-6 w-6"
                  defaultChecked={rule.enabled}
                  onChange={async (e) => {
                    await post('/api/settings', {
                      action: 'setAlertRule',
                      type: rule.type,
                      enabled: e.target.checked,
                    });
                    router.refresh();
                  }}
                />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Securite">
        <div className="card space-y-3">
          {pinForm ? (
            <>
              <input
                className="input"
                type="password"
                inputMode="numeric"
                placeholder="Code actuel"
                value={pinForm.current}
                onChange={(e) =>
                  setPinForm({ ...pinForm, current: e.target.value.replace(/\D/g, '') })
                }
              />
              <input
                className="input"
                type="password"
                inputMode="numeric"
                placeholder="Nouveau code"
                value={pinForm.next}
                onChange={(e) =>
                  setPinForm({ ...pinForm, next: e.target.value.replace(/\D/g, '') })
                }
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost flex-1"
                  onClick={() => setPinForm(null)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={busy}
                  onClick={async () => {
                    const result = await post('/api/settings', {
                      action: 'changePin',
                      current: pinForm.current,
                      next: pinForm.next,
                    });
                    if (!result.error) {
                      setPinForm(null);
                      setMessage('Code modifie.');
                    }
                  }}
                >
                  Changer
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => setPinForm({ current: '', next: '' })}
            >
              Changer le code
            </button>
          )}
          <button
            type="button"
            className="btn-quiet w-full text-negative"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.replace('/login');
            }}
          >
            Se deconnecter
          </button>
        </div>
      </Section>
    </>
  );
}

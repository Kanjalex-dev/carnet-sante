'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Notice } from '@/components/ui';

const PROVIDERS = [
  {
    key: 'TRADE_REPUBLIC',
    label: 'Trade Republic',
    note: 'Connecteur non officiel (pytr). Peut cesser de fonctionner sans preavis.',
  },
  {
    key: 'YOMONI',
    label: 'Yomoni',
    note: "Saisie manuelle : Yomoni ne publie aucune API.",
  },
  { key: 'MANUAL', label: 'Autre (saisie manuelle)', note: '' },
] as const;

export function PatrimoineActions({
  accounts,
}: {
  accounts: { id: string; label: string; provider: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<string>('TRADE_REPUBLIC');
  const [label, setLabel] = useState('');

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/patrimoine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await response.json();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {accounts.length > 0 && (
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={busy}
          onClick={async () => {
            const result = await post({ action: 'syncAll' });
            if (result.outcomes) {
              const lines = result.outcomes.map(
                (o: { provider: string; ok: boolean; message: string }) =>
                  `${o.provider} : ${o.ok ? '✓' : '✗'} ${o.message}`,
              );
              setMessage(
                lines.length > 0
                  ? lines.join('\n')
                  : 'Aucune source automatique a synchroniser.',
              );
            }
            router.refresh();
          }}
        >
          {busy ? 'Synchronisation…' : 'Synchroniser les sources automatiques'}
        </button>
      )}

      {message && (
        <Notice tone="info">
          <pre className="whitespace-pre-wrap font-sans text-xs">{message}</pre>
        </Notice>
      )}

      {adding ? (
        <div className="card space-y-3">
          <label className="block">
            <span className="label">Type de source</span>
            <select
              className="input mt-1"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {PROVIDERS.find((p) => p.key === provider)?.note && (
            <p className="text-xs text-muted">
              {PROVIDERS.find((p) => p.key === provider)?.note}
            </p>
          )}
          <label className="block">
            <span className="label">Nom</span>
            <input
              className="input mt-1"
              placeholder="Ex. PEA Trade Republic"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => setAdding(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={busy || label.trim() === ''}
              onClick={async () => {
                const result = await post({
                  action: 'createAccount',
                  provider,
                  label: label.trim(),
                });
                if (result.error) {
                  setMessage(result.error);
                  return;
                }
                setAdding(false);
                setLabel('');
                router.refresh();
              }}
            >
              Ajouter
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => setAdding(true)}
        >
          Ajouter une source
        </button>
      )}
    </div>
  );
}

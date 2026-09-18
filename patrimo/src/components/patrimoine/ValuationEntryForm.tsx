'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Notice } from '@/components/ui';

/**
 * Saisie manuelle d'une valorisation, sur n'importe quelle source.
 *
 * Ce formulaire est le repli permanent : il reste disponible meme sur une
 * source qui a un connecteur, parce qu'un connecteur non officiel finit
 * toujours par casser et qu'il ne doit pas emmener le suivi avec lui.
 *
 * Il verifie que la repartition correspond au total : une erreur de saisie sur
 * un patrimoine se propage ensuite dans la repartition, la performance et les
 * recommandations d'arbitrage. Mieux vaut la bloquer ici.
 */

const BUCKETS = [
  { key: 'ETF', label: 'Actions (ETF)' },
  { key: 'EQUITY', label: 'Actions en direct' },
  { key: 'BOND', label: 'Obligations' },
  { key: 'EURO_FUND', label: 'Fonds euros' },
  { key: 'REAL_ESTATE', label: 'Immobilier' },
  { key: 'CRYPTO', label: 'Crypto' },
  { key: 'CASH', label: 'Liquidites' },
];

export function ValuationEntryForm({
  accounts,
}: {
  accounts: { id: string; label: string; provider?: string }[];
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState('');
  const [invested, setInvested] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalValue = Number(total.replace(',', '.')) || 0;
  const breakdownSum = BUCKETS.reduce(
    (sum, bucket) => sum + (Number((values[bucket.key] ?? '').replace(',', '.')) || 0),
    0,
  );
  const gap = totalValue > 0 ? Math.abs(breakdownSum - totalValue) : 0;
  const breakdownFilled = breakdownSum > 0;
  const mismatch = breakdownFilled && totalValue > 0 && gap > totalValue * 0.02;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (totalValue <= 0) {
      setError('Renseigne la valorisation totale.');
      return;
    }

    const breakdown: Record<string, number> = {};
    for (const bucket of BUCKETS) {
      const value = Number((values[bucket.key] ?? '').replace(',', '.'));
      if (Number.isFinite(value) && value > 0) breakdown[bucket.key] = value;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/patrimoine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recordValuation',
          assetAccountId: accountId,
          asOf: new Date(`${asOf}T00:00:00Z`).toISOString(),
          totalValue,
          invested: invested ? Number(invested.replace(',', '.')) : undefined,
          breakdown,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Echec de la saisie.');
        return;
      }
      setMessage('Valorisation enregistree.');
      setTotal('');
      setValues({});
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      {accounts.length > 1 && (
        <label className="block">
          <span className="label">Source</span>
          <select
            className="input mt-1"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Date</span>
          <input
            className="input mt-1"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Valorisation</span>
          <input
            className="input mt-1"
            inputMode="decimal"
            placeholder="12 450,32"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>
      </div>

      <label className="block">
        <span className="label">Versements cumules (facultatif)</span>
        <input
          className="input mt-1"
          inputMode="decimal"
          placeholder="10 000"
          value={invested}
          onChange={(e) => setInvested(e.target.value)}
        />
      </label>

      <div>
        <span className="label">Repartition (facultative)</span>
        <div className="mt-1 space-y-2">
          {BUCKETS.map((bucket) => (
            <label key={bucket.key} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{bucket.label}</span>
              <input
                className="input h-10 w-28 text-right"
                inputMode="decimal"
                placeholder="0"
                value={values[bucket.key] ?? ''}
                onChange={(e) =>
                  setValues({ ...values, [bucket.key]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        {breakdownFilled && (
          <p
            className={`mt-2 text-xs ${mismatch ? 'text-negative' : 'text-muted'}`}
          >
            Somme de la repartition : {breakdownSum.toFixed(2)} €
            {mismatch && ` — ecart de ${gap.toFixed(2)} € avec le total.`}
          </p>
        )}
      </div>

      {error && <Notice tone="warn">{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={busy || mismatch || totalValue <= 0}
      >
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      <p className="text-xs text-muted">
        Saisir la repartition remplace la composition connue de cette source.
        Si tu ne renseignes que le total, la valeur est mise a jour et la
        composition affichee reste la derniere connue.
      </p>
    </form>
  );
}

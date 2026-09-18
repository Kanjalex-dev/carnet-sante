'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Notice } from '@/components/ui';

interface Summary {
  profile: string;
  format: string;
  parsed: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  warnings: { line: number; message: string }[];
  categorized: { byRule: number; byAi: number; unset: number };
  transfersPaired: number;
  recurring: { seriesFound: number; subscriptions: number };
  alertsRaised: number;
}

export function ImportForm({
  accounts,
}: {
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !accountId) return;
    setBusy(true);
    setError(null);
    setSummary(null);

    const form = new FormData();
    form.append('file', file);
    form.append('accountId', accountId);

    try {
      const response = await fetch('/api/import', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Echec de l'import.");
        return;
      }
      setSummary(payload);
      setFile(null);
      router.refresh();
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <Notice tone="warn">
        Aucun compte n&apos;est declare. Cree-en un dans les reglages avant
        d&apos;importer.
      </Notice>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="card space-y-3">
        <label className="block">
          <span className="label">Compte</span>
          <select
            className="input mt-1"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">Fichier</span>
          <input
            className="input mt-1 py-2"
            type="file"
            // `accept` reste large : iOS masque les fichiers dont il ne connait
            // pas le type MIME, et un .ofx est souvent servi en octet-stream.
            accept=".csv,.ofx,.qfx,.qif,text/csv,application/octet-stream,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <button type="submit" className="btn-primary w-full" disabled={busy || !file}>
          {busy ? 'Analyse en cours…' : 'Importer'}
        </button>
      </form>

      {error && (
        <div className="mt-3">
          <Notice tone="warn" title="Import refuse">
            {error}
          </Notice>
        </div>
      )}

      {summary && (
        <div className="card mt-3 space-y-2 text-sm">
          <p className="font-medium">
            {summary.inserted} operation(s) ajoutee(s)
          </p>
          <ul className="space-y-1 text-xs text-muted">
            <li>
              Format reconnu : {summary.format} — {summary.profile}
            </li>
            <li>
              {summary.parsed} ligne(s) lue(s), {summary.duplicates} doublon(s)
              ignore(s)
              {summary.rejected > 0 && `, ${summary.rejected} rejetee(s)`}
            </li>
            <li>
              Categorisation : {summary.categorized.byRule} par regle,{' '}
              {summary.categorized.byAi} par IA, {summary.categorized.unset} a
              classer
            </li>
            {summary.transfersPaired > 0 && (
              <li>{summary.transfersPaired} virement(s) interne(s) apparie(s)</li>
            )}
            <li>
              {summary.recurring.seriesFound} recurrence(s) dont{' '}
              {summary.recurring.subscriptions} abonnement(s)
            </li>
            {summary.alertsRaised > 0 && (
              <li>{summary.alertsRaised} alerte(s) declenchee(s)</li>
            )}
          </ul>

          {summary.warnings.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">
                {summary.warnings.length} ligne(s) ignoree(s) — voir le detail
              </summary>
              <ul className="mt-2 space-y-1">
                {summary.warnings.slice(0, 30).map((warning, i) => (
                  <li key={i}>
                    Ligne {warning.line} : {warning.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </>
  );
}

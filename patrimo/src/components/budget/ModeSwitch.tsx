'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';

/**
 * Bascule entre les deux modes budgetaires.
 *
 * Le message de confirmation est important : la promesse "aucune perte
 * d'historique" doit etre lisible AVANT le clic, pas apres. Les transactions et
 * leur categorisation ne sont jamais touchees ; seule la couche d'allocation
 * change de forme.
 */
export function ModeSwitch({
  mode,
  month,
}: {
  mode: 'TRACKING' | 'ENVELOPE';
  month: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function switchTo(next: 'TRACKING' | 'ENVELOPE') {
    if (next === mode || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switchMode', mode: next, month }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? 'Echec de la bascule.');
        return;
      }
      setMessage(payload.details);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex rounded-xl2 border border-line bg-surface2 p-1">
        {(
          [
            { key: 'TRACKING', label: 'Suivi', hint: 'a posteriori' },
            { key: 'ENVELOPE', label: 'Enveloppes', hint: 'base zero' },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => switchTo(option.key)}
            disabled={busy}
            className={clsx(
              'flex-1 rounded-[0.85rem] py-2 text-sm transition-colors',
              mode === option.key
                ? 'bg-surface font-medium text-ink shadow-sm'
                : 'text-muted',
            )}
          >
            {option.label}
            <span className="ml-1 text-[10px] opacity-70">{option.hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {mode === 'ENVELOPE'
          ? 'Chaque euro entrant est affecte a une enveloppe avant d’etre depense.'
          : 'Les depenses sont constatees puis comparees a un budget mensuel.'}{' '}
        Changer de mode ne supprime aucune operation ni categorisation.
      </p>
      {message && <p className="mt-2 text-xs text-accent">{message}</p>}
    </div>
  );
}

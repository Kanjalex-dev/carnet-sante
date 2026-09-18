'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { formatEur } from '@/lib/money';
import { Money, Section, Notice, EmptyState } from '@/components/ui';
import type { EnvelopeBudgetState } from '@/server/budget/envelopes';

interface Move {
  id: string;
  from: string;
  to: string;
  amountCents: number;
  note: string | null;
  at: string;
}

export function EnvelopeBudget({
  month,
  state,
  moves,
}: {
  month: string;
  state: EnvelopeBudgetState;
  moves: Move[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [moveForm, setMoveForm] = useState<{
    from: string | null;
    to: string | null;
    amount: string;
  } | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, typeof state.envelopes>();
    for (const envelope of state.envelopes) {
      const list = map.get(envelope.group) ?? [];
      list.push(envelope);
      map.set(envelope.group, list);
    }
    return [...map.entries()];
  }, [state.envelopes]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await response.json();
    } finally {
      setBusy(false);
    }
  }

  async function saveAllocation(envelopeId: string) {
    const value = Number(draft.replace(',', '.'));
    if (!Number.isFinite(value)) return;
    await post({
      action: 'allocate',
      envelopeId,
      month,
      amountCents: Math.round(value * 100),
    });
    setEditing(null);
    setDraft('');
    router.refresh();
  }

  if (state.envelopes.length === 0) {
    return (
      <EmptyState title="Aucune enveloppe">
        <p>
          Les enveloppes sont creees a partir de tes categories lors du passage en
          mode Enveloppes.
        </p>
      </EmptyState>
    );
  }

  return (
    <>
      <div
        className={clsx(
          'mt-4 rounded-xl2 border p-4 text-center',
          state.toBeBudgetedCents < 0
            ? 'border-negative/50 bg-negative/10'
            : state.toBeBudgetedCents === 0
              ? 'border-positive/50 bg-positive/10'
              : 'border-line bg-surface',
        )}
      >
        <div className="label">A repartir</div>
        <div className="mt-1 text-3xl font-semibold">
          <Money cents={state.toBeBudgetedCents} colorize />
        </div>
        <p className="mt-1 text-xs text-muted">
          {state.toBeBudgetedCents < 0
            ? 'Tu as alloue plus d’argent que tu n’en as. Reprends dans une enveloppe.'
            : state.toBeBudgetedCents === 0
              ? 'Budget base zero atteint : chaque euro a un role.'
              : 'Affecte ce montant a des enveloppes.'}
        </p>
      </div>

      {state.ageOfMoneyDays !== null && (
        <div className="mt-3">
          <Notice title={`Age de l’argent : ${state.ageOfMoneyDays} jours`}>
            Delai moyen entre l’arrivee d’un euro sur le compte et sa depense.
            C’est la mesure de la distance prise avec le mois a mois : au-dela de
            30 jours, tu depenses l’argent du mois precedent.
          </Notice>
        </div>
      )}

      {groups.map(([groupName, envelopes]) => (
        <Section key={groupName} title={groupName}>
          <div className="card space-y-4">
            {envelopes.map((envelope) => {
              const budget = envelope.carriedCents + envelope.allocatedCents;
              const ratio = budget > 0 ? envelope.spentCents / budget : 0;
              return (
                <div key={envelope.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0">{envelope.icon}</span>
                      <span className="truncate font-medium">{envelope.name}</span>
                    </span>
                    <span
                      className={clsx(
                        'amount shrink-0 whitespace-nowrap font-medium',
                        envelope.availableCents < 0 ? 'text-negative' : 'text-ink',
                      )}
                    >
                      {formatEur(envelope.availableCents)}
                    </span>
                  </div>

                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                    <div
                      className={clsx(
                        'h-full rounded-full',
                        envelope.availableCents < 0 ? 'bg-negative' : 'bg-accent',
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
                    />
                  </div>

                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>
                      report {formatEur(envelope.carriedCents)} · depense{' '}
                      {formatEur(envelope.spentCents)}
                    </span>
                    {editing === envelope.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          className="input h-8 w-20 text-right text-sm"
                          inputMode="decimal"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="text-accent"
                          onClick={() => saveAllocation(envelope.id)}
                        >
                          OK
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-accent"
                        onClick={() => {
                          setEditing(envelope.id);
                          setDraft(String(envelope.allocatedCents / 100));
                        }}
                      >
                        allouer {formatEur(envelope.allocatedCents)}
                      </button>
                    )}
                  </div>

                  {envelope.neededCents !== null && envelope.neededCents > 0 && (
                    <div className="mt-1 text-xs text-warn">
                      Objectif : encore {formatEur(envelope.neededCents)} a allouer
                      ce mois-ci.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ))}

      <Section
        title="Reallouer"
        description="Quand une enveloppe deborde, on ne depasse pas : on prend ailleurs et on assume l'arbitrage."
      >
        {moveForm === null ? (
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => setMoveForm({ from: null, to: null, amount: '' })}
          >
            Deplacer de l&apos;argent entre enveloppes
          </button>
        ) : (
          <div className="card space-y-3">
            <label className="block">
              <span className="label">Depuis</span>
              <select
                className="input mt-1"
                value={moveForm.from ?? ''}
                onChange={(e) =>
                  setMoveForm({ ...moveForm, from: e.target.value || null })
                }
              >
                <option value="">A repartir</option>
                {state.envelopes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({formatEur(e.availableCents)})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Vers</span>
              <select
                className="input mt-1"
                value={moveForm.to ?? ''}
                onChange={(e) =>
                  setMoveForm({ ...moveForm, to: e.target.value || null })
                }
              >
                <option value="">A repartir</option>
                {state.envelopes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({formatEur(e.availableCents)})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Montant</span>
              <input
                className="input mt-1"
                inputMode="decimal"
                placeholder="50"
                value={moveForm.amount}
                onChange={(e) => setMoveForm({ ...moveForm, amount: e.target.value })}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => setMoveForm(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={busy}
                onClick={async () => {
                  const value = Number(moveForm.amount.replace(',', '.'));
                  if (!Number.isFinite(value) || value <= 0) return;
                  const result = await post({
                    action: 'move',
                    fromEnvelopeId: moveForm.from,
                    toEnvelopeId: moveForm.to,
                    month,
                    amountCents: Math.round(value * 100),
                  });
                  if (result.error) {
                    alert(result.error);
                    return;
                  }
                  setMoveForm(null);
                  router.refresh();
                }}
              >
                Deplacer
              </button>
            </div>
          </div>
        )}
      </Section>

      {moves.length > 0 && (
        <Section title="Arbitrages du mois">
          <ul className="card space-y-2 text-sm">
            {moves.map((move) => (
              <li key={move.id} className="flex justify-between text-muted">
                <span>
                  {move.from} → {move.to}
                </span>
                <span className="amount">{formatEur(move.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

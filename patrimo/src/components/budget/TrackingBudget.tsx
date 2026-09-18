'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { formatEur } from '@/lib/money';
import { Bar, Money, Notice, Section, EmptyState } from '@/components/ui';
import type { MonthOverview } from '@/server/budget/tracking';

interface CategoryOption {
  id: string;
  name: string;
  parentName: string | null;
  icon: string;
  kind: string;
}

export function TrackingBudget({
  month,
  overview,
  categories,
}: {
  month: string;
  overview: MonthOverview;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<
    { categoryId: string; name: string; suggestedCents: number }[] | null
  >(null);

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

  async function saveBudget(categoryId: string) {
    const value = Number(draft.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return;
    await post({
      action: 'setBudget',
      categoryId,
      month,
      amountCents: Math.round(value * 100),
    });
    setEditing(null);
    setDraft('');
    router.refresh();
  }

  const withBudget = overview.categories.filter((c) => c.budgetCents !== null);
  const withoutBudget = overview.categories.filter(
    (c) => c.budgetCents === null && c.spentCents > 0,
  );

  const totalBudget = overview.budgetedTotalCents;
  const totalSpentOnBudgeted = withBudget.reduce((s, c) => s + c.spentCents, 0);

  return (
    <>
      <Section title="Budgets definis">
        {withBudget.length === 0 ? (
          <EmptyState title="Aucun budget pour ce mois">
            <p>
              Un budget se pose sur une categorie. Tu peux partir des medianes de
              tes six derniers mois plutot que de deviner.
            </p>
            <button
              type="button"
              className="btn-primary mt-3"
              disabled={busy}
              onClick={async () => {
                const result = await post({ action: 'suggest', month });
                setSuggestions(result.suggestions ?? []);
              }}
            >
              Proposer des budgets
            </button>
          </EmptyState>
        ) : (
          <div className="card space-y-4">
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <span className="label">Total budgete</span>
              <span className="text-sm">
                <Money cents={totalSpentOnBudgeted} /> /{' '}
                <span className="text-muted">{formatEur(totalBudget)}</span>
              </span>
            </div>
            {withBudget.map((category) => {
              const usage = category.usage ?? 0;
              const remaining = (category.budgetCents ?? 0) - category.spentCents;
              return (
                <div key={category.categoryId}>
                  {/* gap-3 et min-w-0 : sans eux, un libelle long vient coller
                      le montant, qui devient illisible d'un coup d'oeil. */}
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0">{category.icon}</span>
                      <span className="truncate font-medium">{category.name}</span>
                    </span>
                    {editing === category.categoryId ? (
                      <span className="flex items-center gap-2">
                        <input
                          className="input h-9 w-24 text-right"
                          inputMode="decimal"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="text-accent"
                          onClick={() => saveBudget(category.categoryId!)}
                        >
                          OK
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="amount shrink-0 whitespace-nowrap text-right"
                        onClick={() => {
                          setEditing(category.categoryId);
                          setDraft(String((category.budgetCents ?? 0) / 100));
                        }}
                      >
                        {formatEur(category.spentCents)}
                        <span className="text-muted">
                          {' '}
                          / {formatEur(category.budgetCents ?? 0)}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <Bar
                      ratio={usage}
                      tone={usage > 1 ? 'over' : usage > 0.9 ? 'warn' : 'neutral'}
                    />
                  </div>
                  <div
                    className={clsx(
                      'mt-1 text-xs',
                      remaining < 0 ? 'text-negative' : 'text-muted',
                    )}
                  >
                    {remaining < 0
                      ? `Depassement de ${formatEur(-remaining)}`
                      : `Reste ${formatEur(remaining)}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {suggestions && suggestions.length > 0 && (
        <Section title="Propositions">
          <div className="card">
            <p className="mb-3 text-sm text-muted">
              Mediane des six derniers mois, arrondie a 5 €. La mediane plutot que
              la moyenne : un seul mois exceptionnel ne doit pas fixer la cible.
            </p>
            <ul className="space-y-2 text-sm">
              {suggestions.map((s) => (
                <li key={s.categoryId} className="flex justify-between">
                  <span>{s.name}</span>
                  <span className="amount">{formatEur(s.suggestedCents)}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              disabled={busy}
              onClick={async () => {
                await post({
                  action: 'applySuggestions',
                  month,
                  items: suggestions.map((s) => ({
                    categoryId: s.categoryId,
                    amountCents: s.suggestedCents,
                  })),
                });
                setSuggestions(null);
                router.refresh();
              }}
            >
              Appliquer ces budgets
            </button>
          </div>
        </Section>
      )}

      {withoutBudget.length > 0 && (
        <Section
          title="Depenses sans budget"
          description="Toucher un montant pour lui fixer un budget."
        >
          <div className="card space-y-3">
            {withoutBudget.map((category) => (
              <div
                key={category.categoryId ?? 'none'}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">{category.icon}</span>
                  <span className="truncate">{category.name}</span>
                </span>
                {editing === category.categoryId ? (
                  <span className="flex items-center gap-2">
                    <input
                      className="input h-9 w-24 text-right"
                      inputMode="decimal"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="text-accent"
                      onClick={() => saveBudget(category.categoryId!)}
                    >
                      OK
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="amount shrink-0 whitespace-nowrap text-muted"
                    disabled={!category.categoryId}
                    onClick={() => {
                      setEditing(category.categoryId);
                      setDraft(String(Math.round(category.spentCents / 100)));
                    }}
                  >
                    {formatEur(category.spentCents)}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Reconduire">
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={busy}
          onClick={async () => {
            const result = await post({ action: 'rollover', month });
            router.refresh();
            if (result.count === 0) {
              alert('Aucun budget a reconduire depuis le mois precedent.');
            }
          }}
        >
          Reprendre les budgets du mois precedent
        </button>
      </Section>

      {overview.overspentCategories > 0 && (
        <div className="mt-4">
          <Notice tone="warn">
            {overview.overspentCategories} categorie(s) en depassement ce mois-ci.
          </Notice>
        </div>
      )}
    </>
  );
}

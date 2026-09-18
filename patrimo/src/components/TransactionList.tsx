'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { formatEur } from '@/lib/money';
import { EmptyState } from '@/components/ui';

interface TransactionRow {
  id: string;
  date: string;
  label: string;
  rawLabel: string;
  amountCents: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string;
  categorySource: string;
  aiConfidence: number | null;
  isTransfer: boolean;
  accountName: string;
}

interface CategoryOption {
  id: string;
  label: string;
  icon: string;
  isParent: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  IMPORT_RULE: 'regle',
  AI: 'IA',
  MANUAL: 'manuel',
  LEARNED: 'appris',
  UNSET: 'non classe',
};

export function TransactionList({
  month,
  transactions,
  categories,
  activeFilter,
}: {
  month: string;
  transactions: TransactionRow[];
  categories: CategoryOption[];
  activeFilter: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function assign(
    transactionId: string,
    categoryId: string,
    applyToSimilar: boolean,
  ) {
    setBusy(true);
    try {
      const response = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, categoryId, applyToSimilar }),
      });
      const payload = await response.json();
      if (!response.ok) {
        alert(payload.error ?? 'Echec.');
        return;
      }
      setOpen(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const grouped = transactions.reduce<Record<string, TransactionRow[]>>(
    (acc, transaction) => {
      (acc[transaction.date] ??= []).push(transaction);
      return acc;
    },
    {},
  );

  return (
    <>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <Link
          href={`/transactions?month=${month}`}
          className={clsx('chip', !activeFilter && 'border-accent text-accent')}
        >
          Toutes
        </Link>
        <Link
          href={`/transactions?month=${month}&filter=uncategorized`}
          className={clsx(
            'chip',
            activeFilter === 'uncategorized' && 'border-accent text-accent',
          )}
        >
          Non categorisees
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Aucune operation sur cette periode" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {Object.entries(grouped).map(([date, rows]) => (
            <div key={date}>
              <div className="label mb-1">
                {new Date(`${date}T00:00:00Z`).toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                })}
              </div>
              <ul className="overflow-hidden rounded-xl2 border border-line bg-surface">
                {rows.map((transaction) => (
                  <li key={transaction.id} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-3 text-left"
                      onClick={() =>
                        setOpen(open === transaction.id ? null : transaction.id)
                      }
                    >
                      <span className="text-lg">{transaction.categoryIcon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {transaction.label}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {transaction.categoryName ?? 'Non categorise'}
                          {transaction.categorySource !== 'MANUAL' && (
                            <span className="ml-1 opacity-70">
                              ({SOURCE_LABELS[transaction.categorySource] ?? '—'}
                              {transaction.aiConfidence !== null &&
                                ` ${Math.round(transaction.aiConfidence * 100)} %`}
                              )
                            </span>
                          )}
                          {transaction.isTransfer && (
                            <span className="ml-1 text-accent">· virement interne</span>
                          )}
                        </span>
                      </span>
                      <span
                        className={clsx(
                          'amount shrink-0 text-sm',
                          transaction.amountCents > 0 ? 'text-positive' : 'text-ink',
                        )}
                      >
                        {transaction.amountCents > 0 ? '+' : ''}
                        {formatEur(transaction.amountCents)}
                      </span>
                    </button>

                    {open === transaction.id && (
                      <div className="border-t border-line bg-surface2 px-3 py-3">
                        <p className="mb-2 break-words font-mono text-[11px] text-muted">
                          {transaction.rawLabel}
                        </p>
                        <p className="mb-2 text-xs text-muted">
                          {transaction.accountName}
                        </p>
                        <label className="block">
                          <span className="label">Categorie</span>
                          <select
                            className="input mt-1"
                            defaultValue={transaction.categoryId ?? ''}
                            disabled={busy}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              assign(transaction.id, e.target.value, false);
                            }}
                          >
                            <option value="">Choisir…</option>
                            {categories.map((category) => (
                              <option
                                key={category.id}
                                value={category.id}
                                disabled={category.isParent}
                              >
                                {category.isParent ? category.label : `   ${category.label}`}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="mt-2 text-xs text-muted">
                          Une recategorisation cree une regle : les prochaines
                          operations du meme marchand seront classees seules.
                        </p>
                        <button
                          type="button"
                          className="btn-ghost mt-3 w-full text-sm"
                          disabled={busy || !transaction.categoryId}
                          onClick={() =>
                            transaction.categoryId &&
                            assign(transaction.id, transaction.categoryId, true)
                          }
                        >
                          Appliquer aussi aux operations similaires
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

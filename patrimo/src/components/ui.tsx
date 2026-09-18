import { clsx } from 'clsx';
import { formatEur, formatPercent } from '@/lib/money';

export function Money({
  cents,
  className,
  signed = false,
  compact = false,
  colorize = false,
}: {
  cents: number;
  className?: string;
  signed?: boolean;
  compact?: boolean;
  colorize?: boolean;
}) {
  const formatted = formatEur(cents, compact);
  const display = signed && cents > 0 ? `+${formatted}` : formatted;
  return (
    <span
      className={clsx(
        'amount',
        colorize && cents > 0 && 'text-positive',
        colorize && cents < 0 && 'text-negative',
        className,
      )}
    >
      {display}
    </span>
  );
}

export function Delta({ value, cents }: { value: number; cents?: number }) {
  const positive = value >= 0;
  return (
    <span
      className={clsx(
        'amount text-sm',
        positive ? 'text-positive' : 'text-negative',
      )}
    >
      {positive ? '▲' : '▼'} {formatPercent(Math.abs(value))}
      {cents !== undefined && (
        <span className="ml-1 text-muted">({formatEur(Math.abs(cents), true)})</span>
      )}
    </span>
  );
}

export function StatCard({
  label,
  children,
  hint,
  tone = 'neutral',
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warn';
}) {
  return (
    <div
      className={clsx(
        'card',
        tone === 'positive' && 'border-positive/40',
        tone === 'negative' && 'border-negative/40',
        tone === 'warn' && 'border-warn/40',
      )}
    >
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{children}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  description,
}: {
  title: string;
  action?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {description && <p className="mb-3 text-sm text-muted">{description}</p>}
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Bar({
  ratio,
  tone = 'neutral',
}: {
  ratio: number;
  tone?: 'neutral' | 'over' | 'warn';
}) {
  const width = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
      <div
        className={clsx(
          'h-full rounded-full',
          tone === 'over' && 'bg-negative',
          tone === 'warn' && 'bg-warn',
          tone === 'neutral' && 'bg-accent',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/**
 * Bandeau d'avertissement. Utilise pour signaler qu'une donnee est estimee,
 * perimee, ou produite par un connecteur non officiel — jamais decoratif.
 */
export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn';
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl2 border px-3 py-2 text-sm',
        tone === 'warn'
          ? 'border-warn/40 bg-warn/10 text-ink'
          : 'border-line bg-surface2 text-muted',
      )}
    >
      {title && <div className="font-medium text-ink">{title}</div>}
      <div className={title ? 'mt-0.5' : undefined}>{children}</div>
    </div>
  );
}

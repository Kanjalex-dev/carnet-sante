'use client';

import Link from 'next/link';
import { addMonths, monthLabelShort, parseMonthKey } from '@/lib/dates';

export function MonthPicker({
  month,
  basePath,
}: {
  month: string;
  basePath: string;
}) {
  const { year } = parseMonthKey(month);
  return (
    <div className="flex items-center gap-1 text-sm">
      <Link
        href={`${basePath}?month=${addMonths(month, -1)}`}
        className="btn-quiet px-3"
        aria-label="Mois precedent"
      >
        ‹
      </Link>
      <span className="min-w-[72px] text-center font-medium">
        {monthLabelShort(month)} {String(year).slice(2)}
      </span>
      <Link
        href={`${basePath}?month=${addMonths(month, 1)}`}
        className="btn-quiet px-3"
        aria-label="Mois suivant"
      >
        ›
      </Link>
    </div>
  );
}

import type { CatchUpReference } from '../../domain/catchup'

export function CatchUpCard({ reference }: { reference: CatchUpReference }) {
  return (
    <article className="border-line bg-surface rounded-[12px] border p-3.5">
      <h3 className="m-0 text-[15px] font-semibold tracking-tight">{reference.valenceLabel}</h3>

      <ul className="mt-2.5 mb-0 flex list-none flex-col gap-2.5 p-0">
        {reference.rows.map((row) => (
          <li key={row.ageRange} className="border-line-soft flex flex-col gap-0.5 border-t pt-2 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="text-ink text-[13px] font-semibold">{row.ageRange}</span>
              {row.recommendedOnly && (
                <span className="text-ink-muted border-line bg-paper-sunken shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold">
                  Recommandé
                </span>
              )}
            </div>
            <span className="text-ink-strong text-[12.5px] leading-snug text-pretty">{row.scheme}</span>
            {row.booster && (
              <span className="text-ink-strong text-[12.5px] leading-snug text-pretty">{row.booster}</span>
            )}
            {row.note && (
              <span className="text-ink-muted text-[12px] leading-snug text-pretty">{row.note}</span>
            )}
          </li>
        ))}
      </ul>
    </article>
  )
}

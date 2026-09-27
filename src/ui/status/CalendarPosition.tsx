import type { buildTimeline, VisitPosition } from '../../domain/timeline'
import type { Explanation } from '../Explain'
import { Explainable } from '../Explain'
import { frDate as humanDate, humanAge } from '../format'
import { computedNotice, referentialStamp } from '../legal'

export function CalendarPosition({ timeline, scheduleLabel, explanations, onRecord }: {
  timeline: ReturnType<typeof buildTimeline>
  scheduleLabel: string
  explanations: Map<string, Explanation>
  onRecord: () => void
}) {
  const v: VisitPosition | null = timeline.current
  return (
    <section className="border-blue-edge bg-blue-100 flex flex-col gap-3 rounded-[12px] border p-4">
      <span className="text-ink-muted text-[12px]">
        {humanAge(timeline.ageMonths)} · au {humanDate(timeline.appliedOn)}
      </span>

      {v ? (
        <>
          <h1 className="font-display text-blue-700 m-0 text-[23px] leading-[1.2] font-normal tracking-tight text-pretty">
            À cet âge, le calendrier officiel fait figurer une échéance.
          </h1>
          <p className="text-ink-strong m-0 text-[13.5px] leading-snug text-pretty">
            L’échéance {v.label} est la seule que le calendrier place à cet âge.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {v.doses.map((d) => {
              const explanation = explanations.get(d.valenceCode)
              const label = (
                <>{d.shortLabel} <span className="text-ink-muted">dose {d.doseNumber}</span></>
              )
              return (
                <li key={`${d.valenceCode}-${d.doseNumber}`}
                  className="border-line bg-surface rounded-[8px] border text-[13.5px]">
                  {/* « Meningocoque ACWY dose 2 » ne dit rien a un parent. Le
                      texte du referentiel — ce contre quoi le vaccin protege —
                      est la seule chose qui rende cette ligne comprehensible. */}
                  {explanation
                    ? (
                      <Explainable explanation={explanation}
                        className="flex min-h-11 w-full items-center px-3 py-2">
                        {label}
                      </Explainable>
                    )
                    : <span className="flex min-h-11 items-center px-3 py-2">{label}</span>}
                </li>
              )
            })}
          </ul>
          <button onClick={onRecord}
            className="bg-blue-500 min-h-11 rounded-[9px] px-4 text-[14px] font-semibold text-white">
            Inscrire cette échéance au carnet
          </button>
        </>
      ) : (
        <>
          <h1 className="font-display text-blue-700 m-0 text-[23px] leading-[1.2] font-normal tracking-tight text-pretty">
            Rien n’est prévu au calendrier à cet âge.
          </h1>
          {timeline.nextLandmark && (
            <p className="text-ink-strong m-0 text-[13.5px] leading-snug text-pretty">
              Le prochain repère du calendrier est l’échéance {timeline.nextLandmark.label}.
            </p>
          )}
        </>
      )}

      <p className="text-ink-strong border-line m-0 border-t pt-3 text-[12.5px] leading-snug text-pretty">
        {computedNotice()}
      </p>
      <p className="text-ink-muted m-0 text-[11.5px] tnum">
        {referentialStamp(scheduleLabel, humanDate(timeline.appliedOn))}
      </p>
    </section>
  )
}

/**
 * Le compteur mesure le carnet, pas l'enfant : pas de fraction, pas de barre
 * de progression, pas de decompte d'obligatoires. La phrase sous le chiffre
 * est le composant, pas une mention — c'est elle qui retire au nombre son
 * pouvoir d'accusation.
 */
export function CarnetState({ recorded }: { recorded: number }) {
  return (
    <section className="border-line bg-surface-soft flex flex-col gap-2 rounded-[12px] border p-4">
      <span className="text-ink-muted text-[10.5px] font-bold tracking-[0.09em] uppercase">
        État du carnet
      </span>
      <p className="font-display m-0 text-[19px] leading-tight">
        {recorded} inscription{recorded > 1 ? 's' : ''} enregistrée{recorded > 1 ? 's' : ''}
      </p>
      <p className="text-ink-muted m-0 text-[13px] leading-snug text-pretty">
        Les échéances du calendrier qui ne figurent pas encore dans ce carnet sont listées
        plus bas.
      </p>
      <p className="text-ink-strong border-line m-0 border-t pt-2.5 text-[12.5px] leading-snug text-pretty">
        Une échéance qui n’est pas inscrite ne veut pas dire qu’elle n’a pas eu lieu :
        elle veut dire qu’elle n’est pas encore dans ce carnet.
      </p>
    </section>
  )
}

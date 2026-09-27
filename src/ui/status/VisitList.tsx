import type { DoseGroup } from '../../domain/status'
import type { Explanation } from '../Explain'
import { Explainable } from '../Explain'
import { IconCheck, StatusPill } from '../atoms'

export function VisitSection({ title, groups, onPick, explanations, empty }: {
  title: string
  groups: DoseGroup[]
  onPick: (g: DoseGroup) => void
  explanations: Map<string, Explanation>
  empty?: string
}) {
  if (groups.length === 0 && !empty) return null
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">{title}</h2>
      {groups.length === 0
        ? (
          <p className="border-line bg-surface-soft text-ink-strong m-0 rounded-[12px] border border-dashed px-4 py-5 text-[13.5px] leading-snug text-pretty">
            {empty}
          </p>
        )
        : groups.map((g) => (
          <VisitCard key={g.key} group={g} onPick={onPick} explanations={explanations} />
        ))}
    </section>
  )
}

const RAIL = { done: '#1E7351', 'not-recorded': '#C2D2E1' } as const

export function VisitCard({ group, onPick, explanations }: {
  group: DoseGroup; onPick: (g: DoseGroup) => void; explanations: Map<string, Explanation>
}) {
  const state = group.complete ? 'done' : 'not-recorded'
  const detail = `Calendrier officiel · rendez-vous ${group.label}`
  const mandatory = group.doses.filter((d) => d.mandatory).length

  return (
    <article className="border-line bg-surface rounded-[12px] border p-3.5"
      style={{ borderLeft: `3px solid ${RAIL[state]}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 text-[16px] font-semibold tracking-tight">Rendez-vous {group.label}</h3>
          <p className="text-ink-muted m-0 text-[13px]">
            {group.doses.length} vaccin{group.doses.length > 1 ? 's' : ''}
            {mandatory > 0 && ` · ${mandatory} obligatoire${mandatory > 1 ? 's' : ''}`}
          </p>
        </div>
        <StatusPill state={state} />
      </div>

      {/* Pastilles de 32 px espacées de 8 : la pastille entière est la cible,
          et l'écart reste supérieur à la hauteur pour qu'une ligne ne morde
          jamais sur celle du dessus. */}
      <ul className="mt-2.5 mb-0 flex list-none flex-wrap gap-2 p-0">
        {group.doses.map((d) => {
          const explanation = explanations.get(d.valenceCode)
          const content = (
            <>
              {d.shortLabel}
              <span className="text-ink-faint"> · dose {d.doseNumber}</span>
            </>
          )
          return (
            <li key={`${d.valenceCode}-${d.doseNumber}`}
              className="border-line bg-paper-sunken text-ink-strong rounded-full border text-[12px]">
              {explanation
                ? (
                  <Explainable explanation={explanation} hitArea="none"
                    className="flex min-h-8 items-center px-2.5 py-1.5">
                    {content}
                  </Explainable>
                )
                : <span className="flex min-h-8 items-center px-2.5 py-1.5">{content}</span>}
            </li>
          )
        })}
      </ul>

      <div className="bg-line-soft my-3 h-px" />
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-ink-muted min-w-0 flex-1 text-[12px] font-medium">{detail}</span>
        {group.complete
          ? (
            <button onClick={() => onPick(group)}
              className="border-blue-500 text-blue-500 inline-flex min-h-11 shrink-0 items-center rounded-[8px] border px-3.5 text-[13px] font-semibold">
              Modifier
            </button>
          )
          : (
            <button onClick={() => onPick(group)}
              className="bg-blue-500 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-semibold text-white">
              <IconCheck size={15} color="#FFFFFF" />
              Inscrire
            </button>
          )}
      </div>
    </article>
  )
}

/**
 * Application du calendrier officiel a la date de naissance.
 *
 * Trois regles de presentation, non negociables :
 *  - la mention est au meme corps que le texte qu'elle tempere, jamais reduite ;
 *  - le tampon de referentiel est affiche avec le resultat, pas dans les reglages ;
 *  - le titre reste une echeance du calendrier, jamais une conduite a tenir.
 */

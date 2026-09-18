import { useMemo, useState } from 'react'
import { today as todayFn } from '../domain/dates'
import { computeStatus, groupByVisit, summarise } from '../domain/status'
import { catchUpReferences, type CatchUpReference } from '../domain/catchup'
import type { DoseGroup } from '../domain/status'
import type { Explanation } from './Explain'
import type { Child, Schedule, VaccinationEvent } from '../domain/types'
import { IconCheck, LegalNotice, StatusPill } from './atoms'
import { Emergency } from './Emergency'
import { Reminders } from './Reminders'
import { DoseEntry, type DoseEntryValue } from './DoseEntry'
import { frDate as humanDate, humanAge } from './format'
import { Explainable } from './Explain'
import { buildValenceIndex, progressExplanation } from './explanations'


export function Status({ child, schedule, events, onRecord, onRemindersChange }: {
  child: Child
  schedule: Schedule
  events: VaccinationEvent[]
  onRecord: (group: DoseGroup, value: DoseEntryValue) => void
  onRemindersChange: () => void
}) {
  const [emergency, setEmergency] = useState(false)
  const today = todayFn()
  const [entry, setEntry] = useState<DoseGroup | null>(null)
  const explanations = useMemo(() => buildValenceIndex(schedule), [schedule])

  const { summary, visits } = useMemo(() => {
    const statuses = computeStatus(schedule, child.birthDate, events)
    return {
      summary: summarise(statuses, child.birthDate, today),
      visits: groupByVisit(statuses.flatMap((v) => v.doses)),
    }
  }, [schedule, child.birthDate, events, today])

  // Le tableau de rattrapage ne dépend pas de l'enfant : c'est le référentiel
  // publié, affiché tel quel. Voir domain/catchup.ts.
  const catchUp = useMemo(() => catchUpReferences(schedule), [schedule])

  // On compte les injections non vérifiées, pas les valences : une seule
  // injection en couvre jusqu'à six, et afficher « 21 » pour 12 lignes ment.
  const unverifiedEvents = events.filter((e) => !e.deletedAt && !e.verifiedByUser).length

  const open = visits.filter((g) => !g.complete)
  const recorded = visits.filter((g) => g.complete)

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
      <header className="flex items-center gap-2.5 px-5 pt-3.5 pb-2.5">
        <div className="font-display flex h-9 w-9 items-center justify-center rounded-full text-[17px] font-medium text-white"
          style={{ background: 'linear-gradient(140deg,#275C94 0%,#C46B8B 100%)' }} aria-hidden="true">
          {child.firstName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-grow flex-col">
          <span className="truncate text-[16px] font-semibold tracking-tight">{child.firstName}</span>
          <span className="text-ink-muted truncate text-[12px]">
            {humanAge(summary.ageMonths)} · né{child.sex === 'F' ? 'e' : ''} le {humanDate(child.birthDate)}
          </span>
        </div>
        {/* Un geste, depuis l'écran d'accueil : c'est la seule raison d'être
            de cette fiche. La ranger dans les réglages la rendrait inutile. */}
        <button onClick={() => setEmergency(true)} aria-label="Fiche d'urgence"
          className="border-line-strong bg-surface text-late flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 4.5 6.3v5.1c0 4.4 3.1 8.5 7.5 9.6 4.4-1.1 7.5-5.2 7.5-9.6V6.3L12 3Z" />
            <path d="M12 9v3.5" /><path d="M12 15.5v.01" />
          </svg>
        </button>
      </header>

      {emergency && <Emergency child={child} onClose={() => setEmergency(false)} />}

      <main className="flex flex-1 flex-col gap-5 px-5 pb-6">
        <h1 className="font-display m-0 text-[30px] leading-[1.14] font-normal tracking-tight text-pretty">
          {open.length > 0
            ? <span><span className="font-medium">{open.length} rendez&#8209;vous</span> du calendrier ne sont pas encore inscrits au carnet.</span>
            : <span>Toutes les lignes du calendrier sont inscrites au carnet.</span>}
        </h1>

        <Progress
          satisfied={summary.mandatoryComplete}
          total={summary.mandatoryTotal}
          unverified={unverifiedEvents}
          birthDate={child.birthDate}
        />

        <VisitSection title="Non inscrits au carnet" groups={open} onPick={setEntry} explanations={explanations} />
        <VisitSection title="Inscrits" groups={recorded} onPick={setEntry} explanations={explanations} />

        <Reminders childId={child.id} onChange={onRemindersChange} />

        {catchUp.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
              Rattrapage — tableau officiel
            </h2>
            <p className="text-ink-muted m-0 text-[12px] leading-snug text-pretty">
              Le calendrier publie un schéma différent selon l'âge auquel le rattrapage commence.
              Voici le tableau tel qu'il est publié. Votre médecin détermine celui qui s'applique
              à votre enfant.
            </p>
            {catchUp.map((ref) => <CatchUpCard key={ref.valenceCode} reference={ref} />)}
          </section>
        )}

        <p className="text-ink-faint m-0 text-[11.5px] leading-snug text-pretty">
          Calendrier vaccinal officiel — {schedule.source}, {schedule.id} ·
          source vérifiée le {humanDate(schedule.checkedAt)}.
          Votre médecin adapte ce calendrier à votre enfant.
        </p>
      </main>

      <LegalNotice />

      {entry && (
        <DoseEntry dose={entry} onCancel={() => setEntry(null)}
          onSave={(v) => { onRecord(entry, v); setEntry(null) }} />
      )}
    </div>
  )
}

/**
 * La première question d'un parent n'est pas « qu'est-ce qui est en retard »
 * mais « qu'est-ce qui manque au carnet ». Cet indicateur y répond d'un coup
 * d'œil. Il décrit le carnet, jamais l'état vaccinal de l'enfant.
 */
function Progress({ satisfied, total, unverified, birthDate }: {
  satisfied: number; total: number; unverified: number; birthDate: string
}) {
  const ratio = total === 0 ? 0 : satisfied / total
  const complete = satisfied === total
  return (
    <section className={`rounded-[12px] border p-3.5 ${
      complete ? 'border-ok-border bg-ok-bg' : 'border-line bg-surface'
    }`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
          Vaccins obligatoires inscrits
        </h2>
        <Explainable
          explanation={progressExplanation(satisfied, total, birthDate)}
          ariaLabel={`${satisfied} vaccins obligatoires inscrits sur ${total} — voir l'explication`}
          className={`tnum shrink-0 text-[13px] font-bold ${complete ? 'text-ok' : 'text-ink'}`}
        >
          {satisfied} / {total}
        </Explainable>
      </div>
      <div className="bg-line-soft mt-2.5 h-2 overflow-hidden rounded-full" role="img"
        aria-label={`${satisfied} vaccins obligatoires entièrement inscrits sur ${total}`}>
        <div className={`h-full rounded-full ${complete ? 'bg-ok' : 'bg-blue-500'}`}
          style={{ width: `${Math.max(3, ratio * 100)}%` }} />
      </div>
      <p className="text-ink-muted m-0 mt-2 text-[12px] leading-snug text-pretty">
        {complete
          ? "Toutes les doses obligatoires sont inscrites au carnet."
          : "Appuyez sur le chiffre pour comprendre ce qu'il compte."}
        {unverified > 0 && ` ${unverified} vaccination${unverified > 1 ? 's' : ''} importée${unverified > 1 ? 's' : ''} reste${unverified > 1 ? 'nt' : ''} à vérifier.`}
      </p>
    </section>
  )
}

/**
 * Le rattrapage n'est pas un simple décalage des doses manquées : pour le
 * méningocoque B, le schéma lui-même change selon l'âge auquel il commence.
 * La carte restitue le tableau publié, toutes tranches confondues. Elle ne
 * sélectionne pas la ligne qui s'appliquerait à cet enfant : ce choix est un
 * acte médical, pas un affichage.
 */
function CatchUpCard({ reference }: { reference: CatchUpReference }) {
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

function VisitSection({ title, groups, onPick, explanations }: {
  title: string
  groups: DoseGroup[]
  onPick: (g: DoseGroup) => void
  explanations: Map<string, Explanation>
}) {
  if (groups.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">{title}</h2>
      {groups.map((g) => (
        <VisitCard key={g.key} group={g} onPick={onPick} explanations={explanations} />
      ))}
    </section>
  )
}

const RAIL = { done: '#1E7351', 'not-recorded': '#C2D2E1' } as const

function VisitCard({ group, onPick, explanations }: {
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
        <button onClick={() => onPick(group)}
          className="bg-blue-500 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] px-3.5 text-[13px] font-semibold text-white">
          <IconCheck size={15} color="#FFFFFF" />
          Marquer fait
        </button>
      </div>
    </article>
  )
}

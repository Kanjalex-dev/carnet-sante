import { useMemo, useState } from 'react'
import { today as todayFn } from '../domain/dates'
import { computeStatus, groupByVisit, summarise } from '../domain/status'
import { catchUpReferences } from '../domain/catchup'
import { buildTimeline } from '../domain/timeline'
import { PERMANENT_FOOTER } from './legal'
import type { DoseGroup } from '../domain/status'
import type { Child, Schedule, VaccinationEvent } from '../domain/types'
import { LegalNotice } from './atoms'
import { Emergency } from './Emergency'
import { Reminders } from './Reminders'
import { DoseEntry, type DoseEntryValue } from './DoseEntry'
import { frDate as humanDate, humanAge } from './format'
import { CalendarPosition, CarnetState } from './status/CalendarPosition'
import { CatchUpCard } from './status/CatchUpCard'
import { Progress } from './status/Progress'
import { VisitSection } from './status/VisitList'
import { buildValenceIndex } from './explanations'


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

  // Application du calendrier officiel a la date de naissance. Seule frontiere
  // ou Carnet passe d'une restitution a une indication : voir domain/timeline.ts.
  const timeline = useMemo(
    () => buildTimeline(schedule, child.birthDate, events, today),
    [schedule, child.birthDate, events, today],
  )

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
        {/* Le carnet d'abord. Un carnet de sante sert a garder la trace de ce
            qui a ete fait ; le calendrier n'est qu'un repere en second. */}
        <CarnetState recorded={recorded.length} />

        <VisitSection title="Inscrit au carnet" groups={recorded} onPick={setEntry}
          explanations={explanations}
          empty="Rien n'est encore inscrit. Photographiez une page du carnet papier ou saisissez une vaccination." />

        <CalendarPosition
          timeline={timeline}
          scheduleLabel={schedule.label}
          explanations={explanations}
          onRecord={() => {
            const g = visits.find((v) => v.key === timeline.current?.key)
            if (g) setEntry(g)
          }}
        />

        <Progress
          satisfied={summary.mandatoryComplete}
          total={summary.mandatoryTotal}
          unverified={unverifiedEvents}
          birthDate={child.birthDate}
        />

        {/* Replie par defaut : le decompte reste visible dans l'en-tete, seul
            le scroll disparait. La longueur d'une liste est un message. */}
        <details className="group" open>
          <summary className="border-line bg-surface-soft flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-[12px] border px-3.5 py-3">
            <span className="flex min-w-0 flex-grow flex-col">
              <b className="text-[13.5px] font-semibold">Le reste du calendrier</b>
              <span className="text-ink-muted text-[12px]">
                Ce que le calendrier officiel prévoit aux autres âges
              </span>
            </span>
            <svg className="text-blue-500 shrink-0 transition-transform group-open:rotate-180"
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m7 10 5 5 5-5" />
            </svg>
          </summary>
          <div className="flex flex-col gap-5 pt-3.5">
            <VisitSection title="Pas encore inscrit" groups={open} onPick={setEntry} explanations={explanations} />
          </div>
        </details>

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

        <p className="text-ink-faint m-0 text-[11.5px] leading-snug text-pretty">{PERMANENT_FOOTER}</p>
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

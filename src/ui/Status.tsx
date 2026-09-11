import { useMemo, useState } from 'react'
import { addMonths, today as todayFn } from '../domain/dates'
import { computeStatus, groupByVisit, proposeCatchUp, summarise, upcomingDoses } from '../domain/status'
import type { DoseGroup } from '../domain/status'
import type { Child, Schedule, VaccinationEvent } from '../domain/types'
import { IconCheck, LegalNotice, StatusPill } from './atoms'
import { DoseEntry, type DoseEntryValue } from './DoseEntry'
import { frDate as humanDate, humanAge } from './format'


export function Status({ child, schedule, events, onRecord }: {
  child: Child
  schedule: Schedule
  events: VaccinationEvent[]
  onRecord: (group: DoseGroup, value: DoseEntryValue) => void
}) {
  const today = todayFn()
  const [entry, setEntry] = useState<DoseGroup | null>(null)

  const { summary, soon, catchUp } = useMemo(() => {
    const statuses = computeStatus(schedule, child.birthDate, events, today)
    return {
      statuses,
      summary: summarise(statuses, child.birthDate, today),
      soon: groupByVisit(upcomingDoses(statuses, today)),
      catchUp: proposeCatchUp(schedule, statuses, today),
    }
  }, [schedule, child.birthDate, events, today])

  // On compte les injections non vérifiées, pas les valences : une seule
  // injection en couvre jusqu'à six, et afficher « 21 » pour 12 lignes ment.
  const unverifiedEvents = events.filter((e) => !e.deletedAt && !e.verifiedByUser).length

  const late = soon.filter((g) => g.state === 'late')
  const due = soon.filter((g) => g.state === 'due')
  const upcoming = soon.filter((g) => g.state === 'upcoming')
  const horizon = humanDate(addMonths(today, 3))

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
      <header className="flex items-center gap-2.5 px-5 pt-3.5 pb-2.5">
        <div className="font-display flex h-9 w-9 items-center justify-center rounded-full text-[17px] font-medium text-white"
          style={{ background: 'linear-gradient(140deg,#275C94 0%,#C46B8B 100%)' }} aria-hidden="true">
          {child.firstName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[16px] font-semibold tracking-tight">{child.firstName}</span>
          <span className="text-ink-muted truncate text-[12px]">
            {humanAge(summary.ageMonths)} · né{child.sex === 'F' ? 'e' : ''} le {humanDate(child.birthDate)}
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-5 pb-6">
        <h1 className="font-display m-0 text-[30px] leading-[1.14] font-normal tracking-tight text-pretty">
          {late.length > 0 && <span className="text-late font-medium">{late.length} rendez&#8209;vous en retard</span>}
          {late.length > 0 && (due.length + upcoming.length > 0) && <br />}
          {due.length + upcoming.length > 0 && (
            <span>{late.length > 0 ? 'et ' : ''}{due.length + upcoming.length} à prévoir d'ici {horizon}.</span>
          )}
          {soon.length === 0 && <span>Rien à prévoir dans les trois prochains mois.</span>}
        </h1>

        <Progress
          satisfied={summary.mandatorySatisfied}
          total={summary.mandatoryTotal}
          unverified={unverifiedEvents}
        />

        <VisitSection title="En retard" groups={late} onPick={setEntry} />
        <VisitSection title="À faire maintenant" groups={due} onPick={setEntry} />
        <VisitSection title="Dans les 3 mois" groups={upcoming} onPick={setEntry} />

        {catchUp.length > 0 && (
          <section className="border-late-border bg-late-bg rounded-[12px] border p-3.5">
            <h2 className="text-late m-0 text-[11px] font-bold tracking-[0.09em] uppercase">Rattrapage proposé</h2>
            <ul className="mt-2 mb-0 flex list-none flex-col gap-1 p-0">
              {catchUp.map((s) => (
                <li key={`${s.valenceCode}-${s.doseNumber}`} className="text-ink-strong text-[13.5px]">
                  {s.shortLabel} dose {s.doseNumber} — à partir du <span className="tnum">{humanDate(s.proposedDate)}</span>
                </li>
              ))}
            </ul>
            <p className="text-ink-strong mt-2.5 mb-0 text-[12px] leading-snug text-pretty">
              Proposition calculée à partir du calendrier. <strong>À faire confirmer par un médecin</strong> avant toute injection.
            </p>
          </section>
        )}


        <p className="text-ink-faint m-0 text-[11.5px]">
          Calendrier {schedule.id} · source vérifiée le {humanDate(schedule.checkedAt)}
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
 * mais « est-ce qu'on est à jour ». Cet indicateur y répond d'un coup d'œil,
 * sans se substituer au détail.
 */
function Progress({ satisfied, total, unverified }: {
  satisfied: number; total: number; unverified: number
}) {
  const ratio = total === 0 ? 0 : satisfied / total
  const complete = satisfied === total
  return (
    <section className={`rounded-[12px] border p-3.5 ${
      complete ? 'border-ok-border bg-ok-bg' : 'border-line bg-surface'
    }`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
          Obligations vaccinales
        </h2>
        <span className={`tnum shrink-0 text-[13px] font-bold ${complete ? 'text-ok' : 'text-ink'}`}>
          {satisfied} / {total}
        </span>
      </div>
      <div className="bg-line-soft mt-2.5 h-2 overflow-hidden rounded-full" role="img"
        aria-label={`${satisfied} obligations satisfaites sur ${total}`}>
        <div className={`h-full rounded-full ${complete ? 'bg-ok' : 'bg-blue-500'}`}
          style={{ width: `${Math.max(3, ratio * 100)}%` }} />
      </div>
      <p className="text-ink-muted m-0 mt-2 text-[12px] leading-snug text-pretty">
        {complete
          ? "Toutes les obligations sont satisfaites à ce jour."
          : "Calcul fondé sur le calendrier applicable à la date de naissance de l'enfant."}
        {unverified > 0 && ` ${unverified} vaccination${unverified > 1 ? 's' : ''} importée${unverified > 1 ? 's' : ''} reste${unverified > 1 ? 'nt' : ''} à vérifier.`}
      </p>
    </section>
  )
}

function VisitSection({ title, groups, onPick }: {
  title: string; groups: DoseGroup[]; onPick: (g: DoseGroup) => void
}) {
  if (groups.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">{title}</h2>
      {groups.map((g) => <VisitCard key={g.key} group={g} onPick={onPick} />)}
    </section>
  )
}

const RAIL: Record<string, string> = { late: '#B23D1F', due: '#A87F1F', upcoming: '#C2D2E1' }

function VisitCard({ group, onPick }: { group: DoseGroup; onPick: (g: DoseGroup) => void }) {
  const detail =
    group.state === 'late' ? `Fenêtre dépassée depuis ${group.daysLate} jours`
    : group.state === 'due' ? `À faire depuis ${group.daysSinceTarget} jours`
    : `Cible le ${humanDate(group.targetDate)}`
  const mandatory = group.doses.filter((d) => d.mandatory).length

  return (
    <article className="border-line bg-surface rounded-[12px] border p-3.5"
      style={{ borderLeft: `3px solid ${RAIL[group.state]}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 text-[16px] font-semibold tracking-tight">Rendez-vous {group.label}</h3>
          <p className="text-ink-muted m-0 text-[13px]">
            {group.doses.length} valence{group.doses.length > 1 ? 's' : ''}
            {mandatory > 0 && ` · ${mandatory} obligatoire${mandatory > 1 ? 's' : ''}`}
          </p>
        </div>
        <StatusPill state={group.state} />
      </div>

      <ul className="mt-2.5 mb-0 flex list-none flex-wrap gap-1.5 p-0">
        {group.doses.map((d) => (
          <li key={`${d.valenceCode}-${d.doseNumber}`}
            className="border-line bg-paper-sunken text-ink-strong rounded-full border px-2.5 py-1 text-[12px]">
            {d.shortLabel}<span className="text-ink-faint"> · {d.doseNumber}</span>
          </li>
        ))}
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

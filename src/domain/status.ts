import {
  addDays, addMonths, ageInMonths, compare, daysBetween, type ISODate,
} from './dates'
import type {
  DoseStatus, Schedule, ValenceSpec, ValenceStatus, VaccinationEvent,
} from './types'

/** Une valence s'applique-t-elle à un enfant né à cette date, et est-elle obligatoire ? */
export function resolveValence(
  v: ValenceSpec,
  birthDate: ISODate,
): { applicable: boolean; mandatory: boolean } {
  const from = v.mandatoryBirthFrom
  const until = v.mandatoryBirthUntil
  const mandatory =
    from !== undefined &&
    compare(birthDate, from) >= 0 &&
    (until === undefined || compare(birthDate, until) <= 0)

  // Une valence remplacée (méningo C) ne s'applique plus aux cohortes postérieures.
  if (v.supersededBy && until !== undefined && compare(birthDate, until) > 0) {
    return { applicable: false, mandatory: false }
  }
  // Une obligation qui n'a pas encore commencé pour cette cohorte et qui n'est
  // pas recommandée par ailleurs ne s'applique pas.
  if (!mandatory && !v.recommended) return { applicable: false, mandatory: false }

  return { applicable: true, mandatory }
}

/** Les événements d'une valence, non supprimés, du plus ancien au plus récent. */
function administeredFor(code: string, events: VaccinationEvent[]): VaccinationEvent[] {
  return events
    .filter((e) => !e.deletedAt && e.valences.includes(code))
    .sort((a, b) => compare(a.date, b.date))
}

export function computeValenceStatus(
  v: ValenceSpec,
  birthDate: ISODate,
  events: VaccinationEvent[],
  today: ISODate,
  mandatory: boolean,
): ValenceStatus {
  const given = administeredFor(v.code, events)
  const doses: DoseStatus[] = []

  for (const spec of v.doses) {
    const event = given[spec.n - 1]
    const target = addMonths(birthDate, spec.targetAgeMonths)
    const latest = addMonths(birthDate, spec.maxAgeMonths)

    let earliest = addMonths(birthDate, spec.minAgeMonths)
    const previous = given[spec.n - 2]
    if (spec.minIntervalDays !== undefined && previous) {
      const afterInterval = addDays(previous.date, spec.minIntervalDays)
      if (compare(afterInterval, earliest) > 0) earliest = afterInterval
    }

    const base = {
      valenceCode: v.code,
      valenceLabel: v.label,
      shortLabel: v.shortLabel,
      mandatory,
      doseNumber: spec.n,
      doseLabel: spec.label,
      earliestDate: earliest,
      targetDate: target,
      latestDate: latest,
    }

    if (event) {
      doses.push({
        ...base,
        state: 'done',
        administeredOn: event.date,
        verified: event.verifiedByUser,
        eventId: event.id,
      })
    } else if (compare(today, latest) > 0) {
      // Fenêtre dépassée : en retard si obligatoire, sans objet si recommandé.
      doses.push({
        ...base,
        state: mandatory ? 'late' : 'not-applicable',
        daysLate: mandatory ? daysBetween(latest, today) : undefined,
      })
    } else if (compare(today, target) >= 0) {
      doses.push({ ...base, state: 'due', daysSinceTarget: daysBetween(target, today) })
    } else {
      doses.push({ ...base, state: 'upcoming' })
    }
  }

  return {
    code: v.code,
    label: v.label,
    shortLabel: v.shortLabel,
    mandatory,
    doses,
    complete: doses.every((d) => d.state === 'done' || d.state === 'not-applicable'),
    hasLate: doses.some((d) => d.state === 'late'),
    hasUnverified: doses.some((d) => d.state === 'done' && d.verified === false),
  }
}

export function computeStatus(
  schedule: Schedule,
  birthDate: ISODate,
  events: VaccinationEvent[],
  today: ISODate,
): ValenceStatus[] {
  const out: ValenceStatus[] = []
  for (const v of schedule.valences) {
    const { applicable, mandatory } = resolveValence(v, birthDate)
    if (!applicable) continue
    out.push(computeValenceStatus(v, birthDate, events, today, mandatory))
  }
  return out
}

export interface StatusSummary {
  ageMonths: number
  lateCount: number
  dueSoonCount: number
  upToDateCount: number
  unverifiedCount: number
  mandatoryTotal: number
  mandatorySatisfied: number
}

/** Doses dues ou en retard, plus celles à venir dans `horizonDays`. */
export function upcomingDoses(
  statuses: ValenceStatus[],
  today: ISODate,
  horizonDays = 92,
): DoseStatus[] {
  const horizon = addDays(today, horizonDays)
  return statuses
    .flatMap((v) => v.doses)
    .filter(
      (d) =>
        d.state === 'late' ||
        d.state === 'due' ||
        (d.state === 'upcoming' && compare(d.targetDate, horizon) <= 0),
    )
    .sort((a, b) => compare(a.targetDate, b.targetDate))
}

export function summarise(
  statuses: ValenceStatus[],
  birthDate: ISODate,
  today: ISODate,
): StatusSummary {
  const doses = statuses.flatMap((v) => v.doses)
  const mandatory = statuses.filter((v) => v.mandatory)
  return {
    ageMonths: ageInMonths(birthDate, today),
    lateCount: doses.filter((d) => d.state === 'late').length,
    dueSoonCount: upcomingDoses(statuses, today).filter((d) => d.state !== 'late').length,
    upToDateCount: statuses.filter((v) => v.complete).length,
    unverifiedCount: doses.filter((d) => d.state === 'done' && d.verified === false).length,
    mandatoryTotal: mandatory.length,
    mandatorySatisfied: mandatory.filter((v) => !v.hasLate).length,
  }
}

export interface CatchUpStep {
  valenceCode: string
  shortLabel: string
  doseNumber: number
  proposedDate: ISODate
}

/**
 * Propose un rattrapage pour les doses en retard : la première au plus tôt,
 * les suivantes espacées de l'intervalle minimal du calendrier.
 * À faire confirmer par un médecin — l'application ne prescrit rien.
 */
export function proposeCatchUp(
  schedule: Schedule,
  statuses: ValenceStatus[],
  today: ISODate,
): CatchUpStep[] {
  const steps: CatchUpStep[] = []
  for (const v of statuses) {
    const late = v.doses.filter((d) => d.state === 'late')
    if (late.length === 0) continue
    const spec = schedule.valences.find((s) => s.code === v.code)
    let cursor = today
    for (const dose of late) {
      const interval = spec?.doses.find((d) => d.n === dose.doseNumber)?.minIntervalDays
      if (steps.length && interval !== undefined && steps[steps.length - 1].valenceCode === v.code) {
        cursor = addDays(cursor, interval)
      }
      steps.push({
        valenceCode: v.code,
        shortLabel: v.shortLabel,
        doseNumber: dose.doseNumber,
        proposedDate: cursor,
      })
    }
  }
  return steps
}


export interface DoseGroup {
  /** Clé stable : date cible commune. */
  key: ISODate
  label: string
  targetDate: ISODate
  state: 'late' | 'due' | 'upcoming'
  doses: DoseStatus[]
  daysLate?: number
  daysSinceTarget?: number
}

const SEVERITY = { late: 3, due: 2, upcoming: 1 } as const

/**
 * Regroupe les doses par rendez-vous. Dans la réalité une injection couvre
 * plusieurs valences (un hexavalent en couvre six) : présenter une carte par
 * valence produit un mur illisible et ne correspond à aucun geste réel.
 */
export function groupByVisit(doses: DoseStatus[]): DoseGroup[] {
  const byDate = new Map<ISODate, DoseStatus[]>()
  for (const d of doses) {
    if (d.state !== 'late' && d.state !== 'due' && d.state !== 'upcoming') continue
    const list = byDate.get(d.targetDate)
    if (list) list.push(d)
    else byDate.set(d.targetDate, [d])
  }

  const groups: DoseGroup[] = []
  for (const [targetDate, list] of byDate) {
    let state: 'late' | 'due' | 'upcoming' = 'upcoming'
    for (const d of list) {
      const s = d.state as 'late' | 'due' | 'upcoming'
      if (SEVERITY[s] > SEVERITY[state]) state = s
    }
    const reference = list.find((d) => d.state === state)!
    groups.push({
      key: targetDate,
      // Les doses d'un même rendez-vous partagent leur libellé d'âge.
      label: reference.doseLabel,
      targetDate,
      state,
      doses: [...list].sort((a, b) => a.shortLabel.localeCompare(b.shortLabel, 'fr')),
      daysLate: reference.daysLate,
      daysSinceTarget: reference.daysSinceTarget,
    })
  }
  return groups.sort((a, b) => compare(a.targetDate, b.targetDate))
}

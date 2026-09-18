import { ageInMonths, compare, type ISODate } from './dates'
import type {
  DoseStatus, Schedule, ValenceSpec, ValenceStatus, VaccinationEvent,
} from './types'

/**
 * Lecture du carnet.
 *
 * Ce module restitue deux choses et rien de plus : le calendrier vaccinal
 * officiel tel qu'il est publie, et ce que le parent a inscrit. Il ne calcule
 * aucun retard, aucune date a venir, aucune recommandation pour un enfant
 * donne. Le carnet papier ne le fait pas davantage ; l'interpretation revient
 * au medecin qui suit l'enfant.
 */

/** Une valence s'applique-t-elle a un enfant ne a cette date, et est-elle obligatoire ? */
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

  // Une valence remplacee (meningo C) ne s'applique plus aux cohortes posterieures.
  if (v.supersededBy && until !== undefined && compare(birthDate, until) > 0) {
    return { applicable: false, mandatory: false }
  }
  if (!mandatory && !v.recommended) return { applicable: false, mandatory: false }

  return { applicable: true, mandatory }
}

/** Les evenements d'une valence, non supprimes, du plus ancien au plus recent. */
function administeredFor(code: string, events: VaccinationEvent[]): VaccinationEvent[] {
  return events
    .filter((e) => !e.deletedAt && e.valences.includes(code))
    .sort((a, b) => compare(a.date, b.date))
}

export function computeValenceStatus(
  v: ValenceSpec,
  _birthDate: ISODate,
  events: VaccinationEvent[],
  mandatory: boolean,
): ValenceStatus {
  const given = administeredFor(v.code, events)
  const doses: DoseStatus[] = []

  for (const spec of v.doses) {
    const event = given[spec.n - 1]
    const base = {
      valenceCode: v.code,
      valenceLabel: v.label,
      shortLabel: v.shortLabel,
      mandatory,
      doseNumber: spec.n,
      doseLabel: spec.label,
      targetAgeMonths: spec.targetAgeMonths,
    }

    doses.push(
      event
        ? {
            ...base,
            state: 'done',
            administeredOn: event.date,
            verified: event.verifiedByUser,
            eventId: event.id,
          }
        : { ...base, state: 'not-recorded' },
    )
  }

  return {
    code: v.code,
    label: v.label,
    shortLabel: v.shortLabel,
    mandatory,
    doses,
    complete: doses.every((d) => d.state === 'done'),
    hasUnverified: doses.some((d) => d.state === 'done' && d.verified === false),
  }
}

export function computeStatus(
  schedule: Schedule,
  birthDate: ISODate,
  events: VaccinationEvent[],
): ValenceStatus[] {
  const out: ValenceStatus[] = []
  for (const v of schedule.valences) {
    const { applicable, mandatory } = resolveValence(v, birthDate)
    if (!applicable) continue
    out.push(computeValenceStatus(v, birthDate, events, mandatory))
  }
  return out
}

export interface StatusSummary {
  ageMonths: number
  /** Doses inscrites au carnet. */
  recordedCount: number
  /** Lignes du calendrier officiel sans inscription correspondante. */
  notRecordedCount: number
  /** Doses inscrites depuis une photo, que le parent n'a pas encore relues. */
  unverifiedCount: number
  mandatoryTotal: number
  mandatoryComplete: number
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
    recordedCount: doses.filter((d) => d.state === 'done').length,
    notRecordedCount: doses.filter((d) => d.state === 'not-recorded').length,
    unverifiedCount: doses.filter((d) => d.state === 'done' && d.verified === false).length,
    mandatoryTotal: mandatory.length,
    mandatoryComplete: mandatory.filter((v) => v.complete).length,
  }
}

export interface DoseGroup {
  /** Cle stable : l'age prevu par le calendrier, en mois. */
  key: number
  label: string
  targetAgeMonths: number
  doses: DoseStatus[]
  /** Toutes les doses de ce rendez-vous sont inscrites. */
  complete: boolean
}

/**
 * Regroupe les doses par rendez-vous du calendrier officiel, c'est-a-dire par
 * age — « 2 mois », « 5 mois », « 11 mois ». C'est la presentation du carnet
 * papier, et c'est aussi la realite du geste : une injection couvre plusieurs
 * valences, un hexavalent en couvre six.
 */
export function groupByVisit(doses: DoseStatus[]): DoseGroup[] {
  const byAge = new Map<number, DoseStatus[]>()
  for (const d of doses) {
    const list = byAge.get(d.targetAgeMonths)
    if (list) list.push(d)
    else byAge.set(d.targetAgeMonths, [d])
  }

  const groups: DoseGroup[] = []
  for (const [targetAgeMonths, list] of byAge) {
    groups.push({
      key: targetAgeMonths,
      label: list[0].doseLabel,
      targetAgeMonths,
      doses: [...list].sort((a, b) => a.shortLabel.localeCompare(b.shortLabel, 'fr')),
      complete: list.every((d) => d.state === 'done'),
    })
  }
  return groups.sort((a, b) => a.targetAgeMonths - b.targetAgeMonths)
}

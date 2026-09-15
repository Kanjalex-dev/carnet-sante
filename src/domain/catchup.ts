import { addDays, addMonths, ageInMonths, compare, type ISODate } from './dates'
import type { Schedule, ValenceSpec, VaccinationEvent } from './types'

/**
 * Rattrapage vaccinal.
 *
 * Le calendrier ne se contente pas de décaler les doses manquées : pour
 * certaines valences, le schéma lui-même change selon l'âge auquel le
 * rattrapage commence. Le méningocoque B en est l'exemple — deux doses et un
 * rappel avant 2 ans, deux doses sans rappel entre 2 et 5 ans.
 *
 * Ces règles viennent du référentiel, jamais du code. L'application propose,
 * elle ne prescrit pas : chaque plan renvoie au médecin.
 */

export interface CatchUpRule {
  fromAgeMonths: number
  toAgeMonths: number
  primaryDoses: number
  minIntervalDays: number
  booster: boolean
  boosterLabel?: string
  boosterMinAgeMonths?: number
  boosterMaxAgeMonths?: number
  boosterMinIntervalDays?: number
  recommendedOnly?: boolean
  note?: string
  label: string
}

export interface CatchUpStep {
  /** Rang de la dose dans le schéma de rattrapage. */
  n: number
  /** Date au plus tôt à laquelle cette dose peut être administrée. */
  earliest: ISODate
  /** Date au plus tard, quand la règle en impose une. */
  latest?: ISODate
  label: string
  isBooster: boolean
}

export interface CatchUpPlan {
  valenceCode: string
  valenceLabel: string
  /** Libellé de la tranche d'âge appliquée. */
  ruleLabel: string
  /** Nombre de doses déjà reçues et comptées dans ce schéma. */
  alreadyGiven: number
  steps: CatchUpStep[]
  note?: string
  recommendedOnly: boolean
}

function givenDates(code: string, events: VaccinationEvent[]): ISODate[] {
  return events
    .filter((e) => !e.deletedAt && e.valences.includes(code))
    .map((e) => e.date)
    .sort(compare)
}

export function ruleFor(v: ValenceSpec, ageMonths: number): CatchUpRule | undefined {
  const rules = (v as ValenceSpec & { catchUp?: CatchUpRule[] }).catchUp
  if (!rules) return undefined
  return rules.find((r) => ageMonths >= r.fromAgeMonths && ageMonths <= r.toAgeMonths)
}

/**
 * Construit le plan de rattrapage d'une valence pour un enfant donné.
 * Renvoie `null` quand aucune règle ne s'applique, ou quand le schéma de
 * rattrapage est déjà complet.
 */
export function catchUpPlan(
  v: ValenceSpec,
  birthDate: ISODate,
  today: ISODate,
  events: VaccinationEvent[],
): CatchUpPlan | null {
  const ageMonths = ageInMonths(birthDate, today)
  const rule = ruleFor(v, ageMonths)
  if (!rule) return null

  const given = givenDates(v.code, events)
  const total = rule.primaryDoses + (rule.booster ? 1 : 0)
  if (given.length >= total) return null

  const steps: CatchUpStep[] = []
  // Point de départ : aujourd'hui, ou l'intervalle minimal après la dernière
  // dose reçue si celle-ci est récente.
  let cursor = today
  const last = given[given.length - 1]
  if (last) {
    const after = addDays(last, rule.minIntervalDays)
    if (compare(after, cursor) > 0) cursor = after
  }

  for (let n = given.length + 1; n <= rule.primaryDoses; n += 1) {
    steps.push({
      n,
      earliest: cursor,
      label: `Dose ${n} sur ${rule.primaryDoses}`,
      isBooster: false,
    })
    cursor = addDays(cursor, rule.minIntervalDays)
  }

  if (rule.booster && given.length < total) {
    // Le rappel est borné soit par un âge, soit par un délai après la
    // primovaccination — selon la tranche.
    let earliest = cursor
    if (rule.boosterMinAgeMonths !== undefined) {
      const byAge = addMonths(birthDate, rule.boosterMinAgeMonths)
      if (compare(byAge, earliest) > 0) earliest = byAge
    }
    if (rule.boosterMinIntervalDays !== undefined) {
      const base = steps.length > 0 ? steps[steps.length - 1].earliest : (last ?? today)
      const byInterval = addDays(base, rule.boosterMinIntervalDays)
      if (compare(byInterval, earliest) > 0) earliest = byInterval
    }
    steps.push({
      n: rule.primaryDoses + 1,
      earliest,
      latest: rule.boosterMaxAgeMonths !== undefined
        ? addMonths(birthDate, rule.boosterMaxAgeMonths)
        : undefined,
      label: rule.boosterLabel ?? 'Rappel',
      isBooster: true,
    })
  }

  if (steps.length === 0) return null

  return {
    valenceCode: v.code,
    valenceLabel: v.shortLabel,
    ruleLabel: rule.label,
    alreadyGiven: given.length,
    steps,
    note: rule.note,
    recommendedOnly: rule.recommendedOnly === true,
  }
}

/** Tous les plans applicables à un enfant, pour les valences concernées. */
export function catchUpPlans(
  schedule: Schedule,
  birthDate: ISODate,
  today: ISODate,
  events: VaccinationEvent[],
): CatchUpPlan[] {
  const out: CatchUpPlan[] = []
  for (const v of schedule.valences) {
    const plan = catchUpPlan(v, birthDate, today, events)
    if (plan) out.push(plan)
  }
  return out
}

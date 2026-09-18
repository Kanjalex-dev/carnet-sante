import type { Schedule, ValenceSpec } from './types'

/**
 * Restitution du référentiel de rattrapage.
 *
 * Ce module ne prend aucune donnee d'enfant en entree : ni date de naissance,
 * ni doses recues, ni date du jour. C'est deliberé. Choisir la tranche d'âge
 * applicable à un enfant donné et en déduire des dates, ce serait appliquer
 * une règle à un patient. Ici on se contente d'afficher le tableau publié par
 * le ministère, comme le ferait une page du carnet papier : le parent lit, et
 * son médecin décide.
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

/** Une ligne du tableau, prête à afficher. Aucune date, aucun calcul. */
export interface CatchUpRow {
  /** Libellé de la tranche d'âge, tel qu'il figure au référentiel. */
  ageRange: string
  /** Schéma en clair : nombre de doses et intervalle minimal. */
  scheme: string
  /** Rappel prévu par cette tranche, quand il y en a un. */
  booster?: string
  note?: string
  recommendedOnly: boolean
}

export interface CatchUpReference {
  valenceCode: string
  valenceLabel: string
  rows: CatchUpRow[]
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? `${n} ${many}` : `${n} ${one}`
}

function intervalText(days: number): string {
  if (days % 30 === 0) return `${plural(days / 30, 'mois', 'mois')}`
  return `${plural(days, 'jour', 'jours')}`
}

export function describeRule(r: CatchUpRule): CatchUpRow {
  const scheme = r.primaryDoses > 1
    ? `${plural(r.primaryDoses, 'dose', 'doses')}, espacées d'au moins ${intervalText(r.minIntervalDays)}`
    : '1 dose'

  let booster: string | undefined
  if (r.booster) {
    const parts: string[] = []
    if (r.boosterMinAgeMonths !== undefined) parts.push(`à partir de ${r.boosterMinAgeMonths} mois`)
    if (r.boosterMaxAgeMonths !== undefined) parts.push(`avant ${r.boosterMaxAgeMonths} mois`)
    if (r.boosterMinIntervalDays !== undefined) {
      parts.push(`au moins ${intervalText(r.boosterMinIntervalDays)} après la dernière dose`)
    }
    booster = parts.length > 0
      ? `${r.boosterLabel ?? 'Rappel'} : ${parts.join(', ')}`
      : (r.boosterLabel ?? 'Rappel')
  }

  return {
    ageRange: r.label,
    scheme,
    booster,
    note: r.note,
    recommendedOnly: r.recommendedOnly === true,
  }
}

/** Le tableau de rattrapage d'une valence, ou `null` si le référentiel n'en publie pas. */
export function catchUpReference(v: ValenceSpec): CatchUpReference | null {
  const rules = (v as ValenceSpec & { catchUp?: CatchUpRule[] }).catchUp
  if (!rules || rules.length === 0) return null
  return {
    valenceCode: v.code,
    valenceLabel: v.shortLabel,
    rows: [...rules]
      .sort((a, b) => a.fromAgeMonths - b.fromAgeMonths)
      .map(describeRule),
  }
}

/** Tous les tableaux publiés par le calendrier, dans l'ordre du référentiel. */
export function catchUpReferences(schedule: Schedule): CatchUpReference[] {
  const out: CatchUpReference[] = []
  for (const v of schedule.valences) {
    const ref = catchUpReference(v)
    if (ref) out.push(ref)
  }
  return out
}

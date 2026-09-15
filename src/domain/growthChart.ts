import { valueAtZScore, zScoreToPercentile } from 'who-growth-standards'
import { daysBetween, type ISODate } from './dates'
import type { GrowthMeasure } from './types'

/**
 * Courbes de croissance, référence OMS 0–5 ans.
 *
 * L'application place une mesure par rapport à une population de référence.
 * Elle n'interprète pas : une croissance hors des couloirs peut être
 * parfaitement normale pour un enfant donné, et l'inverse est vrai aussi.
 * Ce jugement appartient au médecin qui voit l'enfant.
 */

export type Indicator = 'weight' | 'height' | 'head'
export type Sex = 'F' | 'M'

/** Borne des tables OMS : 1856 jours, soit un peu plus de 5 ans. */
export const MAX_AGE_DAYS = 1856

const TABLE: Record<Indicator, 'wfa' | 'lhfa' | 'hcfa'> = {
  weight: 'wfa',
  height: 'lhfa',
  head: 'hcfa',
}

export const INDICATORS: { key: Indicator; label: string; unit: string; short: string }[] = [
  { key: 'weight', label: 'Poids', unit: 'kg', short: 'Poids' },
  { key: 'height', label: 'Taille', unit: 'cm', short: 'Taille' },
  { key: 'head', label: 'Périmètre crânien', unit: 'cm', short: 'Périmètre crânien' },
]

function sexKey(sex: Sex): 'female' | 'male' {
  return sex === 'F' ? 'female' : 'male'
}

export function valueOf(m: GrowthMeasure, indicator: Indicator): number | undefined {
  if (indicator === 'weight') return m.weightKg
  if (indicator === 'height') return m.heightCm
  return m.headCircumferenceCm
}

export interface RefPoint { ageDays: number; value: number }

/**
 * Courbe de référence à un écart-type donné, échantillonnée pour le tracé.
 * Les courbes OMS se lisent en écarts-types, pas en percentiles.
 */
export function referenceCurve(
  indicator: Indicator,
  sex: Sex,
  z: number,
  maxAgeDays = MAX_AGE_DAYS,
  stepDays = 30,
): RefPoint[] {
  const out: RefPoint[] = []
  const end = Math.min(maxAgeDays, MAX_AGE_DAYS)
  for (let d = 0; d <= end; d += stepDays) {
    out.push({ ageDays: d, value: valueAtZScore(TABLE[indicator], sexKey(sex), z, d) })
  }
  if (out[out.length - 1].ageDays !== end) {
    out.push({ ageDays: end, value: valueAtZScore(TABLE[indicator], sexKey(sex), z, end) })
  }
  return out
}

export interface PlottedMeasure {
  id: string
  date: ISODate
  ageDays: number
  value: number
  zScore: number
  percentile: number
  verified: boolean
}

/** Mesures exploitables pour un indicateur, situées par rapport à la référence. */
export function plotMeasures(
  measures: GrowthMeasure[],
  birthDate: ISODate,
  indicator: Indicator,
  sex: Sex,
): { points: PlottedMeasure[]; outOfRange: number } {
  const points: PlottedMeasure[] = []
  let outOfRange = 0

  for (const m of measures) {
    if (m.deletedAt) continue
    const value = valueOf(m, indicator)
    if (value === undefined || value <= 0) continue

    const ageDays = daysBetween(birthDate, m.date)
    if (ageDays < 0 || ageDays > MAX_AGE_DAYS) { outOfRange += 1; continue }

    const median = valueAtZScore(TABLE[indicator], sexKey(sex), 0, ageDays)
    const z = solveZ(indicator, sex, ageDays, value, median)
    points.push({
      id: m.id,
      date: m.date,
      ageDays,
      value,
      zScore: z,
      percentile: zScoreToPercentile(z),
      verified: m.verifiedByUser,
    })
  }

  points.sort((a, b) => a.ageDays - b.ageDays)
  return { points, outOfRange }
}

/**
 * Retrouve l'écart-type d'une mesure par dichotomie sur la courbe de référence.
 * Passer par `valueAtZScore` évite de réimplémenter la formule LMS : la seule
 * source de vérité reste la table OMS.
 */
function solveZ(
  indicator: Indicator, sex: Sex, ageDays: number, value: number, median: number,
): number {
  if (value === median) return 0
  let lo = -6
  let hi = 6
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    const v = valueAtZScore(TABLE[indicator], sexKey(sex), mid, ageDays)
    if (v < value) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Formulation neutre de la position, sans jugement. */
export function positionLabel(percentile: number): string {
  const p = Math.round(percentile)
  if (p <= 1) return 'sous le 1ᵉʳ centile'
  if (p >= 99) return 'au-dessus du 99ᵉ centile'
  return `${p}ᵉ centile`
}

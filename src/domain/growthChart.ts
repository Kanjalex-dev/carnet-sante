import { valueAtZScore } from 'who-growth-standards'
import { daysBetween, type ISODate } from './dates'
import type { GrowthMeasure } from './types'

/**
 * Courbes de croissance, référence OMS 0–5 ans.
 *
 * L'application reporte les mesures saisies sur les courbes de référence,
 * exactement comme on les reporte sur les pages du carnet papier. Elle ne
 * restitue ni centile ni écart-type : situer un enfant sur une échelle, c'est
 * déjà une interprétation, et elle appartient au médecin qui le voit.
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
  verified: boolean
}

/** Mesures exploitables pour un indicateur, situées par rapport à la référence. */
export function plotMeasures(
  measures: GrowthMeasure[],
  birthDate: ISODate,
  indicator: Indicator,
): { points: PlottedMeasure[]; outOfRange: number } {
  const points: PlottedMeasure[] = []
  let outOfRange = 0

  for (const m of measures) {
    if (m.deletedAt) continue
    const value = valueOf(m, indicator)
    if (value === undefined || value <= 0) continue

    const ageDays = daysBetween(birthDate, m.date)
    if (ageDays < 0 || ageDays > MAX_AGE_DAYS) { outOfRange += 1; continue }

    points.push({
      id: m.id,
      date: m.date,
      ageDays,
      value,
      verified: m.verifiedByUser,
    })
  }

  points.sort((a, b) => a.ageDays - b.ageDays)
  return { points, outOfRange }
}

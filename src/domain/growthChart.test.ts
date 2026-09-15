import { describe, expect, it } from 'vitest'
import {
  MAX_AGE_DAYS,
  plotMeasures,
  positionLabel,
  referenceCurve,
  valueOf,
} from './growthChart'
import type { GrowthMeasure } from './types'

function measure(p: Partial<GrowthMeasure> & { date: string }): GrowthMeasure {
  return {
    id: p.id ?? `m-${p.date}`,
    childId: 'c1',
    date: p.date,
    weightKg: p.weightKg,
    heightCm: p.heightCm,
    headCircumferenceCm: p.headCircumferenceCm,
    source: 'manual',
    verifiedByUser: p.verifiedByUser ?? true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: p.deletedAt,
  }
}

describe('courbes de référence', () => {
  it('commence à la naissance et s’arrête à la borne des tables OMS', () => {
    const c = referenceCurve('weight', 'F', 0)
    expect(c[0].ageDays).toBe(0)
    expect(c[c.length - 1].ageDays).toBe(MAX_AGE_DAYS)
  })

  it('reproduit les valeurs publiées par l’OMS à 12 mois', () => {
    // Repères OMS, fille, poids pour l'âge à 365 jours.
    expect(referenceCurve('weight', 'F', 0, 365, 365)[1].value).toBeCloseTo(8.9, 1)
    expect(referenceCurve('weight', 'F', -2, 365, 365)[1].value).toBeCloseTo(7.0, 1)
    expect(referenceCurve('weight', 'F', 2, 365, 365)[1].value).toBeCloseTo(11.5, 1)
  })

  it('ordonne les couloirs : -2 ET sous la médiane, +2 ET au-dessus', () => {
    const low = referenceCurve('height', 'M', -2, 730, 730)[1].value
    const mid = referenceCurve('height', 'M', 0, 730, 730)[1].value
    const high = referenceCurve('height', 'M', 2, 730, 730)[1].value
    expect(low).toBeLessThan(mid)
    expect(mid).toBeLessThan(high)
  })

  it('reste croissante avec l’âge pour le poids', () => {
    const c = referenceCurve('weight', 'M', 0)
    for (let i = 1; i < c.length; i += 1) {
      expect(c[i].value).toBeGreaterThan(c[i - 1].value)
    }
  })

  it('ne dépasse jamais la borne, même si on demande plus', () => {
    const c = referenceCurve('weight', 'F', 0, 5000)
    expect(c[c.length - 1].ageDays).toBe(MAX_AGE_DAYS)
  })
})

describe('placement des mesures', () => {
  const birth = '2024-01-01'

  it('place la médiane à z = 0 et au 50ᵉ centile', () => {
    const median = referenceCurve('weight', 'F', 0, 365, 365)[1].value
    const { points } = plotMeasures(
      [measure({ date: '2024-12-31', weightKg: median })],
      birth,
      'weight',
      'F',
    )
    expect(points).toHaveLength(1)
    expect(points[0].ageDays).toBe(365)
    expect(points[0].zScore).toBeCloseTo(0, 3)
    expect(points[0].percentile).toBeCloseTo(50, 1)
  })

  it('retrouve un écart-type non nul par dichotomie', () => {
    const at1 = referenceCurve('weight', 'M', 1, 365, 365)[1].value
    const { points } = plotMeasures(
      [measure({ date: '2024-12-31', weightKg: at1 })],
      birth,
      'weight',
      'M',
    )
    expect(points[0].zScore).toBeCloseTo(1, 2)
    expect(points[0].percentile).toBeCloseTo(84.13, 0)
  })

  it('trie par âge, quel que soit l’ordre de saisie', () => {
    const { points } = plotMeasures(
      [
        measure({ date: '2024-07-01', weightKg: 7.5 }),
        measure({ date: '2024-02-01', weightKg: 4.2 }),
        measure({ date: '2024-04-01', weightKg: 6 }),
      ],
      birth,
      'weight',
      'F',
    )
    expect(points.map((p) => p.date)).toEqual(['2024-02-01', '2024-04-01', '2024-07-01'])
  })

  it('ignore les mesures supprimées et celles qui ne portent pas l’indicateur', () => {
    const { points, outOfRange } = plotMeasures(
      [
        measure({ date: '2024-03-01', weightKg: 5.5, deletedAt: '2024-05-01T00:00:00.000Z' }),
        measure({ date: '2024-03-02', heightCm: 60 }),
        measure({ date: '2024-03-03', weightKg: 5.9 }),
      ],
      birth,
      'weight',
      'F',
    )
    expect(points).toHaveLength(1)
    expect(points[0].date).toBe('2024-03-03')
    expect(outOfRange).toBe(0)
  })

  it('compte hors référence ce qui dépasse 5 ans, sans le tracer', () => {
    const { points, outOfRange } = plotMeasures(
      [
        measure({ date: '2025-01-01', weightKg: 9.5 }),
        measure({ date: '2029-06-01', weightKg: 20 }),
      ],
      birth,
      'weight',
      'F',
    )
    expect(points).toHaveLength(1)
    expect(outOfRange).toBe(1)
  })

  it('compte hors référence une date antérieure à la naissance', () => {
    const { points, outOfRange } = plotMeasures(
      [measure({ date: '2023-12-25', weightKg: 3.2 })],
      birth,
      'weight',
      'F',
    )
    expect(points).toHaveLength(0)
    expect(outOfRange).toBe(1)
  })

  it('conserve l’état vérifié de la mesure', () => {
    const { points } = plotMeasures(
      [measure({ date: '2024-03-01', weightKg: 5.9, verifiedByUser: false })],
      birth,
      'weight',
      'F',
    )
    expect(points[0].verified).toBe(false)
  })

  it('lit le bon champ selon l’indicateur', () => {
    const m = measure({ date: '2024-03-01', weightKg: 5.9, heightCm: 60, headCircumferenceCm: 40 })
    expect(valueOf(m, 'weight')).toBe(5.9)
    expect(valueOf(m, 'height')).toBe(60)
    expect(valueOf(m, 'head')).toBe(40)
  })
})

describe('formulation de la position', () => {
  it('reste descriptive, sans jugement', () => {
    expect(positionLabel(50)).toBe('50ᵉ centile')
    expect(positionLabel(0.4)).toBe('sous le 1ᵉʳ centile')
    expect(positionLabel(99.6)).toBe('au-dessus du 99ᵉ centile')
    expect(positionLabel(3.4)).toBe('3ᵉ centile')
  })
})

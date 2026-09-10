import { describe, expect, it } from 'vitest'
import { interpolateLMS, percentileFromZ, zScore } from './growth'

describe('z-score LMS', () => {
  it('renvoie 0 pour la médiane', () => {
    expect(zScore(7.0, { L: 0.3, M: 7.0, S: 0.12 })).toBeCloseTo(0, 10)
  })

  it('gère le cas L = 0 par le logarithme', () => {
    expect(zScore(Math.E * 5, { L: 0, M: 5, S: 1 })).toBeCloseTo(1, 10)
  })

  it('est croissant avec la mesure', () => {
    const lms = { L: 0.3, M: 7, S: 0.12 }
    expect(zScore(8, lms)).toBeGreaterThan(zScore(7, lms))
    expect(zScore(6, lms)).toBeLessThan(0)
  })

  it('rejette une mesure nulle ou négative', () => {
    expect(() => zScore(0, { L: 1, M: 7, S: 0.1 })).toThrow()
  })
})

describe('percentile', () => {
  it('place les repères normaux au bon endroit', () => {
    expect(percentileFromZ(0)).toBeCloseTo(50, 3)
    expect(percentileFromZ(1)).toBeCloseTo(84.13, 1)
    expect(percentileFromZ(-1)).toBeCloseTo(15.87, 1)
    expect(percentileFromZ(1.96)).toBeCloseTo(97.5, 1)
    expect(percentileFromZ(-2)).toBeCloseTo(2.28, 1)
  })
})

describe('interpolation', () => {
  it('interpole linéairement entre deux points de table', () => {
    expect(interpolateLMS({ L: 0, M: 4, S: 0.1 }, { L: 1, M: 6, S: 0.2 }, 0.5))
      .toEqual({ L: 0.5, M: 5, S: 0.15000000000000002 })
  })
})

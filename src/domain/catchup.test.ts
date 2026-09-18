import { describe, expect, it } from 'vitest'
import schedule from '../data/schedules/fr-2025.json'
import type { Schedule } from './types'
import { catchUpReference, catchUpReferences, describeRule, type CatchUpRule } from './catchup'

const fr = schedule as Schedule
const menB = fr.valences.find((v) => v.code === 'MenB')!

describe('schéma classique du nourrisson', () => {
  it('suit le calendrier officiel : 3 mois, 5 mois, rappel à 12 mois', () => {
    expect(menB.doses.map((d) => d.targetAgeMonths)).toEqual([3, 5, 12])
  })

  it('impose au moins deux mois entre la première et la deuxième dose', () => {
    expect(menB.doses[1].minIntervalDays).toBeGreaterThanOrEqual(56)
  })
})

describe('restitution du tableau de rattrapage', () => {
  it('publie les quatre tranches du méningocoque B, dans l’ordre des âges', () => {
    const ref = catchUpReference(menB)!
    expect(ref.rows).toHaveLength(4)
    const ranges = ref.rows.map((r) => r.ageRange).join(' | ')
    expect(ranges).toContain('6 à 11 mois')
    expect(ranges).toContain('12 à 23 mois')
    expect(ranges).toContain('2 à 4 ans')
    expect(ranges).toContain('15 à 24 ans')
  })

  it('distingue la tranche recommandée de la tranche obligatoire', () => {
    const ref = catchUpReference(menB)!
    expect(ref.rows.some((r) => r.recommendedOnly)).toBe(true)
    expect(ref.rows.some((r) => !r.recommendedOnly)).toBe(true)
  })

  it('renvoie null pour une valence sans tableau de rattrapage publié', () => {
    const dtp = fr.valences.find((v) => v.code === 'DTP')!
    expect(catchUpReference(dtp)).toBeNull()
  })

  it('catchUpReferences ne retient que les valences qui en publient un', () => {
    const all = catchUpReferences(fr)
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((r) => r.rows.length > 0)).toBe(true)
  })
})

describe('mise en mots d’une règle', () => {
  const base: CatchUpRule = {
    fromAgeMonths: 24, toAgeMonths: 59, primaryDoses: 2, minIntervalDays: 60,
    booster: false, label: '2 à 4 ans révolus',
  }

  it('écrit le nombre de doses et l’intervalle minimal', () => {
    const row = describeRule(base)
    expect(row.scheme).toBe("2 doses, espacées d'au moins 2 mois")
    expect(row.booster).toBeUndefined()
  })

  it('écrit le rappel quand la tranche en prévoit un', () => {
    const row = describeRule({
      ...base, booster: true, boosterLabel: 'Rappel', boosterMinAgeMonths: 12,
      boosterMaxAgeMonths: 24,
    })
    expect(row.booster).toContain('à partir de 12 mois')
    expect(row.booster).toContain('avant 24 mois')
  })

  it('accorde le singulier sur une dose unique', () => {
    expect(describeRule({ ...base, primaryDoses: 1 }).scheme).toBe('1 dose')
  })

  /**
   * Garde-fou réglementaire : la restitution du référentiel ne doit jamais
   * redevenir un plan daté pour un enfant. Aucune date ne doit apparaître.
   */
  it('ne produit aucune date', () => {
    const serialised = JSON.stringify(catchUpReferences(fr))
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('la fonction ne prend aucune donnée d’enfant en entrée', () => {
    // Signature volontairement réduite au référentiel : ni date de naissance,
    // ni doses reçues, ni date du jour.
    expect(catchUpReference.length).toBe(1)
    expect(catchUpReferences.length).toBe(1)
  })
})

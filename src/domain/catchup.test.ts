import { describe, expect, it } from 'vitest'
import schedule from '../data/schedules/fr-2025.json'
import type { Schedule, VaccinationEvent } from './types'
import { catchUpPlan, catchUpPlans, ruleFor } from './catchup'

const fr = schedule as Schedule
const menB = fr.valences.find((v) => v.code === 'MenB')!

function event(date: string, valences = ['MenB']): VaccinationEvent {
  return {
    id: date + valences.join(), childId: 'c1', valences, date, source: 'manual',
    verifiedByUser: true, attachmentIds: [], createdAt: '', updatedAt: '',
  }
}

describe('schéma classique du nourrisson', () => {
  it('suit le calendrier officiel : 3 mois, 5 mois, rappel à 12 mois', () => {
    expect(menB.doses.map((d) => d.targetAgeMonths)).toEqual([3, 5, 12])
    expect(menB.doses).toHaveLength(3)
  })

  it('impose au moins deux mois entre la première et la deuxième dose', () => {
    expect(menB.doses[1].minIntervalDays).toBeGreaterThanOrEqual(56)
  })
})

describe('sélection de la tranche de rattrapage', () => {
  it('choisit la règle correspondant à l’âge', () => {
    expect(ruleFor(menB, 8)!.label).toContain('6 à 11 mois')
    expect(ruleFor(menB, 18)!.label).toContain('12 à 23 mois')
    expect(ruleFor(menB, 30)!.label).toContain('2 à 4 ans')
    expect(ruleFor(menB, 200)!.label).toContain('15 à 24 ans')
  })

  it('ne propose rien avant 6 mois — le schéma classique s’applique encore', () => {
    expect(ruleFor(menB, 4)).toBeUndefined()
  })

  it('ne propose rien entre 5 et 15 ans : la fenêtre obligatoire est close', () => {
    expect(ruleFor(menB, 72)).toBeUndefined()
    expect(ruleFor(menB, 140)).toBeUndefined()
  })

  it('ne propose plus rien au-delà de 25 ans', () => {
    expect(ruleFor(menB, 320)).toBeUndefined()
  })
})

describe('nourrisson de 6 à 11 mois', () => {
  // Né le 01/01/2026, a 8 mois au 01/09/2026.
  const birth = '2026-01-01'
  const today = '2026-09-01'

  it('propose deux doses espacées d’au moins deux mois, puis un rappel', () => {
    const plan = catchUpPlan(menB, birth, today, [])!
    expect(plan.ruleLabel).toContain('6 à 11 mois')
    expect(plan.steps).toHaveLength(3)
    expect(plan.steps[0].earliest).toBe(today)
    expect(plan.steps[1].earliest).toBe('2026-10-27') // +56 jours
    expect(plan.steps[2].isBooster).toBe(true)
  })

  it('place le rappel au cours de la deuxième année de vie', () => {
    const plan = catchUpPlan(menB, birth, today, [])!
    const booster = plan.steps[2]
    expect(booster.earliest >= '2027-01-01').toBe(true) // 12 mois révolus
    expect(booster.latest).toBe('2028-01-01') // avant 24 mois
  })

  it('tient compte d’une dose déjà reçue', () => {
    const plan = catchUpPlan(menB, birth, today, [event('2026-08-15')])!
    expect(plan.alreadyGiven).toBe(1)
    expect(plan.steps).toHaveLength(2)
    // Au plus tôt 56 jours après la dose reçue, pas aujourd'hui.
    expect(plan.steps[0].earliest).toBe('2026-10-10')
  })
})

describe('enfant de 12 à 23 mois', () => {
  const birth = '2025-01-01'
  const today = '2026-04-01' // 15 mois

  it('espace le rappel d’au moins douze mois après la primovaccination', () => {
    const plan = catchUpPlan(menB, birth, today, [])!
    expect(plan.ruleLabel).toContain('12 à 23 mois')
    const [d1, d2, booster] = plan.steps
    expect(d2.earliest > d1.earliest).toBe(true)
    expect(booster.isBooster).toBe(true)
    expect(booster.earliest >= '2027-05-27').toBe(true)
  })
})

describe('enfant de 2 à 4 ans révolus', () => {
  const birth = '2023-06-01'
  const today = '2026-06-01' // 36 mois

  it('propose deux doses sans rappel', () => {
    const plan = catchUpPlan(menB, birth, today, [])!
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps.some((s) => s.isBooster)).toBe(false)
  })

  it('rappelle que le rattrapage doit être fait avant le cinquième anniversaire', () => {
    expect(catchUpPlan(menB, birth, today, [])!.note).toContain('5')
  })
})

describe('adolescent et jeune adulte', () => {
  const birth = '2008-01-01'
  const today = '2026-01-01' // 18 ans

  it('propose deux doses espacées d’au moins un mois, sans rappel', () => {
    const plan = catchUpPlan(menB, birth, today, [])!
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[1].earliest).toBe('2026-01-29') // +28 jours
  })

  it('est signalé comme recommandé, pas obligatoire', () => {
    expect(catchUpPlan(menB, birth, today, [])!.recommendedOnly).toBe(true)
  })
})

describe('schéma déjà complet', () => {
  it('ne propose plus rien quand toutes les doses sont faites', () => {
    const plan = catchUpPlan(menB, '2026-01-01', '2026-09-01', [
      event('2026-07-01'), event('2026-08-01'), event('2026-08-20'),
    ])
    expect(plan).toBeNull()
  })
})

describe('plans multiples', () => {
  it('ne renvoie de plan que pour les valences qui en définissent', () => {
    const plans = catchUpPlans(fr, '2026-01-01', '2026-09-01', [])
    expect(plans.map((p) => p.valenceCode)).toEqual(['MenB'])
  })

  it('aucune proposition n’est jamais antérieure à aujourd’hui', () => {
    const plans = catchUpPlans(fr, '2026-01-01', '2026-09-01', [])
    for (const p of plans) {
      for (const s of p.steps) expect(s.earliest >= '2026-09-01').toBe(true)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { planReminders } from './reminderPlan'
import type { DoseStatus } from '../domain/types'

function dose(p: Partial<DoseStatus> & { targetDate: string }): DoseStatus {
  return {
    valenceCode: p.valenceCode ?? 'DTP', valenceLabel: 'Diphtérie-tétanos-polio',
    shortLabel: p.shortLabel ?? 'Diphtérie-tétanos-polio', mandatory: true,
    doseNumber: p.doseNumber ?? 1, doseLabel: '2 mois',
    state: p.state ?? 'upcoming', earliestDate: p.targetDate, targetDate: p.targetDate,
    latestDate: p.targetDate, administeredOn: p.administeredOn, verified: p.verified,
  }
}

describe('plan des rappels', () => {
  it('programme une alerte à J-7 et une le jour même', () => {
    const plan = planReminders([dose({ targetDate: '2026-10-01' })], '2026-09-15')
    expect(plan).toHaveLength(2)
    expect(plan[0].at.getDate()).toBe(24) // J-7 : 24 septembre
    expect(plan[0].at.getHours()).toBe(9)
    expect(plan[1].at.getDate()).toBe(1)
  })

  it('ignore un rendez-vous déjà en retard : inonder n’aide pas', () => {
    const plan = planReminders([dose({ targetDate: '2026-08-01', state: 'late' })], '2026-09-15')
    expect(plan).toHaveLength(0)
  })

  it('ignore une dose déjà administrée', () => {
    const plan = planReminders(
      [dose({ targetDate: '2026-10-01', administeredOn: '2026-09-20' })], '2026-09-15',
    )
    expect(plan).toHaveLength(0)
  })

  it('ne programme pas une alerte J-7 déjà passée, mais garde celle du jour même', () => {
    const plan = planReminders([dose({ targetDate: '2026-09-18' })], '2026-09-15')
    expect(plan).toHaveLength(1)
    expect(plan[0].title).toBe("C'est aujourd'hui")
  })

  it('donne un identifiant stable, pour ne jamais dupliquer une notification déjà programmée', () => {
    const a = planReminders([dose({ targetDate: '2026-10-01' })], '2026-09-15')
    const b = planReminders([dose({ targetDate: '2026-10-01' })], '2026-09-16')
    expect(a[0].id).toBe(b[0].id)
    expect(a[1].id).toBe(b[1].id)
    expect(a[0].id).not.toBe(a[1].id)
  })

  it('trie par date de déclenchement', () => {
    const plan = planReminders(
      [
        dose({ valenceCode: 'ROR', targetDate: '2026-12-01' }),
        dose({ valenceCode: 'Hib', targetDate: '2026-09-20' }),
      ],
      '2026-09-15',
    )
    expect(plan.map((p) => p.valenceCode)).toEqual(['Hib', 'ROR', 'ROR'])
  })
})

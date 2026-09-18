import { describe, expect, it } from 'vitest'
import { planReminders } from './reminderPlan'
import type { ParentReminder } from '../domain/types'

const TODAY = '2026-09-10'

function reminder(p: Partial<ParentReminder> & { date: string }): ParentReminder {
  return {
    id: p.id ?? `r-${p.date}`,
    childId: 'c1',
    label: p.label ?? 'Rendez-vous chez le médecin',
    date: p.date,
    note: p.note,
    createdAt: '2026-09-01T00:00:00.000Z',
    deletedAt: p.deletedAt,
  }
}

describe('rappels créés par le parent', () => {
  it('programme un rappel à la date choisie, à 9 h locales', () => {
    const [r] = planReminders([reminder({ date: '2026-10-01' })], TODAY)
    expect(r.at.getFullYear()).toBe(2026)
    expect(r.at.getMonth()).toBe(9)
    expect(r.at.getDate()).toBe(1)
    expect(r.at.getHours()).toBe(9)
  })

  it('reprend le libellé écrit par le parent, sans le réécrire', () => {
    const [r] = planReminders([reminder({ date: '2026-10-01', label: 'Visite des 12 mois' })], TODAY)
    expect(r.title).toBe('Visite des 12 mois')
  })

  it('ignore une date passée', () => {
    expect(planReminders([reminder({ date: '2026-09-09' })], TODAY)).toHaveLength(0)
  })

  it('programme un rappel daté du jour même', () => {
    expect(planReminders([reminder({ date: TODAY })], TODAY)).toHaveLength(1)
  })

  it('ignore un rappel supprimé', () => {
    const r = reminder({ date: '2026-10-01', deletedAt: '2026-09-05T00:00:00.000Z' })
    expect(planReminders([r], TODAY)).toHaveLength(0)
  })

  it('trie par date de déclenchement', () => {
    const plan = planReminders([
      reminder({ id: 'b', date: '2026-12-01' }),
      reminder({ id: 'a', date: '2026-10-01' }),
    ], TODAY)
    expect(plan.map((p) => p.reminderId)).toEqual(['a', 'b'])
  })

  it('donne un identifiant stable : reprogrammer ne duplique pas', () => {
    const r = reminder({ id: 'stable', date: '2026-10-01' })
    expect(planReminders([r], TODAY)[0].id).toBe(planReminders([r], TODAY)[0].id)
  })

  /**
   * Garde-fou réglementaire : ce module ne doit jamais redevenir un
   * générateur de rappels vaccinaux. Il ne connaît ni le calendrier, ni les
   * doses, ni l'état du carnet.
   */
  it('n’accepte que des rappels du parent, jamais un état vaccinal', () => {
    const [r] = planReminders([reminder({ date: '2026-10-01' })], TODAY)
    const keys = Object.keys(r)
    expect(keys).not.toContain('valenceCode')
    expect(keys).not.toContain('doseNumber')
  })
})

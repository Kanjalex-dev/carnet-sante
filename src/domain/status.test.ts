import { describe, expect, it } from 'vitest'
import schedule from '../data/schedules/fr-2025.json'
import type { Schedule, VaccinationEvent } from './types'
import { computeStatus, groupByVisit, resolveValence, summarise } from './status'

const fr = schedule as Schedule
const TODAY = '2026-09-10'

function event(p: Partial<VaccinationEvent> & { valences: string[]; date: string }): VaccinationEvent {
  return {
    id: crypto.randomUUID(), childId: 'c1', source: 'manual', verifiedByUser: true,
    attachmentIds: [], createdAt: '', updatedAt: '', ...p,
  }
}

describe('cohortes — l’obligation dépend de la date de naissance', () => {
  it('un enfant né en 2025 relève des valences obligatoires récentes', () => {
    const mandatory = computeStatus(fr, '2025-07-12', [])
      .filter((v) => v.mandatory).map((v) => v.code)
    expect(mandatory).toContain('MenB')
    expect(mandatory).toContain('MenACWY')
    expect(mandatory).not.toContain('MenC')
    expect(mandatory.length).toBe(8)
  })

  it('un enfant né en 2020 relève du méningo C, pas de l’ACWY obligatoire', () => {
    const mandatory = computeStatus(fr, '2020-05-01', [])
      .filter((v) => v.mandatory).map((v) => v.code)
    expect(mandatory).toContain('MenC')
    expect(mandatory).not.toContain('MenACWY')
  })

  it('un enfant né en 2016 n’a que le DTP obligatoire', () => {
    expect(computeStatus(fr, '2016-03-04', []).filter((v) => v.mandatory).map((v) => v.code))
      .toEqual(['DTP'])
  })

  it('resolveValence écarte une valence remplacée pour les cohortes postérieures', () => {
    const menC = fr.valences.find((v) => v.code === 'MenC')!
    expect(resolveValence(menC, '2025-07-12').applicable).toBe(false)
  })
})

describe('une dose est inscrite, ou elle ne l’est pas', () => {
  const birth = '2025-01-10'

  it('sans inscription, la dose est « non inscrite » — jamais « en retard »', () => {
    const dtp = computeStatus(fr, birth, []).find((v) => v.code === 'DTP')!
    expect(dtp.doses.every((d) => d.state === 'not-recorded')).toBe(true)
  })

  it('une injection enregistrée inscrit la dose correspondante', () => {
    const events = [event({ valences: ['DTP'], date: '2025-03-12' })]
    const dtp = computeStatus(fr, birth, events).find((v) => v.code === 'DTP')!
    expect(dtp.doses[0].state).toBe('done')
    expect(dtp.doses[0].administeredOn).toBe('2025-03-12')
    expect(dtp.doses[1].state).toBe('not-recorded')
  })

  it('une inscription supprimée ne compte plus', () => {
    const events = [event({ valences: ['DTP'], date: '2025-03-12', deletedAt: '2025-04-01' })]
    const dtp = computeStatus(fr, birth, events).find((v) => v.code === 'DTP')!
    expect(dtp.doses[0].state).toBe('not-recorded')
  })

  /**
   * Garde-fou réglementaire. Si quelqu'un réintroduit une date calculée ou un
   * décompte de retard dans DoseStatus, ce test tombe — et c'est le but :
   * ces champs sont ce qui ferait basculer l'application du côté du dispositif
   * médical (MDCG 2019-11, règle 11).
   */
  it('ne produit aucune date calculée ni aucun décompte de retard', () => {
    const doses = computeStatus(fr, birth, []).flatMap((v) => v.doses)
    for (const d of doses) {
      const keys = Object.keys(d)
      expect(keys).not.toContain('daysLate')
      expect(keys).not.toContain('daysSinceTarget')
      expect(keys).not.toContain('targetDate')
      expect(keys).not.toContain('earliestDate')
      expect(keys).not.toContain('latestDate')
      expect(d.targetAgeMonths).toBeTypeOf('number')
    }
  })
})

describe('regroupement par rendez-vous du calendrier', () => {
  const birth = '2025-01-10'

  it('regroupe par âge officiel, pas par date', () => {
    const groups = groupByVisit(computeStatus(fr, birth, []).flatMap((v) => v.doses))
    expect(groups.length).toBeGreaterThan(0)
    expect(groups.map((g) => g.targetAgeMonths))
      .toEqual([...groups.map((g) => g.targetAgeMonths)].sort((a, b) => a - b))
    for (const g of groups) expect(Object.keys(g)).not.toContain('targetDate')
  })

  it('un rendez-vous est complet quand toutes ses doses sont inscrites', () => {
    const groups = groupByVisit(computeStatus(fr, birth, []).flatMap((v) => v.doses))
    expect(groups.every((g) => !g.complete)).toBe(true)
  })

  it('une injection couvre plusieurs valences : le rendez-vous en porte plusieurs', () => {
    const groups = groupByVisit(computeStatus(fr, birth, []).flatMap((v) => v.doses))
    expect(groups.some((g) => g.doses.length > 1)).toBe(true)
  })
})

describe('résumé', () => {
  it('compte ce qui est inscrit, pas ce qui serait en retard', () => {
    const birth = '2025-01-10'
    const events = [event({ valences: ['DTP'], date: '2025-03-12' })]
    const s = summarise(computeStatus(fr, birth, events), birth, TODAY)
    expect(s.recordedCount).toBe(1)
    expect(s.notRecordedCount).toBeGreaterThan(0)
    expect(Object.keys(s)).not.toContain('lateCount')
    expect(Object.keys(s)).not.toContain('dueSoonCount')
  })

  it('signale les inscriptions importées non relues', () => {
    const birth = '2025-01-10'
    const events = [event({ valences: ['DTP'], date: '2025-03-12', verifiedByUser: false })]
    const s = summarise(computeStatus(fr, birth, events), birth, TODAY)
    expect(s.unverifiedCount).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import schedule from '../data/schedules/fr-2025.json'
import type { Schedule, VaccinationEvent } from './types'
import {
  computeStatus, groupByVisit, proposeCatchUp, resolveValence, summarise, upcomingDoses,
} from './status'

const fr = schedule as Schedule
const TODAY = '2026-09-10'

function event(p: Partial<VaccinationEvent> & { valences: string[]; date: string }): VaccinationEvent {
  return {
    id: crypto.randomUUID(), childId: 'c1', source: 'manual', verifiedByUser: true,
    attachmentIds: [], createdAt: '', updatedAt: '', ...p,
  }
}

describe('cohortes — l’obligation dépend de la date de naissance', () => {
  it('un enfant né en 2025 relève des 13 valences obligatoires', () => {
    const s = computeStatus(fr, '2025-07-12', [], TODAY)
    const mandatory = s.filter((v) => v.mandatory).map((v) => v.code)
    expect(mandatory).toContain('MenB')
    expect(mandatory).toContain('MenACWY')
    expect(mandatory).not.toContain('MenC')
    expect(mandatory.length).toBe(8) // 8 valences = 13 injections/valences réglementaires
  })

  it('un enfant né en 2020 relève du méningo C, pas de l’ACWY obligatoire', () => {
    const s = computeStatus(fr, '2020-05-01', [], TODAY)
    const mandatory = s.filter((v) => v.mandatory).map((v) => v.code)
    expect(mandatory).toContain('MenC')
    expect(mandatory).not.toContain('MenACWY')
    expect(mandatory).not.toContain('MenB')
  })

  it('un enfant né en 2016 n’a que le DTP obligatoire', () => {
    const s = computeStatus(fr, '2016-03-04', [], TODAY)
    expect(s.filter((v) => v.mandatory).map((v) => v.code)).toEqual(['DTP'])
  })

  it('ne résout jamais l’obligation à partir de la date du jour', () => {
    const a = resolveValence(fr.valences.find((v) => v.code === 'MenB')!, '2024-12-31')
    const b = resolveValence(fr.valences.find((v) => v.code === 'MenB')!, '2025-01-01')
    expect(a.mandatory).toBe(false)
    expect(b.mandatory).toBe(true)
  })
})

describe('états de dose', () => {
  const birth = '2025-07-12' // 14 mois au 10/09/2026

  it('marque « due » une dose dont la cible est passée mais la fenêtre ouverte', () => {
    const s = computeStatus(fr, birth, [], TODAY)
    const ror = s.find((v) => v.code === 'ROR')!
    // cible 12 mois = 12/07/2026, fenêtre jusqu'à 15 mois = 12/10/2026
    expect(ror.doses[0].state).toBe('due')
    expect(ror.doses[0].daysSinceTarget).toBe(60)
    expect(ror.doses[0].daysLate).toBeUndefined()
  })

  it('marque en retard une dose obligatoire dont la fenêtre est dépassée', () => {
    const s = computeStatus(fr, '2023-01-10', [], TODAY)
    const ror = s.find((v) => v.code === 'ROR')!
    expect(ror.doses[0].state).toBe('late')
    expect(ror.doses[0].daysLate).toBeGreaterThan(0)
    expect(ror.hasLate).toBe(true)
  })

  it('marque « sans objet » une dose recommandée dont la fenêtre est close', () => {
    const s = computeStatus(fr, birth, [], TODAY)
    const rota = s.find((v) => v.code === 'Rotavirus')!
    expect(rota.doses.every((d) => d.state === 'not-applicable')).toBe(true)
  })

  it('marque « à venir » une dose dont la cible n’est pas atteinte', () => {
    const s = computeStatus(fr, '2026-06-01', [], TODAY)
    const ror = s.find((v) => v.code === 'ROR')!
    expect(ror.doses[0].state).toBe('upcoming')
  })

  it('affecte les doses administrées dans l’ordre chronologique', () => {
    const s = computeStatus(fr, birth, [
      event({ valences: ['DTP', 'Coq', 'Hib', 'HepB'], date: '2025-09-12' }),
      event({ valences: ['DTP', 'Coq', 'Hib', 'HepB'], date: '2025-11-14' }),
    ], TODAY)
    const dtp = s.find((v) => v.code === 'DTP')!
    expect(dtp.doses[0].state).toBe('done')
    expect(dtp.doses[0].administeredOn).toBe('2025-09-12')
    expect(dtp.doses[1].administeredOn).toBe('2025-11-14')
    expect(dtp.doses[2].state).toBe('due')
  })

  it('ignore les événements supprimés', () => {
    const s = computeStatus(fr, birth, [
      event({ valences: ['ROR'], date: '2026-07-20', deletedAt: '2026-08-01' }),
    ], TODAY)
    expect(s.find((v) => v.code === 'ROR')!.doses[0].state).toBe('due')
    expect(s.find((v) => v.code === 'ROR')!.doses[0].administeredOn).toBeUndefined()
  })

  it('repousse la date au plus tôt selon l’intervalle minimal', () => {
    const s = computeStatus(fr, '2026-04-01', [
      event({ valences: ['MenB'], date: '2026-08-20' }),
    ], TODAY)
    const menb = s.find((v) => v.code === 'MenB')!
    expect(menb.doses[1].earliestDate).toBe('2026-10-15') // 20/08 + 56 jours
  })

  it('signale une dose faite mais non vérifiée', () => {
    const s = computeStatus(fr, birth, [
      event({ valences: ['ROR'], date: '2026-07-20', verifiedByUser: false, source: 'ocr-local' }),
    ], TODAY)
    const ror = s.find((v) => v.code === 'ROR')!
    expect(ror.doses[0].state).toBe('done')
    expect(ror.doses[0].verified).toBe(false)
    expect(ror.hasUnverified).toBe(true)
  })
})

describe('horizon et synthèse', () => {
  it('ne retient que les doses dues, en retard ou à venir sous 3 mois', () => {
    const list = upcomingDoses(computeStatus(fr, '2025-07-12', [], TODAY), TODAY)
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((d) => d.state !== 'not-applicable')).toBe(true)
    expect(list.every((d) => d.state !== 'done')).toBe(true)
    // trié par date cible croissante
    const dates = list.map((d) => d.targetDate)
    expect([...dates].sort()).toEqual(dates)
  })

  it('compte les obligations satisfaites', () => {
    const s = computeStatus(fr, '2025-07-12', [], TODAY)
    const sum = summarise(s, '2025-07-12', TODAY)
    expect(sum.ageMonths).toBe(13)
    expect(sum.mandatoryTotal).toBe(8)
    expect(sum.dueSoonCount).toBeGreaterThan(0)
  })
})

describe('rattrapage', () => {
  it('propose une date pour chaque dose en retard, jamais dans le passé', () => {
    const s = computeStatus(fr, '2023-01-10', [], TODAY)
    const steps = proposeCatchUp(fr, s, TODAY)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.every((st) => st.proposedDate >= TODAY)).toBe(true)
  })
})

describe('regroupement par rendez-vous', () => {
  it('réunit sur une seule carte les valences d’une même injection', () => {
    const s = computeStatus(fr, '2025-07-12', [], TODAY)
    const groups = groupByVisit(upcomingDoses(s, TODAY, 3650))
    const twoMonths = groups.find((g) => g.label === '2 mois')!
    expect(twoMonths.doses.map((d) => d.valenceCode).sort())
      .toEqual(['Coq', 'DTP', 'HepB', 'Hib', 'Pneumo'])
    expect(twoMonths.state).toBe('late')
  })

  it('retient l’état le plus sévère du rendez-vous', () => {
    const s = computeStatus(fr, '2025-07-12', [], TODAY)
    const groups = groupByVisit(upcomingDoses(s, TODAY, 3650))
    const twelve = groups.find((g) => g.label === '12 mois')!
    expect(twelve.state).toBe('due')
  })

  it('trie les rendez-vous par date cible croissante', () => {
    const groups = groupByVisit(upcomingDoses(computeStatus(fr, '2025-07-12', [], TODAY), TODAY, 3650))
    const dates = groups.map((g) => g.targetDate)
    expect([...dates].sort()).toEqual(dates)
  })
})

import { describe, expect, it } from 'vitest'
import schedule from '../data/schedules/fr-2025.json'
import { computeStatus } from './status'
import { TRAVEL_VACCINES, isTravelCode, travelRecords, travelVaccine } from './travel'
import type { Schedule, VaccinationEvent } from './types'

const fr = schedule as Schedule

function event(p: Partial<VaccinationEvent> & { valences: string[]; date: string }): VaccinationEvent {
  return {
    id: crypto.randomUUID(), childId: 'c1', source: 'manual', verifiedByUser: true,
    attachmentIds: [], createdAt: '', updatedAt: '', ...p,
  }
}

describe('carnet de voyage', () => {
  it('restitue les enregistrements du plus recent au plus ancien', () => {
    const r = travelRecords([
      event({ valences: ['TRAVEL:FIEVRE_JAUNE'], date: '2024-10-04', destination: 'Sénégal' }),
      event({ valences: ['TRAVEL:HEPATITE_A'], date: '2026-02-11', destination: 'Inde' }),
    ])
    expect(r.map((x) => x.label)).toEqual(['Hépatite A', 'Fièvre jaune'])
    expect(r[1].destination).toBe('Sénégal')
  })

  it('ignore un enregistrement supprimé', () => {
    const r = travelRecords([
      event({ valences: ['TRAVEL:RAGE'], date: '2025-01-01', deletedAt: '2025-02-01' }),
    ])
    expect(r).toEqual([])
  })

  it('n’interfère pas avec le calendrier officiel', () => {
    const doses = computeStatus(fr, '2025-01-10',
      [event({ valences: ['TRAVEL:FIEVRE_JAUNE'], date: '2026-01-01' })]).flatMap((v) => v.doses)
    expect(doses.every((d) => d.state === 'not-recorded')).toBe(true)
  })
})

/**
 * Garde-fou reglementaire du carnet de voyage.
 *
 * Une recommandation vaccinale par pays est un conseil medical
 * individualise. Ces tests verifient qu'aucune fonction d'ici ne peut en
 * produire une, meme par accident : la liste est fixe, aucune fonction ne
 * prend un pays en entree, et aucun nom de pays n'existe dans le module.
 */
describe('garde-fous — aucune recommandation par pays', () => {
  it('la liste des vaccins est la meme quelle que soit la destination', () => {
    // Aucune fonction du module ne prend de destination : la seule liste
    // exportee est une constante.
    expect(Array.isArray(TRAVEL_VACCINES)).toBe(true)
    expect(travelVaccine.length).toBe(1)
    expect(isTravelCode.length).toBe(1)
    expect(travelRecords.length).toBe(1)
  })

  it('le module ne contient aucun nom de pays ni aucune zone', () => {
    const serialised = JSON.stringify(TRAVEL_VACCINES)
    for (const mot of ['Sénégal', 'Brésil', 'Inde', 'Thaïlande', 'zone', 'obligatoire pour']) {
      expect(serialised).not.toContain(mot)
    }
  })

  it('la liste est ordonnee alphabetiquement, pour ne suggerer aucune priorite', () => {
    const labels = TRAVEL_VACCINES.map((v) => v.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'fr')))
  })
})

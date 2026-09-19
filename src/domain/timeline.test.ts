import { describe, expect, it } from 'vitest'
import schedule from '../data/schedules/fr-2025.json'
import { buildTimeline, calendarReminders } from './timeline'
import type { Schedule, VaccinationEvent } from './types'

const fr = schedule as Schedule
const BIRTH = '2025-01-10'
const TODAY = '2026-09-19'

function event(p: { valences: string[]; date: string }): VaccinationEvent {
  return {
    id: crypto.randomUUID(), childId: 'c1', source: 'manual', verifiedByUser: true,
    attachmentIds: [], createdAt: '', updatedAt: '', ...p,
  }
}

describe('position du calendrier par rapport a une date de naissance', () => {
  it('place le rendez-vous 16-18 mois a 20 mois, et lui seul', () => {
    const t = buildTimeline(fr, BIRTH, [], TODAY)
    expect(t.ageMonths).toBe(20)
    expect(t.current?.label).toBe('16-18 mois')
    expect(t.current?.doses.map((d) => d.shortLabel)).toEqual(['Rougeole-oreillons-rubéole'])
  })

  it('la fenetre s’ouvre au plus petit age du referentiel, pas a l’age cible', () => {
    // ROR dose 2 : min 16, cible 17. Le rappel tombe a 16 mois.
    const t = buildTimeline(fr, BIRTH, [], TODAY)
    expect(t.current?.opensAtAgeMonths).toBe(16)
    expect(t.current?.opensOn).toBe('2026-05-10')
    // ... mais le rappel porte la date cible, pour que libelle et date concordent.
    expect(t.current?.plannedOn).toBe('2026-06-10')
  })

  it('le jour est celui de la naissance : precision au mois', () => {
    const t = buildTimeline(fr, '2025-03-28', [], '2026-09-19')
    for (const v of [...t.earlier, ...t.later]) expect(v.plannedOn.slice(8)).toBe('28')
  })

  it('un rendez-vous inscrit n’est plus signale comme courant', () => {
    const done = [event({ valences: ['ROR'], date: '2026-01-15' }),
                  event({ valences: ['ROR'], date: '2026-06-02' })]
    expect(buildTimeline(fr, BIRTH, done, TODAY).current).toBeNull()
  })

  it('sans rien de prevu a cet age, donne le repere suivant', () => {
    const t = buildTimeline(fr, BIRTH, [], '2029-09-19') // 4 ans et demi
    expect(t.current?.recorded ?? false).toBe(false)
    expect(t.nextLandmark?.label).toBe('6 ans')
  })

  it('les rendez-vous plus tot sont ordonnes et ne contiennent pas le courant', () => {
    const t = buildTimeline(fr, BIRTH, [], TODAY)
    const ages = t.earlier.map((v) => v.targetAgeMonths)
    expect(ages).toEqual([...ages].sort((a, b) => a - b))
    expect(ages.every((a) => a < 17)).toBe(true)
  })

  it('deux naissances du meme mois donnent la meme sortie', () => {
    const a = buildTimeline(fr, '2025-01-10', [], TODAY)
    const b = buildTimeline(fr, '2025-01-10', [], TODAY)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('rappels issus du calendrier', () => {
  it('produit un rappel par rendez-vous non inscrit, a l’ouverture de la fenetre', () => {
    const r = calendarReminders(buildTimeline(fr, BIRTH, [], TODAY), 'c1')
    const six = r.find((x) => x.label === 'Rendez-vous 6 ans')
    expect(six?.date).toBe('2031-01-10')
    expect(six?.past).toBe(false)
  })

  it('marque « passe » sans le supprimer : listable, jamais notifie', () => {
    const r = calendarReminders(buildTimeline(fr, BIRTH, [], TODAY), 'c1')
    expect(r.find((x) => x.label === 'Rendez-vous 16-18 mois')?.past).toBe(true)
  })

  it('identifiant deterministe : pas de doublon d’un calcul a l’autre', () => {
    const t = buildTimeline(fr, BIRTH, [], TODAY)
    expect(calendarReminders(t, 'c1').map((x) => x.id))
      .toEqual(calendarReminders(t, 'c1').map((x) => x.id))
  })
})

/**
 * Garde-fous reglementaires du module calcule.
 *
 * Ils ne disent pas que Carnet ne calcule rien — il calcule desormais. Ils
 * disent ce que le calcul n'a pas le droit de devenir : une mesure de retard
 * ou un jugement porte sur la personne. C'est cette frontiere-la, et non
 * l'absence de calcul, qui tient la position hors du dispositif medical.
 */
describe('garde-fous — ce que le calcul ne doit jamais produire', () => {
  const t = buildTimeline(fr, BIRTH, [], TODAY)
  const serialised = JSON.stringify({ t, r: calendarReminders(t, 'c1') })

  it('aucun decompte de retard, sous aucun nom', () => {
    for (const k of ['daysLate', 'daysSinceTarget', 'monthsLate', 'overdueBy', 'delay']) {
      expect(serialised).not.toContain(k)
    }
  })

  it('aucun qualificatif porte sur la personne', () => {
    for (const k of ['overdue', 'isLate', 'upToDate', 'compliant', 'atRisk', 'urgent', 'priority']) {
      expect(serialised).not.toContain(k)
    }
  })

  it('aucune donnee clinique en entree : le calcul ne voit qu’une date et des inscriptions', () => {
    // schedule, birthDate, events, today. Ni poids, ni antecedents, ni sexe.
    expect(buildTimeline.length).toBe(4)
  })

  it('une date d’inscription ne change pas ce que le calendrier prevoit', () => {
    const tard = [event({ valences: ['ROR'], date: '2026-09-01' })]
    const tot = [event({ valences: ['ROR'], date: '2026-01-05' })]
    const a = buildTimeline(fr, BIRTH, tard, TODAY)
    const b = buildTimeline(fr, BIRTH, tot, TODAY)
    expect(a.current?.plannedOn).toBe(b.current?.plannedOn)
    expect(a.earlier.length).toBe(b.earlier.length)
  })
})

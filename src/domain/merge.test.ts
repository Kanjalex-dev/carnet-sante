import { describe, expect, it } from 'vitest'
import {
  type MergeVault, applyMerge, buildPlan, defaultChoices, linkChildren, summarisePlan,
} from './merge'
import type { Child, GrowthMeasure, VaccinationEvent } from './types'

const T0 = '2025-01-01T10:00:00.000Z'
const T1 = '2025-06-01T10:00:00.000Z'
const NOW = '2026-09-15T12:00:00.000Z'

function child(p: Partial<Child> & { id: string }): Child {
  return {
    id: p.id, firstName: p.firstName ?? 'Léa', birthDate: p.birthDate ?? '2024-02-10',
    sex: p.sex ?? 'F', scheduleId: 'fr-2025', createdAt: T0, updatedAt: p.updatedAt ?? T0,
    deletedAt: p.deletedAt,
  }
}
function vacc(p: Partial<VaccinationEvent> & { id: string; childId: string }): VaccinationEvent {
  return {
    id: p.id, childId: p.childId, valences: p.valences ?? ['DTP'], date: p.date ?? '2024-04-10',
    productName: p.productName, lotNumber: p.lotNumber, source: p.source ?? 'manual',
    verifiedByUser: p.verifiedByUser ?? true, attachmentIds: p.attachmentIds ?? [],
    createdAt: T0, updatedAt: p.updatedAt ?? T0, deletedAt: p.deletedAt,
  }
}
function meas(p: Partial<GrowthMeasure> & { id: string; childId: string }): GrowthMeasure {
  return {
    id: p.id, childId: p.childId, date: p.date ?? '2024-06-10', weightKg: p.weightKg,
    heightCm: p.heightCm, headCircumferenceCm: p.headCircumferenceCm, source: 'manual',
    verifiedByUser: true, createdAt: T0, updatedAt: p.updatedAt ?? T0, deletedAt: p.deletedAt,
  }
}
const vault = (p: Partial<MergeVault>): MergeVault => ({
  children: p.children ?? [], vaccinations: p.vaccinations ?? [], growth: p.growth ?? [],
})

describe('rapprochement des enfants', () => {
  it('reconnaît le même enfant malgré deux identifiants différents', () => {
    const links = linkChildren([child({ id: 'L' })], [child({ id: 'R' })])
    expect(links[0]).toMatchObject({ remoteId: 'R', localId: 'L' })
  })

  it('ignore la casse et les accents du prénom', () => {
    const links = linkChildren(
      [child({ id: 'L', firstName: 'Léa' })],
      [child({ id: 'R', firstName: ' LEA ' })],
    )
    expect(links[0].localId).toBe('L')
  })

  it('ne rapproche pas deux enfants de dates de naissance différentes', () => {
    const links = linkChildren(
      [child({ id: 'L', birthDate: '2024-02-10' })],
      [child({ id: 'R', birthDate: '2022-02-10' })],
    )
    expect(links[0].localId).toBeUndefined()
  })

  it('n’attribue pas deux fois le même enfant local', () => {
    const links = linkChildren(
      [child({ id: 'L' })],
      [child({ id: 'R1' }), child({ id: 'R2' })],
    )
    expect(links[0].localId).toBe('L')
    expect(links[1].localId).toBeUndefined()
  })
})

describe('aperçu de fusion', () => {
  it('ne propose rien quand les deux carnets sont identiques', () => {
    const l = vault({ children: [child({ id: 'L' })], vaccinations: [vacc({ id: 'v1', childId: 'L' })] })
    const r = vault({ children: [child({ id: 'R' })], vaccinations: [vacc({ id: 'v1', childId: 'R' })] })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    expect(plan.items).toHaveLength(0)
    expect(plan.unchanged).toBe(2)
  })

  it('signale une vaccination que l’autre parent est seul à avoir', () => {
    const l = vault({ children: [child({ id: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v9', childId: 'R', date: '2024-09-10', valences: ['ROR'] })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ type: 'add', kind: 'vaccination' })
    expect(plan.items[0].remoteSummary).toContain('2024-09-10')
  })

  it('propose la version reçue quand elle est plus récente', () => {
    const l = vault({ children: [child({ id: 'L' })], vaccinations: [vacc({ id: 'v1', childId: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R', lotNumber: 'A21', updatedAt: T1 })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    expect(plan.items[0]).toMatchObject({ type: 'update', defaultChoice: 'remote' })
  })

  it('traite comme conflit une divergence où la version locale est la plus récente', () => {
    const l = vault({
      children: [child({ id: 'L' })],
      vaccinations: [vacc({ id: 'v1', childId: 'L', lotNumber: 'LOCAL', updatedAt: T1 })],
    })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R', lotNumber: 'RECU' })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    expect(plan.items[0]).toMatchObject({ type: 'conflict', defaultChoice: 'local' })
    expect(plan.items[0].localSummary).toContain('LOCAL')
    expect(plan.items[0].remoteSummary).toContain('RECU')
  })

  it('repère la même injection saisie deux fois sous deux identifiants', () => {
    const l = vault({
      children: [child({ id: 'L' })],
      vaccinations: [vacc({ id: 'a', childId: 'L', date: '2024-04-10', valences: ['DTP', 'Hib'] })],
    })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'b', childId: 'R', date: '2024-04-10', valences: ['Hib', 'DTP'] })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    expect(plan.items[0]).toMatchObject({ type: 'duplicate', defaultChoice: 'local' })
  })

  it('utilise les noms lisibles des vaccins dans l’aperçu', () => {
    const l = vault({ children: [child({ id: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R', valences: ['ROR'] })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children), new Map([['ROR', 'Rougeole-oreillons-rubéole']]))
    expect(plan.items[0].remoteSummary).toContain('Rougeole-oreillons-rubéole')
  })

  it('affiche les dates au format fourni par l’interface', () => {
    const l = vault({ children: [child({ id: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R', date: '2024-09-10' })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children), undefined,
      (iso) => `le ${iso.split('-').reverse().join('/')}`)
    expect(plan.items[0].remoteSummary).toContain('le 10/09/2024')
  })

  it('compte ce qui va changer avant d’écrire', () => {
    const l = vault({ children: [child({ id: 'L' })], vaccinations: [vacc({ id: 'v1', childId: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [
        vacc({ id: 'v1', childId: 'R', lotNumber: 'A21', updatedAt: T1 }),
        vacc({ id: 'v2', childId: 'R', date: '2024-09-10', valences: ['ROR'] }),
      ],
      growth: [meas({ id: 'g1', childId: 'R', weightKg: 7.2 })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    const s = summarisePlan(plan, defaultChoices(plan))
    expect(s).toEqual({ additions: 2, updates: 1, kept: 0, conflicts: 0 })
  })
})

describe('application de la fusion', () => {
  it('n’écrit rien quand tout est refusé', () => {
    const l = vault({ children: [child({ id: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R' })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    const out = applyMerge(l, r, plan, { 'vacc:v1': 'local' }, NOW)
    expect(out.vaccinations).toHaveLength(0)
  })

  it('rattache les enregistrements reçus à l’enfant local', () => {
    const l = vault({ children: [child({ id: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R' })],
      growth: [meas({ id: 'g1', childId: 'R', weightKg: 7.2 })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    const out = applyMerge(l, r, plan, defaultChoices(plan), NOW)
    expect(out.vaccinations[0].childId).toBe('L')
    expect(out.growth[0].childId).toBe('L')
    expect(out.children).toHaveLength(1)
  })

  it('remplace une ligne existante sans la dupliquer, et conserve sa date de création', () => {
    const l = vault({ children: [child({ id: 'L' })], vaccinations: [vacc({ id: 'v1', childId: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R', lotNumber: 'A21', updatedAt: T1 })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    const out = applyMerge(l, r, plan, defaultChoices(plan), NOW)
    expect(out.vaccinations).toHaveLength(1)
    expect(out.vaccinations[0].lotNumber).toBe('A21')
    expect(out.vaccinations[0].createdAt).toBe(T0)
    expect(out.vaccinations[0].updatedAt).toBe(NOW)
  })

  it('garde la version locale sur un conflit tranché en sa faveur', () => {
    const l = vault({
      children: [child({ id: 'L' })],
      vaccinations: [vacc({ id: 'v1', childId: 'L', lotNumber: 'LOCAL', updatedAt: T1 })],
    })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R', lotNumber: 'RECU' })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    const out = applyMerge(l, r, plan, defaultChoices(plan), NOW)
    expect(out.vaccinations[0].lotNumber).toBe('LOCAL')
  })

  it('ajoute un enfant inconnu plutôt que d’écraser celui qui existe', () => {
    const l = vault({ children: [child({ id: 'L', firstName: 'Léa' })] })
    const r = vault({ children: [child({ id: 'R', firstName: 'Tom', sex: 'M' })] })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    const out = applyMerge(l, r, plan, defaultChoices(plan), NOW)
    expect(out.children.map((c) => c.firstName).sort()).toEqual(['Léa', 'Tom'])
  })

  it('ne modifie pas le carnet d’origine', () => {
    const l = vault({ children: [child({ id: 'L' })], vaccinations: [vacc({ id: 'v1', childId: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v2', childId: 'R', date: '2024-09-10', valences: ['ROR'] })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    applyMerge(l, r, plan, defaultChoices(plan), NOW)
    expect(l.vaccinations).toHaveLength(1)
  })

  it('propage une suppression faite par l’autre parent si elle est acceptée', () => {
    const l = vault({ children: [child({ id: 'L' })], vaccinations: [vacc({ id: 'v1', childId: 'L' })] })
    const r = vault({
      children: [child({ id: 'R' })],
      vaccinations: [vacc({ id: 'v1', childId: 'R', deletedAt: T1, updatedAt: T1 })],
    })
    const plan = buildPlan(l, r, linkChildren(l.children, r.children))
    expect(plan.items[0].remoteSummary).toContain('supprimée')
    const out = applyMerge(l, r, plan, defaultChoices(plan), NOW)
    expect(out.vaccinations[0].deletedAt).toBe(T1)
  })
})

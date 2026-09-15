import type { Child, GrowthMeasure, VaccinationEvent } from './types'

/**
 * Fusion de deux carnets — le cas du co-parent.
 *
 * Deux parents saisissent le même enfant chacun de leur côté. Rien ne permet
 * de deviner laquelle des deux versions est la bonne : l'application construit
 * donc un aperçu, ligne par ligne, et n'écrit rien tant que la personne n'a
 * pas tranché. Aucune synchronisation silencieuse, aucune règle « le plus
 * récent gagne » appliquée dans le dos.
 *
 * Ce module est volontairement pur : il ne connaît ni le stockage, ni le
 * chiffrement, ni l'interface.
 */

export interface MergeVault {
  children: Child[]
  vaccinations: VaccinationEvent[]
  growth: GrowthMeasure[]
}

/** Correspondance entre un enfant du fichier reçu et un enfant local. */
export interface ChildLink {
  remoteId: string
  /** Enfant local correspondant, sinon l'enfant sera ajouté. */
  localId?: string
  label: string
}

export type ItemKind = 'child' | 'vaccination' | 'growth'
export type Choice = 'local' | 'remote'

export interface MergeItem {
  key: string
  kind: ItemKind
  /** Identifiant cible dans le carnet local. */
  targetId: string
  title: string
  /** Ce que contient la version locale, en clair. */
  localSummary?: string
  /** Ce que contient la version reçue, en clair. */
  remoteSummary: string
  type: 'add' | 'update' | 'conflict' | 'duplicate'
  defaultChoice: Choice
}

export interface MergePlan {
  links: ChildLink[]
  items: MergeItem[]
  /** Enregistrements identiques des deux côtés : rien à décider. */
  unchanged: number
}

/* ----------------------------------------------------------- rapprochement */

const norm = (s: string): string =>
  s.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/\p{Diacritic}/gu, '')

/**
 * Deux carnets créés séparément donnent deux identifiants pour le même enfant.
 * On les rapproche sur le prénom, la date de naissance et le sexe — trois
 * éléments qu'un parent ne saisit pas différemment par accident.
 */
export function linkChildren(local: Child[], remote: Child[]): ChildLink[] {
  const taken = new Set<string>()
  return remote.map((r) => {
    const match = local.find(
      (l) =>
        !taken.has(l.id) &&
        norm(l.firstName) === norm(r.firstName) &&
        l.birthDate === r.birthDate &&
        l.sex === r.sex,
    )
    if (match) taken.add(match.id)
    return {
      remoteId: r.id,
      localId: match?.id,
      label: `${r.firstName} (né${r.sex === 'F' ? 'e' : ''} le ${r.birthDate})`,
    }
  })
}

/* --------------------------------------------------------------- comparaison */

type Record_ = Child | VaccinationEvent | GrowthMeasure

/** Compare le contenu utile : l'horodatage de modification n'en fait pas partie. */
function sameContent(a: Record_, b: Record_): boolean {
  const strip = (r: Record_) => {
    const { updatedAt: _u, createdAt: _c, ...rest } = r as Record_ & Record<string, unknown>
    return JSON.stringify(sortKeys(rest))
  }
  return strip(a) === strip(b)
}

function sortKeys(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort()) {
    const v = o[k]
    out[k] = Array.isArray(v) ? [...v].sort() : v
  }
  return out
}

/**
 * Le formatage des dates est injecté : le domaine reste pur et testable, et
 * l'interface affiche des dates françaises plutôt que des dates ISO.
 */
export type DateFormatter = (iso: string) => string
const asIs: DateFormatter = (iso) => iso

export function describeVaccination(
  e: VaccinationEvent, labels?: Map<string, string>, fr: DateFormatter = asIs,
): string {
  const names = e.valences.map((c) => labels?.get(c) ?? c).join(', ')
  const bits = [fr(e.date), names]
  if (e.productName) bits.push(e.productName)
  // Le numéro de lot fait partie de la description : deux versions qui ne
  // diffèrent que par lui doivent s'afficher différemment, sans quoi la
  // personne arbitre à l'aveugle.
  if (e.lotNumber) bits.push(`lot ${e.lotNumber}`)
  if (!e.verifiedByUser) bits.push('non vérifiée')
  if (e.deletedAt) bits.push('supprimée')
  return bits.join(' · ')
}

export function describeGrowth(m: GrowthMeasure, fr: DateFormatter = asIs): string {
  const bits: string[] = [fr(m.date)]
  if (m.weightKg !== undefined) bits.push(`${m.weightKg} kg`)
  if (m.heightCm !== undefined) bits.push(`${m.heightCm} cm`)
  if (m.headCircumferenceCm !== undefined) bits.push(`PC ${m.headCircumferenceCm} cm`)
  if (m.deletedAt) bits.push('supprimée')
  return bits.join(' · ')
}

function describeChild(c: Child, fr: DateFormatter = asIs): string {
  return `${c.firstName} · né${c.sex === 'F' ? 'e' : ''} le ${fr(c.birthDate)}`
}

/** Le plus récent sert de proposition par défaut — jamais de décision automatique. */
function newer(local: Record_, remote: Record_): Choice {
  return remote.updatedAt > local.updatedAt ? 'remote' : 'local'
}

function sameShot(a: VaccinationEvent, b: VaccinationEvent): boolean {
  if (a.date !== b.date) return false
  const sa = [...a.valences].sort().join('|')
  const sb = [...b.valences].sort().join('|')
  return sa === sb
}

function sameMeasure(a: GrowthMeasure, b: GrowthMeasure): boolean {
  return (
    a.date === b.date &&
    a.weightKg === b.weightKg &&
    a.heightCm === b.heightCm &&
    a.headCircumferenceCm === b.headCircumferenceCm
  )
}

/* ------------------------------------------------------------------- plan */

export function buildPlan(
  local: MergeVault,
  remote: MergeVault,
  links: ChildLink[],
  labels?: Map<string, string>,
  fr: DateFormatter = asIs,
): MergePlan {
  const items: MergeItem[] = []
  let unchanged = 0
  const map = new Map(links.map((l) => [l.remoteId, l.localId]))
  const remap = <T extends { childId: string }>(r: T): T => ({ ...r, childId: map.get(r.childId) ?? r.childId })

  for (const r of remote.children) {
    const localId = map.get(r.id)
    if (!localId) {
      items.push({
        key: `child:${r.id}`, kind: 'child', targetId: r.id, type: 'add',
        title: 'Enfant absent de ce carnet', remoteSummary: describeChild(r, fr), defaultChoice: 'remote',
      })
      continue
    }
    const l = local.children.find((c) => c.id === localId)!
    const comparable = { ...r, id: l.id }
    if (sameContent(l, comparable)) { unchanged += 1; continue }
    items.push({
      key: `child:${r.id}`, kind: 'child', targetId: l.id,
      type: newer(l, r) === 'remote' ? 'update' : 'conflict',
      title: 'Fiche de l’enfant',
      localSummary: describeChild(l, fr), remoteSummary: describeChild(r, fr),
      defaultChoice: newer(l, r),
    })
  }

  const usedLocalVacc = new Set<string>()
  for (const raw of remote.vaccinations) {
    const r = remap(raw)
    const l = local.vaccinations.find((x) => x.id === r.id)
    if (l) {
      if (sameContent(l, r)) { unchanged += 1; usedLocalVacc.add(l.id); continue }
      usedLocalVacc.add(l.id)
      items.push({
        key: `vacc:${r.id}`, kind: 'vaccination', targetId: r.id,
        type: newer(l, r) === 'remote' ? 'update' : 'conflict',
        title: 'Vaccination modifiée des deux côtés',
        localSummary: describeVaccination(l, labels, fr),
        remoteSummary: describeVaccination(r, labels, fr),
        defaultChoice: newer(l, r),
      })
      continue
    }
    // Même injection saisie deux fois, sous deux identifiants : le cas le plus
    // fréquent entre deux parents. On le signale plutôt que de l'empiler.
    const twin = local.vaccinations.find(
      (x) => !x.deletedAt && !usedLocalVacc.has(x.id) && sameShot(x, r),
    )
    if (twin && !r.deletedAt) {
      usedLocalVacc.add(twin.id)
      items.push({
        key: `vacc:${r.id}`, kind: 'vaccination', targetId: r.id, type: 'duplicate',
        title: 'Déjà enregistrée sous une autre saisie',
        localSummary: describeVaccination(twin, labels, fr),
        remoteSummary: describeVaccination(r, labels, fr),
        defaultChoice: 'local',
      })
      continue
    }
    items.push({
      key: `vacc:${r.id}`, kind: 'vaccination', targetId: r.id, type: 'add',
      title: 'Vaccination absente de ce carnet',
      remoteSummary: describeVaccination(r, labels, fr), defaultChoice: 'remote',
    })
  }

  const usedLocalGrowth = new Set<string>()
  for (const raw of remote.growth) {
    const r = remap(raw)
    const l = local.growth.find((x) => x.id === r.id)
    if (l) {
      if (sameContent(l, r)) { unchanged += 1; usedLocalGrowth.add(l.id); continue }
      usedLocalGrowth.add(l.id)
      items.push({
        key: `growth:${r.id}`, kind: 'growth', targetId: r.id,
        type: newer(l, r) === 'remote' ? 'update' : 'conflict',
        title: 'Mesure modifiée des deux côtés',
        localSummary: describeGrowth(l, fr), remoteSummary: describeGrowth(r, fr),
        defaultChoice: newer(l, r),
      })
      continue
    }
    const twin = local.growth.find(
      (x) => !x.deletedAt && !usedLocalGrowth.has(x.id) && sameMeasure(x, r),
    )
    if (twin && !r.deletedAt) {
      usedLocalGrowth.add(twin.id)
      items.push({
        key: `growth:${r.id}`, kind: 'growth', targetId: r.id, type: 'duplicate',
        title: 'Mesure déjà enregistrée',
        localSummary: describeGrowth(twin, fr), remoteSummary: describeGrowth(r, fr),
        defaultChoice: 'local',
      })
      continue
    }
    items.push({
      key: `growth:${r.id}`, kind: 'growth', targetId: r.id, type: 'add',
      title: 'Mesure absente de ce carnet',
      remoteSummary: describeGrowth(r, fr), defaultChoice: 'remote',
    })
  }

  return { links, items, unchanged }
}

export function defaultChoices(plan: MergePlan): Record<string, Choice> {
  const out: Record<string, Choice> = {}
  for (const i of plan.items) out[i.key] = i.defaultChoice
  return out
}

/** Compte ce que la fusion va réellement changer, pour l'annoncer avant d'agir. */
export function summarisePlan(plan: MergePlan, choices: Record<string, Choice>): {
  additions: number; updates: number; kept: number; conflicts: number
} {
  let additions = 0, updates = 0, kept = 0
  for (const i of plan.items) {
    const c = choices[i.key] ?? i.defaultChoice
    if (c === 'local') { kept += 1; continue }
    if (i.type === 'add') additions += 1
    else updates += 1
  }
  return { additions, updates, kept, conflicts: plan.items.filter((i) => i.type === 'conflict').length }
}

/* ---------------------------------------------------------------- écriture */

/**
 * Applique le plan. Fonction pure : elle renvoie un nouveau coffre, ce qui
 * rend la fusion testable et permet de l'annuler avant enregistrement.
 */
export function applyMerge(
  local: MergeVault,
  remote: MergeVault,
  plan: MergePlan,
  choices: Record<string, Choice>,
  now: string,
): MergeVault {
  const out: MergeVault = {
    children: local.children.map((c) => ({ ...c })),
    vaccinations: local.vaccinations.map((e) => ({ ...e })),
    growth: local.growth.map((m) => ({ ...m })),
  }
  const map = new Map(plan.links.map((l) => [l.remoteId, l.localId]))
  const remap = <T extends { childId: string }>(r: T): T => ({ ...r, childId: map.get(r.childId) ?? r.childId })
  const take = (key: string): boolean => {
    const item = plan.items.find((i) => i.key === key)
    if (!item) return false
    return (choices[key] ?? item.defaultChoice) === 'remote'
  }

  for (const r of remote.children) {
    if (!take(`child:${r.id}`)) continue
    const localId = map.get(r.id)
    if (!localId) { out.children.push({ ...r, updatedAt: now }); continue }
    const i = out.children.findIndex((c) => c.id === localId)
    out.children[i] = { ...r, id: localId, createdAt: out.children[i].createdAt, updatedAt: now }
  }

  for (const raw of remote.vaccinations) {
    if (!take(`vacc:${raw.id}`)) continue
    const r = remap(raw)
    const i = out.vaccinations.findIndex((e) => e.id === r.id)
    if (i >= 0) out.vaccinations[i] = { ...r, createdAt: out.vaccinations[i].createdAt, updatedAt: now }
    else out.vaccinations.push({ ...r, updatedAt: now })
  }

  for (const raw of remote.growth) {
    if (!take(`growth:${raw.id}`)) continue
    const r = remap(raw)
    const i = out.growth.findIndex((m) => m.id === r.id)
    if (i >= 0) out.growth[i] = { ...r, createdAt: out.growth[i].createdAt, updatedAt: now }
    else out.growth.push({ ...r, updatedAt: now })
  }

  return out
}

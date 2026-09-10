import Dexie, { type Table } from 'dexie'
import type { Child, GrowthMeasure, VaccinationEvent } from '../domain/types'

/**
 * Persistance locale. Rien ne sort de l'appareil.
 * Le chiffrement au repos est ajouté en phase 3 : la clé dérivée d'une phrase
 * secrète chiffrera la valeur de chaque enregistrement avant écriture.
 */
class CarnetDB extends Dexie {
  children!: Table<Child, string>
  vaccinations!: Table<VaccinationEvent, string>
  growth!: Table<GrowthMeasure, string>

  constructor() {
    super('carnet')
    this.version(1).stores({
      children: 'id, birthDate',
      vaccinations: 'id, childId, date',
      growth: 'id, childId, date',
    })
  }
}

export const db = new CarnetDB()

export const stamp = (): string => new Date().toISOString()
export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export async function listChildren(): Promise<Child[]> {
  return (await db.children.toArray()).filter((c) => !c.deletedAt)
}

export async function addChild(input: Omit<Child, 'id' | 'createdAt' | 'updatedAt'>): Promise<Child> {
  const child: Child = { ...input, id: newId(), createdAt: stamp(), updatedAt: stamp() }
  await db.children.add(child)
  return child
}

export async function listVaccinations(childId: string): Promise<VaccinationEvent[]> {
  return db.vaccinations.where('childId').equals(childId).toArray()
}

export async function addVaccination(
  input: Omit<VaccinationEvent, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<VaccinationEvent> {
  const e: VaccinationEvent = { ...input, id: newId(), createdAt: stamp(), updatedAt: stamp() }
  await db.vaccinations.add(e)
  return e
}

/** Suppression logique : on n'efface jamais, on marque. */
export async function softDeleteVaccination(id: string): Promise<void> {
  await db.vaccinations.update(id, { deletedAt: stamp(), updatedAt: stamp() })
}

export async function verifyVaccination(id: string): Promise<void> {
  await db.vaccinations.update(id, { verifiedByUser: true, updatedAt: stamp() })
}

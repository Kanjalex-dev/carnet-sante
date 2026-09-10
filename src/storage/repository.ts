import Dexie, { type Table } from 'dexie'
import type { Child, GrowthMeasure, VaccinationEvent } from '../domain/types'
import {
  type KdfParams, type Sealed, checkCanary, deriveKey, makeCanary, newKdfParams,
  open as openSealed, openJSON, seal, sealJSON,
} from './crypto'

/** Contenu du coffre : tout sauf les photographies. */
export interface Vault {
  version: 1
  children: Child[]
  vaccinations: VaccinationEvent[]
  growth: GrowthMeasure[]
}

export interface AttachmentMeta {
  id: string
  childId: string
  mimeType: string
  width: number
  height: number
  bytes: number
  capturedAt: string
  label?: string
}

interface VaultRow { id: 'vault'; sealed: Sealed | null; plain: Vault | null }
interface SettingsRow {
  id: 'settings'
  encrypted: boolean
  kdf: KdfParams | null
  canary: Sealed | null
}
interface BlobRow { id: string; sealed: Sealed | null; plain: Uint8Array | null }

class CarnetDB extends Dexie {
  vault!: Table<VaultRow, string>
  settings!: Table<SettingsRow, string>
  attachments!: Table<AttachmentMeta, string>
  blobs!: Table<BlobRow, string>

  constructor() {
    super('carnet')
    this.version(1).stores({
      children: 'id, birthDate',
      vaccinations: 'id, childId, date',
      growth: 'id, childId, date',
    })
    // v2 : passage au modèle coffre. Rien en clair dans un index.
    this.version(2).stores({
      children: null,
      vaccinations: null,
      growth: null,
      vault: 'id',
      settings: 'id',
      attachments: 'id, childId',
      blobs: 'id',
    })
  }
}

const db = new CarnetDB()

const EMPTY: Vault = { version: 1, children: [], vaccinations: [], growth: [] }

export const stamp = (): string => new Date().toISOString()
export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

/* ---------------------------------------------------------------- état */

let key: CryptoKey | null = null
let cache: Vault | null = null

export type LockState = 'plain' | 'locked' | 'unlocked'

export async function lockState(): Promise<LockState> {
  const s = await db.settings.get('settings')
  if (!s?.encrypted) return 'plain'
  return key ? 'unlocked' : 'locked'
}

export function lock(): void {
  key = null
  cache = null
}

export async function unlock(passphrase: string): Promise<boolean> {
  const s = await db.settings.get('settings')
  if (!s?.encrypted || !s.kdf || !s.canary) return false
  const candidate = await deriveKey(passphrase, s.kdf)
  if (!(await checkCanary(candidate, s.canary))) return false
  key = candidate
  cache = null
  return true
}

/* ------------------------------------------------------------- lecture */

export async function readVault(): Promise<Vault> {
  if (cache) return cache
  const row = await db.vault.get('vault')
  if (!row) { cache = { ...EMPTY }; return cache }
  if (row.plain) { cache = row.plain; return cache }
  if (row.sealed) {
    if (!key) throw new Error('Coffre verrouillé')
    cache = await openJSON<Vault>(key, row.sealed)
    return cache
  }
  cache = { ...EMPTY }
  return cache
}

async function writeVault(v: Vault): Promise<void> {
  cache = v
  if (key) await db.vault.put({ id: 'vault', sealed: await sealJSON(key, v), plain: null })
  else await db.vault.put({ id: 'vault', sealed: null, plain: v })
}

export async function mutate(fn: (v: Vault) => void): Promise<Vault> {
  const v = structuredClone(await readVault())
  fn(v)
  await writeVault(v)
  return v
}

/* ----------------------------------------------- activation du chiffrement */

/**
 * Chiffre le coffre existant et toutes les photographies déjà stockées.
 * Opération unique et irréversible sans la phrase secrète.
 */
export async function enableEncryption(passphrase: string): Promise<void> {
  const current = await readVault()
  const kdf = newKdfParams()
  const derived = await deriveKey(passphrase, kdf)

  const rows = await db.blobs.toArray()
  await db.transaction('rw', db.vault, db.settings, db.blobs, async () => {
    await db.vault.put({ id: 'vault', sealed: await sealJSON(derived, current), plain: null })
    for (const r of rows) {
      if (r.plain) await db.blobs.put({ id: r.id, sealed: await seal(derived, r.plain), plain: null })
    }
    await db.settings.put({
      id: 'settings', encrypted: true, kdf, canary: await makeCanary(derived),
    })
  })
  key = derived
  cache = current
}

/* --------------------------------------------------------- pièces jointes */

export async function putAttachment(meta: AttachmentMeta, bytes: Uint8Array): Promise<void> {
  await db.attachments.put(meta)
  if (key) await db.blobs.put({ id: meta.id, sealed: await seal(key, bytes), plain: null })
  else await db.blobs.put({ id: meta.id, sealed: null, plain: bytes })
}

export async function listAttachments(childId: string): Promise<AttachmentMeta[]> {
  const all = await db.attachments.where('childId').equals(childId).toArray()
  return all.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))
}

export async function readAttachment(id: string): Promise<Uint8Array | null> {
  const row = await db.blobs.get(id)
  if (!row) return null
  if (row.plain) return row.plain
  if (row.sealed) {
    if (!key) throw new Error('Coffre verrouillé')
    return openSealed(key, row.sealed)
  }
  return null
}

export async function deleteAttachment(id: string): Promise<void> {
  await db.transaction('rw', db.attachments, db.blobs, async () => {
    await db.attachments.delete(id)
    await db.blobs.delete(id)
  })
  await mutate((v) => {
    for (const e of v.vaccinations) {
      e.attachmentIds = e.attachmentIds.filter((a) => a !== id)
    }
  })
}

/**
 * Efface tout, définitivement. Seule issue quand la phrase secrète est perdue :
 * sans elle les données sont irrécupérables, et une application qu'on ne peut
 * plus ni ouvrir ni réinitialiser est une impasse.
 */
export async function updateVaccination(
  id: string,
  patch: Partial<VaccinationEvent>,
): Promise<void> {
  await mutate((v) => {
    const e = v.vaccinations.find((x) => x.id === id)
    if (e) Object.assign(e, patch, { updatedAt: stamp() })
  })
}

/** Suppression logique : on n'efface jamais un événement, on le marque. */
export async function softDeleteVaccination(id: string): Promise<void> {
  await updateVaccination(id, { deletedAt: stamp() })
}

export async function attachToVaccination(eventId: string, attachmentId: string): Promise<void> {
  await mutate((v) => {
    const e = v.vaccinations.find((x) => x.id === eventId)
    if (e && !e.attachmentIds.includes(attachmentId)) {
      e.attachmentIds.push(attachmentId)
      e.updatedAt = stamp()
    }
  })
}

export async function wipeAll(): Promise<void> {
  key = null
  cache = null
  await db.transaction('rw', db.vault, db.settings, db.attachments, db.blobs, async () => {
    await db.vault.clear()
    await db.settings.clear()
    await db.attachments.clear()
    await db.blobs.clear()
  })
}

export async function attachmentUsage(): Promise<{ count: number; bytes: number }> {
  const all = await db.attachments.toArray()
  return { count: all.length, bytes: all.reduce((s, a) => s + a.bytes, 0) }
}

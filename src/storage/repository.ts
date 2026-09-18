import Dexie, { type Table } from 'dexie'
import type { Child, EmergencyCard, GrowthMeasure, VaccinationEvent } from '../domain/types'
import {
  type BackedAttachment, type BackupPayload, fromBase64, toBase64,
} from './backup'
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
  /** Optionnel : les coffres créés avant cette fonctionnalité n'en ont pas. */
  emergency?: EmergencyCard[]
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
  /** Achat unique, à vie : jamais réinitialisé par un verrouillage ou une purge d'attachements. */
  pro?: boolean
  proPurchasedAt?: string
  /** Empêche de solliciter l'avis App Store plus d'une fois — StoreKit limite déjà, on ajoute notre propre garde-fou. */
  reviewPromptShown?: boolean
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
/* -------------------------------------------------------------------- pro */

/**
 * Débloqué une fois, débloqué à vie : aucune vérification récurrente auprès
 * d'un serveur — il n'y en a pas. La preuve d'achat vit chez Apple ; ce
 * drapeau local ne fait que refléter la dernière transaction connue.
 */
export async function isPro(): Promise<boolean> {
  const s = await db.settings.get('settings')
  return s?.pro === true
}

export async function setPro(purchased: boolean): Promise<void> {
  const s = await db.settings.get('settings')
  await db.settings.put({
    id: 'settings',
    encrypted: s?.encrypted ?? false,
    kdf: s?.kdf ?? null,
    canary: s?.canary ?? null,
    pro: purchased,
    proPurchasedAt: purchased ? new Date().toISOString() : undefined,
  })
}

/* ----------------------------------------------------------------- avis */

/** Vrai si on a déjà demandé un avis App Store — on ne redemande jamais nous-mêmes. */
export async function hasShownReviewPrompt(): Promise<boolean> {
  const s = await db.settings.get('settings')
  return s?.reviewPromptShown === true
}

export async function markReviewPromptShown(): Promise<void> {
  const s = await db.settings.get('settings')
  await db.settings.put({
    id: 'settings',
    encrypted: s?.encrypted ?? false,
    kdf: s?.kdf ?? null,
    canary: s?.canary ?? null,
    pro: s?.pro,
    proPurchasedAt: s?.proPurchasedAt,
    reviewPromptShown: true,
  })
}

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

export async function detachFromVaccination(eventId: string, attachmentId: string): Promise<void> {
  await mutate((v) => {
    const e = v.vaccinations.find((x) => x.id === eventId)
    if (!e) return
    e.attachmentIds = e.attachmentIds.filter((a) => a !== attachmentId)
    e.updatedAt = stamp()
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

/* ----------------------------------------------------------- sauvegarde */

/**
 * Rassemble tout ce qu'il faut pour reconstruire ce carnet ailleurs : le
 * coffre et les pièces jointes, octets compris. Les photos sont relues une à
 * une plutôt qu'en bloc — une sauvegarde peut peser plusieurs dizaines de
 * mégaoctets et il n'y a aucune raison de tout tenir en mémoire deux fois.
 */
export async function collectBackup(): Promise<BackupPayload> {
  const vault = await readVault()
  const metas = await db.attachments.toArray()
  const attachments: BackedAttachment[] = []
  for (const meta of metas) {
    const bytes = await readAttachment(meta.id)
    // Une métadonnée sans octets est une pièce jointe déjà perdue : on ne la
    // recopie pas dans la sauvegarde, ce serait promettre une photo absente.
    if (bytes) attachments.push({ meta, bytesBase64: toBase64(bytes) })
  }
  return { vault, attachments }
}

/**
 * Remplace TOUT le contenu local par celui de la sauvegarde. Destructif par
 * nature : l'appel n'a de sens qu'après une confirmation explicite de la
 * personne, et l'interface le dit avant, pas après.
 *
 * Le chiffrement local n'est pas restauré : il appartient à l'appareil, pas
 * au fichier. Un carnet restauré sur un téléphone neuf repart en clair, et la
 * personne réactive la phrase de passe si elle la veut.
 */
export async function restoreBackup(payload: BackupPayload): Promise<void> {
  await wipeAll()
  await db.transaction('rw', db.vault, db.attachments, db.blobs, async () => {
    await db.vault.put({ id: 'vault', sealed: null, plain: payload.vault })
    for (const a of payload.attachments) {
      await db.attachments.put(a.meta)
      await db.blobs.put({ id: a.meta.id, sealed: null, plain: fromBase64(a.bytesBase64) })
    }
  })
  cache = payload.vault
}

/* ------------------------------------------------------------- urgence */

/** Rend la fiche de cet enfant, ou une fiche vide — jamais `undefined`. */
export async function readEmergencyCard(childId: string): Promise<EmergencyCard> {
  const v = await readVault()
  const found = v.emergency?.find((c) => c.childId === childId)
  return found ?? { childId, contacts: [], updatedAt: stamp() }
}

export async function saveEmergencyCard(card: EmergencyCard): Promise<void> {
  await mutate((v) => {
    const list = v.emergency ?? []
    const next = { ...card, updatedAt: stamp() }
    const i = list.findIndex((c) => c.childId === card.childId)
    if (i >= 0) list[i] = next
    else list.push(next)
    v.emergency = list
  })
}

export async function attachmentUsage(): Promise<{ count: number; bytes: number }> {
  const all = await db.attachments.toArray()
  return { count: all.length, bytes: all.reduce((s, a) => s + a.bytes, 0) }
}

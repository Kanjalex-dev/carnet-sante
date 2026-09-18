import {
  type KdfParams, type Sealed, deriveKey, newKdfParams, openJSON, sealJSON,
} from './crypto'
import type { AttachmentMeta, Vault } from './repository'

/**
 * Sauvegarde complète, destinée à retrouver son carnet après un téléphone
 * perdu, volé ou remplacé.
 *
 * Elle diffère du fichier d'échange co-parent sur un point décisif : elle
 * EMBARQUE les photographies. Un échange entre parents circule par messagerie
 * et doit rester léger ; une sauvegarde, elle, n'a de valeur que si elle
 * restitue tout. Un carnet restauré sans ses pages photographiées ne prouve
 * plus rien.
 *
 * Elle est toujours chiffrée, même quand le coffre local ne l'est pas : le
 * fichier part vers iCloud Drive, un disque, une pièce jointe — des endroits
 * qui ne sont pas l'appareil.
 */

export const BACKUP_FORMAT = 'carnet-backup'
export const BACKUP_VERSION = 1

/** Une pièce jointe sauvegardée : ses métadonnées, et ses octets en base64. */
export interface BackedAttachment {
  meta: AttachmentMeta
  bytesBase64: string
}

export interface BackupPayload {
  vault: Vault
  attachments: BackedAttachment[]
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  /** Lisible sans déchiffrer : permet d'annoncer le contenu avant restauration. */
  summary: { children: number; vaccinations: number; growth: number; attachments: number }
  kdf: KdfParams
  sealed: Sealed
}

export class NotABackupFileError extends Error {}
export class WrongPassphraseError extends Error {}
export class UnsupportedVersionError extends Error {}

/* ------------------------------------------------------------------ base64 */

/**
 * Conversion par tranches : `String.fromCharCode(...bytes)` sur une photo de
 * plusieurs mégaoctets dépasse la taille maximale de la pile d'arguments et
 * lève un RangeError. C'est un piège qui ne se voit qu'avec de vraies photos.
 */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let out = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(out)
}

export function fromBase64(text: string): Uint8Array {
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

/* ------------------------------------------------------------------ export */

export async function exportBackup(
  payload: BackupPayload,
  passphrase: string,
): Promise<string> {
  const kdf = newKdfParams()
  const key = await deriveKey(passphrase, kdf)
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    summary: {
      children: payload.vault.children.length,
      vaccinations: payload.vault.vaccinations.length,
      growth: payload.vault.growth.length,
      attachments: payload.attachments.length,
    },
    kdf,
    sealed: await sealJSON(key, payload),
  }
  return JSON.stringify(file)
}

/* -------------------------------------------------------------- relecture */

/** Lit l'en-tête sans déchiffrer : de quoi annoncer ce que contient le fichier. */
export function peekBackup(text: string): BackupFile {
  let file: BackupFile
  try {
    file = JSON.parse(text) as BackupFile
  } catch {
    throw new NotABackupFileError()
  }
  if (file?.format !== BACKUP_FORMAT || !file.kdf || !file.sealed) throw new NotABackupFileError()
  if (file.version > BACKUP_VERSION) throw new UnsupportedVersionError()
  return file
}

export async function readBackup(text: string, passphrase: string): Promise<BackupPayload> {
  const file = peekBackup(text)
  const key = await deriveKey(passphrase, file.kdf)
  try {
    const p = await openJSON<BackupPayload>(key, file.sealed)
    if (!Array.isArray(p?.vault?.children) || !Array.isArray(p?.vault?.vaccinations)) {
      throw new Error()
    }
    return {
      vault: {
        version: 1,
        children: p.vault.children,
        vaccinations: p.vault.vaccinations,
        growth: p.vault.growth ?? [],
      },
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
    }
  } catch {
    // AES-GCM échoue à l'authentification : phrase erronée, ou fichier altéré.
    throw new WrongPassphraseError()
  }
}

/** Nom de fichier daté, sans le prénom de l'enfant : il part hors de l'appareil. */
export function backupFilename(now = new Date()): string {
  const d = now.toISOString().slice(0, 10)
  return `carnet-sauvegarde-${d}.carnetbak`
}

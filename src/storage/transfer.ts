import { type KdfParams, type Sealed, deriveKey, newKdfParams, openJSON, sealJSON } from './crypto'
import type { MergeVault } from '../domain/merge'

/**
 * Fichier d'échange entre deux parents.
 *
 * Ce fichier quitte l'appareil : il passe par une messagerie, un cloud, une
 * clé USB. Il est donc toujours chiffré, même quand le coffre local ne l'est
 * pas, avec une phrase choisie pour l'échange et transmise autrement que le
 * fichier lui-même.
 *
 * Les photographies n'y figurent pas — c'est un choix : un fichier de
 * plusieurs dizaines de mégaoctets circule mal, et les pages du carnet sont
 * ce qu'il y a de plus identifiant dans l'application.
 */

export const TRANSFER_FORMAT = 'carnet-transfer'
export const TRANSFER_VERSION = 1

export interface TransferFile {
  format: typeof TRANSFER_FORMAT
  version: number
  exportedAt: string
  kdf: KdfParams
  sealed: Sealed
}

export class NotATransferFileError extends Error {}
export class WrongPassphraseError extends Error {}
export class UnsupportedVersionError extends Error {}

function strip(v: MergeVault): MergeVault {
  return {
    children: v.children,
    // Les identifiants de pièces jointes ne veulent rien dire sur l'autre
    // appareil : on ne les transporte pas.
    vaccinations: v.vaccinations.map((e) => ({ ...e, attachmentIds: [] })),
    growth: v.growth,
  }
}

export async function exportTransfer(vault: MergeVault, passphrase: string): Promise<string> {
  const kdf = newKdfParams()
  const key = await deriveKey(passphrase, kdf)
  const file: TransferFile = {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    kdf,
    sealed: await sealJSON(key, strip(vault)),
  }
  return JSON.stringify(file)
}

export async function readTransfer(text: string, passphrase: string): Promise<MergeVault> {
  let file: TransferFile
  try {
    file = JSON.parse(text) as TransferFile
  } catch {
    throw new NotATransferFileError()
  }
  if (file?.format !== TRANSFER_FORMAT || !file.kdf || !file.sealed) throw new NotATransferFileError()
  if (file.version > TRANSFER_VERSION) throw new UnsupportedVersionError()

  const key = await deriveKey(passphrase, file.kdf)
  try {
    const v = await openJSON<MergeVault>(key, file.sealed)
    if (!Array.isArray(v?.children) || !Array.isArray(v?.vaccinations)) throw new Error()
    return { children: v.children, vaccinations: v.vaccinations, growth: v.growth ?? [] }
  } catch {
    // AES-GCM échoue à l'authentification : phrase erronée, ou fichier altéré.
    throw new WrongPassphraseError()
  }
}

/** Nom de fichier lisible, sans le prénom de l'enfant : il circule par messagerie. */
export function transferFilename(now = new Date()): string {
  const d = now.toISOString().slice(0, 10)
  return `carnet-${d}.carnet`
}

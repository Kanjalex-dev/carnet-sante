import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { isNative } from './platform'

/**
 * Partage natif d'un fichier : la feuille de partage iOS donne accès à
 * l'e-mail, aux SMS, à AirDrop, et à toute app tierce (Mail du médecin,
 * messagerie de l'école) sans que l'application n'en connaisse aucune.
 * C'est délibérément l'inverse d'un bouton « envoyer par e-mail » qui
 * imposerait un seul canal.
 */
export async function shareFile(bytes: Uint8Array, filename: string, title: string): Promise<void> {
  if (!isNative()) throw new Error('Partage natif indisponible hors app iOS.')

  const base64 = uint8ToBase64(bytes)
  const written = await Filesystem.writeFile({
    path: filename, data: base64, directory: Directory.Cache,
  })
  await Share.share({ title, url: written.uri })
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

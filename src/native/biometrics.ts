import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth'
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage'
import { isNative } from './platform'

/**
 * Déverrouillage biométrique.
 *
 * Ce que Face ID fait ici, et ce qu'il ne fait pas : il ne déchiffre rien.
 * La clé du coffre est dérivée de la phrase secrète, et rien d'autre ne peut
 * la produire. La phrase est rangée dans le trousseau de l'appareil ;
 * l'application demande une authentification biométrique, et ne lit le
 * trousseau qu'une fois celle-ci réussie.
 *
 * L'alternative — laisser le coffre déverrouillé et se contenter d'afficher
 * un écran biométrique par-dessus — serait un décor : les données seraient en
 * clair sur l'appareil pour qui sait les lire. On ne le fait pas.
 *
 * Conséquence assumée : la phrase secrète reste indispensable. Face ID est un
 * raccourci quotidien, jamais un remplacement, et l'écran de verrouillage
 * garde toujours le champ de saisie.
 */

const KEY = 'carnet.vault.passphrase'

/**
 * `sync: false` sur chaque appel, et un stockage lié à cet appareil :
 * la phrase d'un coffre chiffré n'a rien à faire dans le trousseau iCloud,
 * où elle suivrait l'utilisateur sur des appareils qui n'ont pas le carnet.
 */
const NO_ICLOUD = false

export type BiometryAvailability =
  | { available: false }
  | { available: true; kind: 'face' | 'finger' | 'other'; label: string }

/** Ce que l'appareil propose réellement, pour nommer la chose correctement à l'écran. */
export async function biometryAvailability(): Promise<BiometryAvailability> {
  if (!isNative()) return { available: false }
  try {
    const info = await BiometricAuth.checkBiometry()
    if (!info.isAvailable) return { available: false }
    switch (info.biometryType) {
      case BiometryType.faceId:
        return { available: true, kind: 'face', label: 'Face ID' }
      case BiometryType.touchId:
        return { available: true, kind: 'finger', label: 'Touch ID' }
      case BiometryType.fingerprintAuthentication:
        return { available: true, kind: 'finger', label: 'l’empreinte' }
      default:
        return { available: true, kind: 'other', label: 'la biométrie' }
    }
  } catch {
    return { available: false }
  }
}

/** Vrai si une phrase a déjà été confiée au trousseau sur cet appareil. */
export async function isBiometricUnlockEnabled(): Promise<boolean> {
  if (!isNative()) return false
  try {
    return (await SecureStorage.get(KEY, false, NO_ICLOUD)) !== null
  } catch {
    return false
  }
}

/**
 * Confie la phrase au trousseau. À n'appeler qu'avec une phrase qui vient
 * d'ouvrir le coffre pour de bon : y ranger une phrase non vérifiée
 * fabriquerait un déverrouillage qui échoue sans qu'on sache pourquoi.
 */
export async function enableBiometricUnlock(passphrase: string): Promise<void> {
  await SecureStorage.set(
    KEY, passphrase, false, NO_ICLOUD,
    // L'entrée ne quitte pas cet appareil, même par une sauvegarde chiffrée.
    KeychainAccess.whenUnlockedThisDeviceOnly,
  )
}

export async function disableBiometricUnlock(): Promise<void> {
  try {
    await SecureStorage.remove(KEY, NO_ICLOUD)
  } catch {
    // Rien à retirer : le résultat voulu est déjà atteint.
  }
}

/**
 * Demande la biométrie, puis rend la phrase si elle a réussi. Rend `null`
 * dans tous les autres cas — refus, annulation, aucune phrase enregistrée —
 * parce qu'aucun de ces cas n'est une erreur à remonter : l'écran de saisie
 * est toujours là, derrière.
 *
 * L'authentification est explicite et vient AVANT la lecture : c'est elle qui
 * garde la phrase, pas le trousseau seul.
 */
export async function passphraseFromBiometrics(): Promise<string | null> {
  if (!isNative()) return null
  try {
    await BiometricAuth.authenticate({
      reason: 'Ouvrir le carnet de santé',
      cancelTitle: 'Saisir la phrase',
      // Le code de l'appareil reste une porte acceptable : c'est déjà le
      // secret qui protège tout le reste du téléphone.
      allowDeviceCredential: true,
      iosFallbackTitle: 'Utiliser le code',
    })
  } catch {
    // Refus, annulation, trop d'échecs : on retombe sur la saisie.
    return null
  }
  try {
    const stored = await SecureStorage.get(KEY, false, NO_ICLOUD)
    return typeof stored === 'string' && stored.length > 0 ? stored : null
  } catch {
    return null
  }
}

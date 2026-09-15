import { Capacitor } from '@capacitor/core'

/** Vrai dans l'app iOS, faux dans le navigateur — un seul point de vérité. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

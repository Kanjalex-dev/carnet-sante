import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { isNative } from './platform'

/**
 * Capture native d'une page de carnet. Sur iOS, on passe par la caméra du
 * système plutôt que par un `<input type="file">` : c'est ce qui donne accès
 * au flash, au cadrage natif, et évite le sélecteur de fichiers générique
 * qu'iOS affiche pour une simple entrée web.
 *
 * Renvoie un File, comme le sélecteur web : le reste du pipeline
 * (processImage → EXIF supprimé, redimensionnement) ne change pas.
 */
export async function takeNativePhoto(): Promise<File | null> {
  if (!isNative()) return null

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt, // laisse le choix caméra / photothèque
    quality: 90,
    correctOrientation: true,
  })
  if (!photo.webPath) return null

  const res = await fetch(photo.webPath)
  const blob = await res.blob()
  return new File([blob], `page-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
}

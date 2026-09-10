/**
 * Traitement des photographies avant stockage.
 *
 * Deux raisons de ne jamais stocker le fichier d'origine :
 *
 * 1. Confidentialité. Une photo prise au téléphone porte des métadonnées EXIF —
 *    coordonnées GPS, modèle d'appareil, horodatage. Le passage par un canvas
 *    les supprime entièrement : seuls les pixels sont réencodés.
 * 2. Place. Une photo de 12 Mpx pèse plusieurs mégaoctets ; la page d'un carnet
 *    reste parfaitement lisible en 2000 px de côté.
 */

const MAX_EDGE = 2000
const QUALITY = 0.85

export interface ProcessedImage {
  bytes: Uint8Array
  mimeType: string
  width: number
  height: number
}

export class ImageTooLargeError extends Error {}
export class NotAnImageError extends Error {}

/** 25 Mo : au-delà, c'est une vidéo ou un fichier inattendu. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024

export async function processImage(file: File | Blob): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) throw new NotAnImageError(file.type || 'type inconnu')
  if (file.size > MAX_INPUT_BYTES) throw new ImageTooLargeError(String(file.size))

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponible')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    )
    if (!blob) throw new Error("Échec de l'encodage de l'image")

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType: 'image/jpeg',
      width,
      height,
    }
  } finally {
    bitmap.close()
  }
}

/** Crée une URL d'objet pour l'affichage. À révoquer après usage. */
export function toObjectURL(bytes: Uint8Array, mimeType: string): string {
  return URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType }))
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

import { createWorker, type Worker } from 'tesseract.js'
import type { OcrLine } from '../domain/parse'

/**
 * Reconnaissance de texte, locale par défaut.
 *
 * Les fichiers du moteur (~3,7 Mo) sont servis depuis le dépôt, jamais depuis
 * un CDN : aucune requête vers un tiers, et l'application reste fonctionnelle
 * dans dix ans même si le CDN a disparu. Ils ne sont chargés qu'au premier
 * usage réel de la lecture.
 *
 * Limite assumée : sur de l'écriture manuscrite, la reconnaissance locale est
 * médiocre. Elle sert d'aide à la saisie, pas de source de vérité. L'interface
 * doit le dire, et rien ne s'enregistre sans validation humaine.
 */

function asset(path: string): string {
  return new URL(path, document.baseURI).href
}

let worker: Worker | null = null

export function simdAvailable(): boolean {
  try {
    // Séquence WASM minimale utilisant v128 : rejetée si SIMD n'est pas supporté.
    return WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
      10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]))
  } catch {
    return false
  }
}

export type OcrProgress = (step: string, ratio: number) => void

async function getWorker(onProgress?: OcrProgress): Promise<Worker> {
  if (worker) return worker
  worker = await createWorker('fra', 1, {
    workerPath: asset('ocr/worker.min.js'),
    corePath: asset('ocr/tesseract-core-simd-lstm.wasm.js'),
    langPath: asset('ocr/lang'),
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      onProgress?.(translate(m.status), m.progress)
    },
  })
  return worker
}

function translate(status: string): string {
  if (status.includes('loading language')) return 'Chargement du moteur'
  if (status.includes('initializing')) return 'Préparation'
  if (status.includes('recognizing')) return 'Lecture de la page'
  return 'Préparation'
}

export class OcrUnavailableError extends Error {}

export async function recognise(
  bytes: Uint8Array,
  mimeType: string,
  onProgress?: OcrProgress,
): Promise<OcrLine[]> {
  if (!simdAvailable()) {
    throw new OcrUnavailableError('Ce navigateur ne prend pas en charge la lecture locale.')
  }
  const w = await getWorker(onProgress)
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType })
  // `blocks` doit être demandé explicitement : la sortie par défaut ne contient
  // que le texte brut, sans découpage en lignes ni confiance par ligne.
  const { data } = await w.recognize(blob, {}, { text: true, blocks: true })

  type RawLine = { text: string; confidence: number }
  type RawBlock = { paragraphs?: { lines?: RawLine[] }[] }
  const d = data as unknown as { blocks?: RawBlock[]; text?: string; confidence?: number }

  const raw: RawLine[] = []
  for (const block of d.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) raw.push(line)
    }
  }

  // Repli : si le découpage en blocs manque, on coupe le texte brut.
  if (raw.length === 0 && d.text) {
    for (const line of d.text.split('\n')) {
      raw.push({ text: line, confidence: d.confidence ?? 60 })
    }
  }

  return raw
    .map((l) => ({ text: (l.text ?? '').replace(/\s+/g, ' ').trim(), confidence: (l.confidence ?? 0) / 100 }))
    .filter((l) => l.text.length > 0)
}

/** Libère le moteur : il occupe plusieurs dizaines de Mo en mémoire. */
export async function releaseOcr(): Promise<void> {
  if (!worker) return
  const w = worker
  worker = null
  await w.terminate()
}

/**
 * Prétraitement : niveaux de gris, contraste étiré, binarisation.
 * C'est l'étape qui détermine tout le reste — une page mal contrastée ne sera
 * jamais lue correctement, quel que soit le moteur.
 */
export async function preprocess(bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType })
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return bytes
    ctx.drawImage(bitmap, 0, 0)

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = img.data

    let min = 255
    let max = 0
    const grey = new Uint8Array(d.length / 4)
    for (let i = 0, g = 0; i < d.length; i += 4, g += 1) {
      const v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0
      grey[g] = v
      if (v < min) min = v
      if (v > max) max = v
    }
    const span = Math.max(1, max - min)
    for (let i = 0, g = 0; i < d.length; i += 4, g += 1) {
      const v = Math.max(0, Math.min(255, ((grey[g] - min) * 255) / span))
      d[i] = d[i + 1] = d[i + 2] = v
      d[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)

    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!out) return bytes
    return new Uint8Array(await out.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

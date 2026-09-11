import { isISODate, toISODate } from './dates'
import type { ISODate } from './dates'

/**
 * Lecture d'une page de carnet : transformation de lignes de texte en
 * propositions de vaccination.
 *
 * Aucune proposition n'est un fait. Tout ce qui sort d'ici doit passer par la
 * validation humaine avant d'être écrit — c'est la règle qui fait qu'une
 * mauvaise lecture reste une erreur visible et non une donnée de santé fausse.
 */

export interface ProductSpec { name: string; valences: string[] }

export interface OcrLine {
  text: string
  /** Confiance de reconnaissance, 0..1. */
  confidence: number
}

export interface Proposal {
  date?: ISODate
  productName?: string
  lotNumber?: string
  valences: string[]
  /** 0..1 — combine la confiance de lecture et ce qui a pu être identifié. */
  confidence: number
  rawLine: string
  /** Ce qui manque ou reste douteux, à afficher tel quel à l'utilisateur. */
  warnings: string[]
}

const DATE_PATTERNS = [
  /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/,
  /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})\b/,
]

export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Un millésime à deux chiffres est ramené dans une fenêtre plausible pour un
 * carnet d'enfant : jamais dans le futur, jamais au-delà de 100 ans.
 */
export function expandYear(two: number, currentYear: number): number {
  const century = Math.floor(currentYear / 100) * 100
  const candidate = century + two
  return candidate > currentYear ? candidate - 100 : candidate
}

export function findDate(text: string, currentYear: number): ISODate | undefined {
  for (const pattern of DATE_PATTERNS) {
    const m = pattern.exec(text)
    if (!m) continue
    const day = Number(m[1])
    const month = Number(m[2])
    const year = m[3].length === 4 ? Number(m[3]) : expandYear(Number(m[3]), currentYear)
    const iso = toISODate(year, month, day)
    if (isISODate(iso)) return iso
  }
  return undefined
}

export function findProduct(text: string, products: ProductSpec[]): ProductSpec | undefined {
  const haystack = normalise(text)
  let best: ProductSpec | undefined
  for (const p of products) {
    const needle = normalise(p.name)
    if (needle.length >= 4 && haystack.includes(needle)) {
      // Le nom le plus long l'emporte : « Infanrix Hexa » avant « Infanrix ».
      if (!best || needle.length > normalise(best.name).length) best = p
    }
  }
  return best
}

/** Un numéro de lot mêle lettres et chiffres, et n'est pas une date. */
export function findLot(text: string): string | undefined {
  const withoutDates = text.replace(/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/g, ' ')
  const tokens = withoutDates.split(/[\s,;:]+/)
  for (const raw of tokens) {
    const t = raw.replace(/[^A-Za-z0-9]/g, '')
    if (t.length < 5 || t.length > 16) continue
    if (!/[A-Za-z]/.test(t) || !/\d/.test(t)) continue
    return t.toUpperCase()
  }
  return undefined
}

export interface ParseOptions {
  products: ProductSpec[]
  currentYear: number
  /** Rien avant la naissance, rien après aujourd'hui. */
  birthDate?: ISODate
  today?: ISODate
}

/**
 * Un carnet porte des en-têtes qui contiennent une date sans décrire une
 * injection — « Date de naissance », « Nom de l'enfant ». Sans ce filtre, la
 * date de naissance de l'enfant est proposée comme une vaccination.
 */
const HEADER_WORDS = [
  'datedenaissance', 'nedele', 'neele', 'nomdelenfant', 'prenom',
  'carnetdesante', 'vaccinations', 'signature', 'numerodelot', 'ndelot',
]

export function looksLikeHeader(text: string): boolean {
  const n = normalise(text)
  return HEADER_WORDS.some((w) => n.includes(w))
}

export function parseLine(line: OcrLine, options: ParseOptions): Proposal | null {
  if (looksLikeHeader(line.text)) return null

  const date = findDate(line.text, options.currentYear)
  const product = findProduct(line.text, options.products)
  const lot = findLot(line.text)

  // Une ligne sans date ni produit n'apporte rien d'exploitable.
  if (!date && !product) return null

  const warnings: string[] = []
  if (!date) warnings.push('Date non lue')
  if (!product) warnings.push('Produit non identifié')
  if (date && options.birthDate && date < options.birthDate) {
    warnings.push('Date antérieure à la naissance')
  }
  if (date && options.today && date > options.today) {
    warnings.push('Date dans le futur')
  }

  // La confiance de lecture est pondérée par ce qu'on a pu identifier.
  let score = line.confidence
  if (!date) score *= 0.55
  if (!product) score *= 0.7
  if (warnings.some((w) => w.startsWith('Date antérieure') || w.startsWith('Date dans'))) {
    score *= 0.4
  }

  return {
    date,
    productName: product?.name,
    lotNumber: lot,
    valences: product?.valences ?? [],
    confidence: Math.max(0, Math.min(1, score)),
    rawLine: line.text.trim(),
    warnings,
  }
}

export function parseLines(lines: OcrLine[], options: ParseOptions): Proposal[] {
  const out: Proposal[] = []
  for (const line of lines) {
    const p = parseLine(line, options)
    if (p) out.push(p)
  }
  return dedupe(out)
}

/** Deux lignes donnant la même date et le même produit décrivent une seule injection. */
export function dedupe(proposals: Proposal[]): Proposal[] {
  const seen = new Map<string, Proposal>()
  for (const p of proposals) {
    const k = `${p.date ?? '?'}|${p.productName ?? '?'}`
    const existing = seen.get(k)
    if (!existing) { seen.set(k, p); continue }
    // On garde la meilleure lecture, en complétant le lot s'il manquait.
    const best = p.confidence > existing.confidence ? p : existing
    const other = best === p ? existing : p
    seen.set(k, { ...best, lotNumber: best.lotNumber ?? other.lotNumber })
  }
  return [...seen.values()].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
}

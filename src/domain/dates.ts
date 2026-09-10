/**
 * Dates civiles.
 *
 * Une date de naissance ou de vaccination est une date CIVILE, pas un instant.
 * Tout passage par `new Date(iso)` puis une lecture UTC décale d'un jour à
 * l'ouest de Greenwich et fausse toutes les échéances. On ne manipule donc que
 * des chaînes 'YYYY-MM-DD' et des entiers.
 */

export type ISODate = string

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== 'string') return false
  const m = PATTERN.exec(v)
  if (!m) return false
  const [, y, mo, d] = m
  const year = Number(y), month = Number(mo), day = Number(d)
  if (month < 1 || month > 12 || day < 1) return false
  return day <= daysInMonth(year, month)
}

export function parts(date: ISODate): { year: number; month: number; day: number } {
  const m = PATTERN.exec(date)
  if (!m) throw new Error(`Date civile invalide : ${date}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

/** Numéro de jour continu, pour soustraire deux dates sans fuseau horaire. */
export function dayNumber(date: ISODate): number {
  const { year, month, day } = parts(date)
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
}

export function fromDayNumber(n: number): ISODate {
  const a = n + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor(146097 * b / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor(1461 * d / 4)
  const m = Math.floor((5 * e + 2) / 153)
  return toISODate(
    100 * b + d - 4800 + Math.floor(m / 10),
    m + 3 - 12 * Math.floor(m / 10),
    e - Math.floor((153 * m + 2) / 5) + 1,
  )
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return dayNumber(to) - dayNumber(from)
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(date) + days)
}

/**
 * Ajoute des mois calendaires. Le 31 mars + 1 mois donne le 30 avril :
 * on borne au dernier jour du mois d'arrivée plutôt que de déborder.
 */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = parts(date)
  const total = year * 12 + (month - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return toISODate(y, m, Math.min(day, daysInMonth(y, m)))
}

/** Âge en mois révolus. */
export function ageInMonths(birth: ISODate, at: ISODate): number {
  const b = parts(birth), a = parts(at)
  let months = (a.year - b.year) * 12 + (a.month - b.month)
  if (a.day < b.day) months -= 1
  return months
}

export function compare(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Date civile d'aujourd'hui dans le fuseau de l'appareil, sans passer par UTC. */
export function today(now: Date = new Date()): ISODate {
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

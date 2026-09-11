import type { ISODate } from './dates'

export type ISOStamp = string

export interface Child {
  id: string
  firstName: string
  birthDate: ISODate
  sex: 'F' | 'M'
  scheduleId: string
  createdAt: ISOStamp
  updatedAt: ISOStamp
  deletedAt?: ISOStamp
}

export interface VaccinationEvent {
  id: string
  childId: string
  valences: string[]
  productName?: string
  doseNumber?: number
  date: ISODate
  lotNumber?: string
  practitioner?: string
  place?: string
  source: 'manual' | 'ocr-local' | 'ocr-remote' | 'import'
  confidence?: number
  verifiedByUser: boolean
  attachmentIds: string[]
  notes?: string
  createdAt: ISOStamp
  updatedAt: ISOStamp
  deletedAt?: ISOStamp
}

export interface GrowthMeasure {
  id: string
  childId: string
  date: ISODate
  weightKg?: number
  heightCm?: number
  headCircumferenceCm?: number
  source: 'manual' | 'ocr-local' | 'ocr-remote'
  verifiedByUser: boolean
  createdAt: ISOStamp
  updatedAt: ISOStamp
  deletedAt?: ISOStamp
}

export interface DoseSpec {
  n: number
  targetAgeMonths: number
  minAgeMonths: number
  maxAgeMonths: number
  minIntervalDays?: number
  label: string
}

export interface ValenceSpec {
  code: string
  label: string
  shortLabel: string
  /** Explication grand public : contre quoi ce vaccin protège. */
  protects?: string
  mandatoryBirthFrom?: ISODate
  mandatoryBirthUntil?: ISODate
  supersededBy?: string
  recommended?: boolean
  doses: DoseSpec[]
}

export interface Schedule {
  id: string
  label: string
  schemaVersion: number
  source: string
  sourceUrl: string
  publishedAt: ISODate
  checkedAt: ISODate
  warning?: string
  valences: ValenceSpec[]
}

export type DoseState = 'done' | 'due' | 'late' | 'upcoming' | 'not-applicable'

export interface DoseStatus {
  valenceCode: string
  valenceLabel: string
  shortLabel: string
  mandatory: boolean
  doseNumber: number
  doseLabel: string
  state: DoseState
  /** Date au plus tôt à laquelle la dose peut être administrée. */
  earliestDate: ISODate
  /** Date cible issue du calendrier. */
  targetDate: ISODate
  /** Date au-delà de laquelle la fenêtre est dépassée. */
  latestDate: ISODate
  /** Jours écoulés depuis la date cible, quand elle est dépassée. */
  daysSinceTarget?: number
  /** Jours écoulés depuis la fin de la fenêtre, quand elle est dépassée. */
  daysLate?: number
  administeredOn?: ISODate
  verified?: boolean
  eventId?: string
}

export interface ValenceStatus {
  code: string
  label: string
  shortLabel: string
  mandatory: boolean
  doses: DoseStatus[]
  complete: boolean
  hasLate: boolean
  hasUnverified: boolean
}

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

/**
 * Fiche d'urgence : ce qu'un adulte doit pouvoir lire en trente secondes chez
 * la nounou, en colonie ou aux urgences.
 *
 * Tous les champs sont du texte libre saisi par le parent et restitués tels
 * quels. L'application n'en déduit rien, ne les vérifie pas et ne les
 * complète pas : le moment où elle commencerait à interpréter « pénicilline »
 * est le moment où elle deviendrait autre chose qu'un carnet.
 */
export interface EmergencyCard {
  childId: string
  bloodGroup?: string
  allergies?: string
  treatments?: string
  history?: string
  doctorName?: string
  doctorPhone?: string
  contacts: EmergencyContact[]
  updatedAt: ISOStamp
}

export interface EmergencyContact {
  id: string
  name: string
  relation?: string
  phone: string
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

/**
 * Un carnet ne juge pas. Une dose est inscrite, ou elle ne l'est pas.
 * Aucun etat « en retard » ni « a faire » n'est calcule pour un enfant :
 * cette lecture appartient au medecin qui le suit.
 */
export type DoseState = 'done' | 'not-recorded'

export interface DoseStatus {
  valenceCode: string
  valenceLabel: string
  shortLabel: string
  mandatory: boolean
  doseNumber: number
  doseLabel: string
  state: DoseState
  /** Age prevu par le calendrier officiel, en mois. Jamais une date calculee. */
  targetAgeMonths: number
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
  hasUnverified: boolean
}

/**
 * Un rappel cree par le parent : il choisit la date et ecrit le libelle.
 * L'application ne derive jamais un rappel du calendrier vaccinal.
 */
export interface ParentReminder {
  id: string
  childId: string
  label: string
  date: ISODate
  note?: string
  createdAt: string
  deletedAt?: string
}

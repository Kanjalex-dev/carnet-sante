import { addDays, compare, type ISODate } from '../domain/dates'
import type { DoseStatus } from '../domain/types'

/**
 * Calcule QUELLES notifications programmer, sans jamais toucher à l'API
 * native. C'est ce qui rend ce module testable sans téléphone, et ce qui
 * permet de vérifier son comportement avant de le brancher sur iOS.
 *
 * Deux alertes par rendez-vous à venir : sept jours avant, puis le jour même.
 * Rien pour les rendez-vous déjà en retard au moment du calcul — inonder de
 * notifications un parent qui a déjà du retard n'aide pas, ça décourage.
 */

export interface PlannedReminder {
  id: number
  valenceCode: string
  doseNumber: number
  title: string
  body: string
  /** Date-heure locale de déclenchement. */
  at: Date
}

const HOUR = 9 // 9h locales : pas de notification nocturne.

/** Identifiant stable et déterministe — reprogrammer ne duplique jamais. */
function reminderId(valenceCode: string, doseNumber: number, offset: 'j7' | 'j0'): number {
  let hash = offset === 'j0' ? 1 : 2
  const key = `${valenceCode}:${doseNumber}`
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return hash % 2147483647
}

function atNine(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, HOUR, 0, 0, 0)
}

export function planReminders(doses: DoseStatus[], today: ISODate): PlannedReminder[] {
  const out: PlannedReminder[] = []
  for (const d of doses) {
    if (d.state === 'late' || d.administeredOn) continue
    const j7 = addDays(d.targetDate, -7)
    const label = d.shortLabel || d.valenceLabel

    if (compare(j7, today) >= 0) {
      out.push({
        id: reminderId(d.valenceCode, d.doseNumber, 'j7'),
        valenceCode: d.valenceCode, doseNumber: d.doseNumber,
        title: 'Vaccin dans une semaine',
        body: `${label} — dose ${d.doseNumber}, prévue le ${frShort(d.targetDate)}.`,
        at: atNine(j7),
      })
    }
    if (compare(d.targetDate, today) >= 0) {
      out.push({
        id: reminderId(d.valenceCode, d.doseNumber, 'j0'),
        valenceCode: d.valenceCode, doseNumber: d.doseNumber,
        title: "C'est aujourd'hui",
        body: `${label} — dose ${d.doseNumber} prévue aujourd'hui, selon le calendrier.`,
        at: atNine(d.targetDate),
      })
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

function frShort(iso: ISODate): string {
  const [, m, d] = iso.split('-').map(Number)
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  return `${d} ${MOIS[(m ?? 1) - 1]}`
}

import type { ISODate } from '../domain/dates'
import type { ParentReminder } from '../domain/types'

/**
 * Calcule QUELLES notifications programmer, sans jamais toucher a l'API
 * native. C'est ce qui rend ce module testable sans telephone.
 *
 * Ce module ne lit pas le calendrier vaccinal et ne connait pas l'etat du
 * carnet. Il ne programme que ce que le parent a lui-meme cree : une date
 * qu'il a choisie, un libelle qu'il a ecrit. L'application ne decide jamais
 * qu'un rendez-vous approche.
 */

export interface PlannedReminder {
  id: number
  reminderId: string
  title: string
  body: string
  /** Date-heure locale de declenchement. */
  at: Date
}

const HOUR = 9 // 9h locales : pas de notification nocturne.

/** Identifiant stable et deterministe — reprogrammer ne duplique jamais. */
function reminderId(id: string): number {
  let hash = 7
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash % 2147483647
}

function atNine(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, HOUR, 0, 0, 0)
}

export function planReminders(reminders: ParentReminder[], today: ISODate): PlannedReminder[] {
  const out: PlannedReminder[] = []
  for (const r of reminders) {
    if (r.deletedAt) continue
    if (r.date < today) continue
    out.push({
      id: reminderId(r.id),
      reminderId: r.id,
      title: r.label,
      body: r.note ?? 'Rappel que vous avez programme dans Carnet.',
      at: atNine(r.date),
    })
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

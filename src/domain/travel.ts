import { compare } from './dates'
import type { VaccinationEvent } from './types'

/**
 * Carnet de voyage.
 *
 * Enregistrement SEUL. Ce module ne connait aucun pays, aucune carte de
 * risque, aucune correspondance destination -> vaccin. La destination est
 * une etiquette libre saisie par le voyageur : elle classe un enregistrement,
 * elle ne declenche rien.
 *
 * C'est la frontiere a tenir. Une recommandation vaccinale par pays serait
 * un conseil medical individualise, et ferait basculer l'application du cote
 * du dispositif medical — voir travel.test.ts, qui verifie qu'aucune
 * fonction d'ici ne prend un pays en entree.
 */

/** Prefixe des codes de voyage, pour ne jamais collisionner avec le calendrier. */
export const TRAVEL_PREFIX = 'TRAVEL:'

export interface TravelVaccine {
  code: string
  label: string
  /** Ce contre quoi il protege. Repris tel quel, jamais reformule. */
  protects: string
}

/**
 * Liste fixe, identique quelle que soit la destination. L'ordre est
 * alphabetique : tout autre ordre suggererait une priorite.
 */
export const TRAVEL_VACCINES: TravelVaccine[] = [
  { code: `${TRAVEL_PREFIX}CHOLERA`, label: 'Choléra',
    protects: 'Infection intestinale transmise par l’eau ou les aliments souillés.' },
  { code: `${TRAVEL_PREFIX}ENCEPHALITE_JAP`, label: 'Encéphalite japonaise',
    protects: 'Infection du cerveau transmise par des moustiques, en Asie et dans le Pacifique occidental.' },
  { code: `${TRAVEL_PREFIX}FIEVRE_JAUNE`, label: 'Fièvre jaune',
    protects: 'Maladie virale transmise par des moustiques, en Afrique intertropicale et en Amérique du Sud.' },
  { code: `${TRAVEL_PREFIX}TYPHOIDE`, label: 'Fièvre typhoïde',
    protects: 'Infection transmise par l’eau ou les aliments souillés.' },
  { code: `${TRAVEL_PREFIX}HEPATITE_A`, label: 'Hépatite A',
    protects: 'Infection du foie transmise par l’eau ou les aliments souillés.' },
  { code: `${TRAVEL_PREFIX}MENINGOCOQUE_ACWY`, label: 'Méningocoque ACWY',
    protects: 'Méningites et infections graves à méningocoques des groupes A, C, W et Y.' },
  { code: `${TRAVEL_PREFIX}RAGE`, label: 'Rage',
    protects: 'Maladie transmise par la morsure ou le léchage d’un animal infecté.' },
]

export function isTravelCode(code: string): boolean {
  return code.startsWith(TRAVEL_PREFIX)
}

export function travelVaccine(code: string): TravelVaccine | undefined {
  return TRAVEL_VACCINES.find((v) => v.code === code)
}

export interface TravelRecord {
  eventId: string
  code: string
  label: string
  date: string
  /** Etiquette libre. Jamais interpretee. */
  destination?: string
  verified: boolean
}

/** Les enregistrements de voyage du carnet, du plus recent au plus ancien. */
export function travelRecords(events: VaccinationEvent[]): TravelRecord[] {
  const out: TravelRecord[] = []
  for (const e of events) {
    if (e.deletedAt) continue
    for (const code of e.valences) {
      if (!isTravelCode(code)) continue
      out.push({
        eventId: e.id,
        code,
        label: travelVaccine(code)?.label ?? code.slice(TRAVEL_PREFIX.length),
        date: e.date,
        destination: e.destination,
        verified: e.verifiedByUser,
      })
    }
  }
  return out.sort((a, b) => compare(b.date, a.date))
}

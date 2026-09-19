import { addMonths, ageInMonths, compare, type ISODate } from './dates'
import { computeStatus, groupByVisit } from './status'
import type { DoseStatus, Schedule, VaccinationEvent } from './types'

/**
 * Position du calendrier officiel par rapport a une date de naissance.
 *
 * Ce module est la seule frontiere ou Carnet passe d'une restitution a une
 * indication. Ce qu'il fait tient en une phrase : il applique un bareme public
 * a une date de naissance. Il n'a aucune donnee clinique en entree, et deux
 * personnes nees le meme mois obtiennent exactement la meme sortie.
 *
 * Ce qu'il ne fait pas, et ne doit jamais faire — voir timeline.test.ts :
 *   - aucun decompte de retard, en jours ou en mois ;
 *   - aucun qualificatif porte sur la personne (« en retard », « a jour ») ;
 *   - aucune ponderation par gravite, risque ou urgence.
 *
 * Un rendez-vous « courant » n'est pas un rendez-vous a prendre : c'est celui
 * que le calendrier place a cet age. Le libelle affiche doit rester une
 * question a poser au medecin.
 */

export interface VisitPosition {
  /** Cle stable : l'age prevu par le calendrier, en mois. */
  key: number
  /** Libelle officiel du rendez-vous : « 2 mois », « 16-18 mois ». */
  label: string
  targetAgeMonths: number
  /** Age auquel la fenetre du calendrier s'ouvre : le plus petit minAgeMonths. */
  opensAtAgeMonths: number
  /**
   * Date de naissance + opensAtAgeMonths. Precision au mois : le jour est
   * celui de la naissance. C'est l'ouverture de la fenetre, jamais une
   * echeance — le calendrier donne une plage, pas une date limite.
   */
  opensOn: ISODate
  /**
   * Date de naissance + targetAgeMonths. C'est CETTE date qui porte les
   * rappels, et non l'ouverture de fenetre : un rappel « Rendez-vous 6 ans »
   * date de la veille des 5 ans et demi se lit comme un bug, pas comme une
   * avance. Le libelle et la date doivent dire la meme chose.
   */
  plannedOn: ISODate
  doses: DoseStatus[]
  /** Toutes les doses de ce rendez-vous sont inscrites au carnet. */
  recorded: boolean
}

export interface Timeline {
  ageMonths: number
  scheduleLabel: string
  /** Date a laquelle le bareme a ete applique — affichee avec le resultat. */
  appliedOn: ISODate
  /**
   * Le rendez-vous que le calendrier place a cet age, s'il n'est pas deja
   * inscrit. Null quand rien n'est prevu a cet age, ou quand c'est inscrit.
   */
  current: VisitPosition | null
  /** Rendez-vous places plus tot dans le calendrier, du plus ancien au plus recent. */
  earlier: VisitPosition[]
  /** Rendez-vous places plus tard. */
  later: VisitPosition[]
  /** Premier repere a venir, pour le cas ou rien n'est prevu a cet age. */
  nextLandmark: VisitPosition | null
  /** Rendez-vous du calendrier inscrits au carnet. */
  recordedVisits: number
  /** Rendez-vous du calendrier sans inscription. Jamais presente comme un score. */
  notRecordedVisits: number
}

/** Plus petit minAgeMonths du referentiel pour les doses de ce rendez-vous. */
function windowOpensAt(schedule: Schedule, key: number, doses: DoseStatus[]): number {
  const codes = new Set(doses.map((d) => d.valenceCode))
  const mins: number[] = []
  for (const v of schedule.valences) {
    if (!codes.has(v.code)) continue
    for (const spec of v.doses) {
      if (spec.targetAgeMonths === key) mins.push(spec.minAgeMonths)
    }
  }
  return mins.length > 0 ? Math.min(...mins) : key
}

function position(
  key: number,
  label: string,
  doses: DoseStatus[],
  birthDate: ISODate,
  schedule: Schedule,
): VisitPosition {
  const opensAtAgeMonths = windowOpensAt(schedule, key, doses)
  return {
    key,
    label,
    targetAgeMonths: key,
    opensAtAgeMonths,
    opensOn: addMonths(birthDate, opensAtAgeMonths),
    plannedOn: addMonths(birthDate, key),
    doses,
    recorded: doses.every((d) => d.state === 'done'),
  }
}

/**
 * Le rendez-vous dont la plage contient cet age : le dernier dont l'age prevu
 * est deja atteint. La plage court jusqu'au rendez-vous suivant — le
 * calendrier ne fixe pas de fin, il enchaine.
 */
function bracketIndex(visits: VisitPosition[], ageMonths: number): number {
  let idx = -1
  for (let i = 0; i < visits.length; i += 1) {
    if (visits[i].targetAgeMonths <= ageMonths) idx = i
    else break
  }
  return idx
}

export function buildTimeline(
  schedule: Schedule,
  birthDate: ISODate,
  events: VaccinationEvent[],
  today: ISODate,
): Timeline {
  const doses = computeStatus(schedule, birthDate, events).flatMap((v) => v.doses)
  const visits = groupByVisit(doses).map((g) => position(g.key, g.label, g.doses, birthDate, schedule))
  const ageMonths = ageInMonths(birthDate, today)
  const idx = bracketIndex(visits, ageMonths)

  const bracket = idx >= 0 ? visits[idx] : null
  const earlier = idx >= 0 ? visits.slice(0, idx) : []
  const later = idx >= 0 ? visits.slice(idx + 1) : [...visits]

  return {
    ageMonths,
    scheduleLabel: schedule.label,
    appliedOn: today,
    current: bracket && !bracket.recorded ? bracket : null,
    earlier,
    later,
    nextLandmark: later[0] ?? null,
    recordedVisits: visits.filter((v) => v.recorded).length,
    notRecordedVisits: visits.filter((v) => !v.recorded).length,
  }
}

export interface CalendarReminder {
  /** Deterministe : meme carnet, meme identifiant. Permet de ne pas dupliquer. */
  id: string
  childId: string
  label: string
  date: ISODate
  origin: 'calendar'
  scheduleLabel: string
  past: boolean
}

/**
 * Rappels issus du calendrier, a l'ouverture de la fenetre et non a sa
 * fermeture : le signal dit « vous pouvez en parler », pas « c'est la date
 * limite ». Les rendez-vous deja passes n'en produisent pas — un rappel pour
 * une date echue ne rappelle rien, il constate un retard.
 */
export function calendarReminders(
  timeline: Timeline,
  childId: string,
): CalendarReminder[] {
  const upcoming = timeline.current ? [timeline.current, ...timeline.later] : timeline.later
  return upcoming
    .filter((v) => !v.recorded)
    .map((v) => ({
      id: `cal:${childId}:${v.key}`,
      childId,
      label: `Rendez-vous ${v.label}`,
      date: v.plannedOn,
      origin: 'calendar' as const,
      scheduleLabel: timeline.scheduleLabel,
      /** Deja passe : listable dans le carnet, jamais notifie. */
      past: compare(v.plannedOn, timeline.appliedOn) < 0,
    }))
}

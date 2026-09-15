import type { Explanation } from './Explain'
import type { Schedule, ValenceSpec } from '../domain/types'

/**
 * Fabrique des explications grand public. Un seul endroit pour ces textes :
 * ils doivent dire la même chose partout où l'utilisateur les rencontre.
 */

export function valenceExplanation(v: ValenceSpec): Explanation {
  const ages = v.doses.map((d) => d.label).join(', ')
  const details = [
    v.recommended
      ? 'Statut : recommandé. Il n’est pas exigé pour l’entrée en collectivité, mais votre médecin peut le conseiller.'
      : 'Statut : obligatoire pour les enfants nés à partir de la date d’entrée en vigueur, et exigible en crèche ou à l’école.',
    `Rendez-vous prévus au calendrier : ${ages}.`,
  ]
  return {
    eyebrow: v.shortLabel !== v.label ? v.shortLabel : undefined,
    title: v.label,
    body: v.protects ?? "Vaccin inscrit au calendrier vaccinal français.",
    details,
    medicalNote: true,
  }
}

/** Index code → explication, construit une fois à partir du référentiel. */
export function buildValenceIndex(schedule: Schedule): Map<string, Explanation> {
  return new Map(schedule.valences.map((v) => [v.code, valenceExplanation(v)]))
}

/**
 * Nom lisible d'une valence, jamais le code interne. On prend la forme courte,
 * qui reste en français courant : le nom complet apparaît dans la fiche.
 */
export function buildLabelIndex(schedule: Schedule): Map<string, string> {
  return new Map(schedule.valences.map((v) => [v.code, v.shortLabel]))
}

export function progressExplanation(satisfied: number, total: number, birthDate: string): Explanation {
  const complete = satisfied === total
  return {
    eyebrow: `${satisfied} sur ${total}`,
    title: 'Que représente ce chiffre ?',
    body: complete
      ? `Les ${total} vaccins obligatoires pour un enfant né le ${fr(birthDate)} sont à jour : aucune dose n’a dépassé le délai prévu par le calendrier.`
      : `Sur les ${total} vaccins obligatoires pour un enfant né le ${fr(birthDate)}, ${satisfied} ${satisfied > 1 ? 'sont à jour' : 'est à jour'}. ${total - satisfied > 1 ? 'Les autres ont' : "L’autre a"} au moins une dose dont le délai prévu est dépassé.`,
    details: [
      'Le compte porte sur les vaccinations, pas sur les piqûres : une seule injection peut en couvrir jusqu’à six.',
      'La liste des obligations dépend de la date de naissance de l’enfant : elle a changé en 2018, puis en 2025.',
      'Une vaccination reste comptée comme à jour tant que la prochaine dose n’a pas dépassé son délai.',
    ],
    medicalNote: true,
  }
}

export function confidenceExplanation(percent: number): Explanation {
  const level = percent >= 80 ? 'élevé' : percent >= 55 ? 'moyen' : 'faible'
  return {
    eyebrow: `${percent} %`,
    title: 'Indice de confiance de la lecture',
    body: `Ce pourcentage indique à quel point la lecture automatique de cette ligne est sûre. Ici il est ${level}. Ce n’est pas une note sur le vaccin : c’est une note sur le déchiffrage de l’écriture.`,
    details: [
      '80 % et plus : la ligne a été lue nettement, une vérification rapide suffit.',
      'Entre 55 et 80 % : relisez la ligne sur la photo avant d’accepter.',
      'Moins de 55 % : l’écriture est peu lisible, corrigez à la main.',
      'Quel que soit le chiffre, rien n’est enregistré tant que vous n’avez pas validé.',
    ],
  }
}

export function verifiedExplanation(): Explanation {
  return {
    title: 'Vérifié ou non vérifié ?',
    body: 'Une ligne est « vérifiée » quand vous l’avez confirmée vous-même, le carnet sous les yeux. Une ligne importée depuis une photo sans relecture individuelle reste « non vérifiée ».',
    details: [
      'La distinction apparaît aussi dans le récapitulatif PDF : une ligne non vérifiée y est signalée sur fond teinté.',
      'Vous pouvez lever cet état à tout moment depuis l’onglet Carnet, avec le bouton « Marquer vérifié ».',
    ],
  }
}

const FR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
function fr(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return FR.format(new Date(y, (m ?? 1) - 1, d ?? 1))
}

export function percentileExplanation(percentile: number, indicatorLabel: string): Explanation {
  const p = Math.round(percentile)
  return {
    eyebrow: `${p}ᵉ centile`,
    title: 'Que veut dire ce centile ?',
    body: `Sur 100 enfants du même âge et du même sexe dans la population de référence de l’OMS, environ ${p} auraient un ${indicatorLabel.toLowerCase()} inférieur à celui-ci. C’est une situation par rapport à une moyenne, pas une note.`,
    details: [
      'Un enfant peut être durablement au 10ᵉ ou au 90ᵉ centile et se porter parfaitement bien : ce qui compte pour le médecin est la régularité de la courbe, pas le chiffre isolé.',
      'Les couloirs tracés sur le graphique sont des écarts-types (−2 ET, médiane, +2 ET), comme sur les courbes du carnet papier.',
      'La référence OMS s’arrête à 5 ans : au-delà, les mesures sont conservées mais ne sont plus placées sur la courbe.',
    ],
    medicalNote: true,
  }
}

export function growthExplanation(): Explanation {
  return {
    title: 'À quoi sert cette courbe ?',
    body: 'Elle situe le poids, la taille et le périmètre crânien de votre enfant par rapport à une population de référence de l’OMS. L’application place les points, elle ne les interprète pas.',
    details: [
      'Les mesures sont celles que vous saisissez, généralement relevées lors des visites médicales.',
      'Les couloirs de référence valent pour un enfant né à terme. En cas de prématurité, l’âge corrigé se discute avec le médecin.',
      'Rien ne sort de votre téléphone : le calcul se fait sur l’appareil.',
    ],
    medicalNote: true,
  }
}

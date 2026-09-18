/**
 * Textes juridiques de Carnet.
 *
 * La destination revendiquée est le texte qui compte : sous MDCG 2019-11,
 * c'est elle, avec la fonction réelle du logiciel, qui détermine si une
 * application relève du reglement sur les dispositifs medicaux. Elle est ici
 * volontairement restrictive, et le code est écrit pour qu'elle reste vraie —
 * voir les garde-fous dans domain/status.test.ts et domain/catchup.test.ts.
 *
 * Ce texte n'a pas été relu par un avocat. Il doit l'être avant publication.
 */

export const INTENDED_PURPOSE = `Carnet est un outil personnel d'archivage et de consultation. Il permet à un parent d'enregistrer, de photographier et de retrouver les informations figurant dans le carnet de santé de son enfant, et de consulter le calendrier vaccinal publié par le ministère de la Santé.

Carnet ne produit aucune analyse, aucun diagnostic, aucune recommandation individualisée, et n'est destiné à fonder aucune décision médicale. Les décisions de vaccination et de suivi relèvent exclusivement du professionnel de santé qui suit l'enfant.

Carnet ne remplace pas le carnet de santé papier, qui reste le document de référence.`

/** Affiché une fois à l'installation, avec validation explicite. */
export const ONBOARDING_DISCLAIMER = {
  title: "Carnet n'est pas un outil médical.",
  body: `Il enregistre ce que vous y saisissez et affiche le calendrier vaccinal officiel. Il ne calcule rien pour votre enfant, ne signale aucun retard et ne recommande aucune date. Seul votre médecin peut le faire.`,
  footer: 'Carnet ne remplace pas le carnet de santé papier, qui reste le document de référence.',
  accept: "J'ai compris",
} as const

/** Mentions par écran, au plus près de ce qu'elles qualifient. */
export const SCREEN_NOTICES = {
  vaccines: 'Votre médecin adapte ce calendrier à votre enfant.',
  growth: "Courbes de référence OMS 0–5 ans. La position d'un point ne s'interprète pas seule.",
  catchUp: "Tableau du calendrier officiel. À discuter avec votre médecin.",
  reminders: "Rappels que vous créez vous-même. Carnet n'en propose aucun.",
} as const

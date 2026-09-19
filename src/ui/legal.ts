/**
 * Textes juridiques de Carnet.
 *
 * La destination revendiquée est le texte qui compte : sous MDCG 2019-11, c'est
 * elle, avec la fonction réelle du logiciel, qui détermine si une application
 * relève du règlement sur les dispositifs médicaux.
 *
 * ATTENTION — changement de position. Jusqu'à la version précédente, Carnet ne
 * calculait rien pour un enfant donné et la destination revendiquée le disait.
 * Ce n'est plus vrai : Carnet applique désormais le calendrier officiel à une
 * date de naissance saisie et signale les rendez-vous que ce calendrier prévoit
 * à cet âge. Les garde-fous correspondants (domain/status.test.ts,
 * domain/catchup.test.ts) ont été retirés sciemment.
 *
 * La position ne se défend donc plus par « hors champ » mais par la nature de
 * ce qui est produit : l'application d'un barème public à une date, sans aucune
 * donnée clinique en entrée, sans jugement sur la personne, et présentée comme
 * une question à poser au médecin plutôt que comme une conduite à tenir.
 *
 * Ce texte n'a pas été relu par un avocat. Il doit l'être avant publication,
 * par un praticien du droit des dispositifs médicaux — pas par un généraliste.
 */

export const INTENDED_PURPOSE = `Carnet est une aide au rappel et un outil personnel d'archivage. Il permet à un parent d'enregistrer, de photographier et de retrouver les informations figurant dans le carnet de santé papier, et de conserver la trace des vaccinations déjà faites.

À partir de la seule date de naissance saisie par l'utilisateur, Carnet applique le calendrier vaccinal publié par le ministère de la Santé et signale les rendez-vous que ce calendrier prévoit à cet âge. Ce signalement est l'application d'un barème public à une date : il est identique pour toute personne née le même mois.

Carnet n'examine personne. Il ne connaît ni les antécédents, ni les contre-indications, ni la prématurité, ni les décisions déjà prises par le médecin. Les indications qu'il affiche ne constituent ni un diagnostic, ni une prescription, ni un avis médical, et ne sont destinées à fonder aucune décision de vaccination. Seul le professionnel de santé qui suit la personne peut déterminer ce qui la concerne.

Carnet ne remplace pas le carnet de santé papier, qui reste le document de référence.`

/** Affiché une fois à l'installation, avec validation explicite. */
export const ONBOARDING_DISCLAIMER = {
  title: 'Carnet vous aide à ne rien oublier. Il ne vous conseille pas.',
  body: `À partir de la date de naissance, Carnet applique le calendrier vaccinal officiel et signale ce qu'il prévoit à cet âge. Il ne connaît ni les antécédents, ni les contre-indications, ni la prématurité, ni ce que votre médecin a décidé.`,
  pivot: "Un rendez-vous signalé ici n'est pas un rendez-vous à prendre : c'est une question à poser.",
  footer:
    'La consultation médicale reste indispensable. Carnet ne remplace pas le carnet de santé papier.',
  accept: "J'ai lu et compris ce que Carnet fait, et ce qu'il ne fait pas",
} as const

/**
 * Mention affichée sur CHAQUE bloc de recommandation calculée, au même corps
 * que le texte qu'elle tempère. Elle n'est pas décorative : c'est elle qui
 * qualifie la nature de l'indication. Ne pas la réduire ni la replier.
 */
export function computedNotice(firstName: string): string {
  return `Calculé à partir du calendrier officiel et de la date de naissance saisie. Carnet ne connaît pas la situation médicale de ${firstName} : seul son médecin peut confirmer que ce rendez-vous la ou le concerne.`
}

/** Tampon de traçabilité : quelle version du barème, appliquée quand. */
export function referentialStamp(scheduleLabel: string, appliedOn: string): string {
  return `${scheduleLabel} · appliqué le ${appliedOn}`
}

/** Mentions par écran, au plus près de ce qu'elles qualifient. */
export const SCREEN_NOTICES = {
  vaccines: 'Votre médecin adapte ce calendrier à votre enfant.',
  growth: "Courbes de référence OMS 0–5 ans. La position d'un point ne s'interprète pas seule.",
  catchUp: 'Tableau du calendrier officiel. À discuter avec votre médecin.',
  reminders: 'Ces rappels viennent du calendrier officiel, pas de votre médecin.',
  travel:
    "Vous enregistrez ce qui a été fait. Carnet ne propose aucun vaccin en fonction du pays de destination.",
  birthDate:
    "C'est la seule donnée dont dépendent toutes les indications de Carnet. Une erreur ici ne se voit pas ensuite.",
} as const

/** Pied de page permanent, présent sur tous les écrans porteurs d'indications. */
export const PERMANENT_FOOTER =
  "Aide au rappel. Carnet applique un calendrier général à une date de naissance : il n'examine personne et ne remplace aucun avis médical."

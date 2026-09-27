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

export const INTENDED_PURPOSE = `Carnet est un aide-mémoire et un outil personnel d'archivage. Il permet à un parent d'enregistrer, de photographier et de retrouver les informations figurant dans le carnet de santé papier, et de conserver la trace des vaccinations déjà faites.

À partir de la seule date de naissance saisie par l'utilisateur, Carnet applique le calendrier vaccinal publié par le ministère de la Santé et affiche les échéances que ce calendrier fait figurer à cet âge. Ce signalement est l'application d'un barème public à une date : il est identique pour toute personne née le même mois.

Carnet n'examine personne. Il ne connaît ni les antécédents, ni les contre-indications, ni la prématurité, ni les décisions déjà prises par le médecin. Les indications qu'il affiche ne constituent ni un diagnostic, ni une prescription, ni un avis médical, et ne sont destinées à fonder aucune décision de vaccination. Seul le professionnel de santé qui suit la personne peut déterminer ce qui la concerne.

Carnet n'a aucune finalité de diagnostic, de prévention, de prédiction, de pronostic, de traitement ou d'atténuation d'une maladie. Il n'est pas un dispositif médical au sens du règlement (UE) 2017/745.

Carnet ne remplace pas le carnet de santé papier, qui reste le document de référence.`

/** Affiché une fois à l'installation, avec validation explicite. */
export const ONBOARDING_DISCLAIMER = {
  title: 'Carnet garde la trace de ce que vous y inscrivez et affiche le calendrier officiel. Il ne vous conseille pas.',
  body: `À partir de la date de naissance, Carnet affiche les échéances que le calendrier vaccinal officiel fait figurer à cet âge. Il ne connaît ni les antécédents, ni les contre-indications, ni la prématurité, ni ce que votre médecin a décidé.`,
  pivot: "Une échéance signalée ici n'est pas un rendez-vous à prendre : c'est une question à poser.",
  footer:
    'La consultation médicale reste indispensable. Carnet ne remplace pas le carnet de santé papier.',
  accept: "J'ai lu et compris ce que Carnet fait, et ce qu'il ne fait pas",
} as const

/**
 * Mention affichée sur CHAQUE bloc de recommandation calculée, au même corps
 * que le texte qu'elle tempère. Elle n'est pas décorative : c'est elle qui
 * qualifie la nature de l'indication. Ne pas la réduire ni la replier.
 */
export function computedNotice(): string {
  return "Calculé à partir du calendrier officiel et de la date de naissance saisie, sans aucune autre donnée. Carnet ne connaît pas la situation médicale de la personne concernée : seul un médecin peut déterminer ce qui la concerne."

}

/** Tampon de traçabilité : quelle version du barème, appliquée quand. */
export function referentialStamp(scheduleLabel: string, appliedOn: string): string {
  return `${scheduleLabel} · appliqué le ${appliedOn}`
}

/** Mentions par écran, au plus près de ce qu'elles qualifient. */
export const SCREEN_NOTICES = {
  vaccines: 'Votre médecin adapte ce calendrier à votre enfant.',
  growth:
    "Les mesures sont tracées telles que vous les saisissez, sans calcul de position ni d'écart. La position d'un point ne s'interprète pas seule.",
  catchUp:
    'Tableau du calendrier officiel. Il ne tient pas compte de ce qui est inscrit dans ce carnet. À discuter avec votre médecin.',
  reminders:
    'Ces alertes reproduisent le calendrier officiel. Elles ne viennent pas de votre médecin et ne valent pas convocation.',
  travel:
    "Vous enregistrez ce qui a été fait. Carnet ne propose aucun vaccin en fonction du pays de destination.",
  birthDate:
    "C'est la seule donnée dont dépendent toutes les indications de Carnet. Une erreur ici ne se voit pas ensuite.",
} as const

/**
 * Avertissements a la creation du coffre.
 *
 * L'architecture est la plus protectrice possible au regard du RGPD et la
 * plus dangereuse possible pour l'utilisateur : personne ne peut rouvrir un
 * carnet dont la phrase secrete est perdue, et le stockage du navigateur est
 * purgeable. Ces deux faits doivent etre dits avant la saisie, pas apres.
 */
export const VAULT_WARNINGS = {
  passphrase:
    "La phrase secrète ne quitte jamais cet appareil et n'est enregistrée nulle part. Si vous la perdez, personne — pas même l'éditeur — ne peut rouvrir ce carnet : son contenu est définitivement perdu. Notez-la ailleurs que sur cet appareil avant de continuer.",
  acknowledge:
    "J'ai noté ma phrase secrète ailleurs que sur cet appareil, et je comprends qu'elle est irrécupérable.",
  storage:
    "Ce carnet vit dans le stockage de ce navigateur. Effacer les données du site, ou une purge automatique du navigateur, le supprime. Exportez une sauvegarde régulièrement et conservez-la hors de cet appareil.",
} as const

/** Ce que Carnet ne fait pas avec les donnees, affirme positivement. */
export const PRIVACY_CLAIM =
  "Aucune donnée de ce carnet ne quitte votre appareil. L'éditeur n'y a pas accès, ne reçoit aucune statistique d'usage, et ne peut pas savoir que vous utilisez Carnet. Il n'y a ni compte, ni serveur, ni sauvegarde en ligne. Carnet est gratuit, sans publicité et sans achat intégré."

/** Le calendrier vaccinal est revise chaque annee. */
export const REFERENTIAL_NOTICE =
  "Le calendrier vaccinal est révisé chaque année. La version utilisée ici est affichée avec sa date. En cas de doute, la version en vigueur est celle que publie le ministère chargé de la santé."

/** Pied de page permanent, présent sur tous les écrans porteurs d'indications. */
export const PERMANENT_FOOTER =
  "Aide-mémoire. Carnet applique un calendrier général à une date de naissance : il n'examine personne et ne remplace aucun avis médical."

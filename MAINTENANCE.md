# Carnet — mémo de maintenance

Ce fichier existe pour une raison précise : je n'ai aucune continuité entre
deux sessions. Ce qui n'est pas écrit ici est perdu. Toute session d'aide
future doit le lire avant de toucher au code.

## La ligne à ne pas franchir

L'application est volontairement tenue **hors du champ du dispositif médical**
(règlement UE 2017/745). Ce n'est pas une précaution de style : c'est ce qui
sépare une app publiable d'une app qui exigerait marquage CE, système qualité,
documentation technique et surveillance après commercialisation.

La frontière tient en une phrase : **aucune donnée saisie par l'utilisateur ne
doit modifier ce que l'application affiche du calendrier officiel.** Le carnet
montre ce qui a été fait. Le calendrier montre ce que le calendrier prévoit.
Les deux ne se parlent jamais.

Interdits, définitivement :

- tout décompte de retard, sous quelque nom que ce soit ;
- tout qualificatif porté sur la personne — « à jour », « en retard »,
  « incomplet », « à risque », « urgent » ;
- toute analyse d'écart entre le calendrier et les vaccins reçus ;
- tout z-score, centile, libellé de position ou zone colorée sur les courbes
  de croissance ;
- toute recommandation vaccinale en fonction d'un pays de destination.

Ces interdits sont **testés**, pas seulement écrits :

| Fichier | Ce qu'il verrouille |
|---|---|
| `src/domain/timeline.test.ts` | aucun décompte de retard ; aucun qualificatif ; deux personnes nées le même mois ont une sortie identique |
| `src/domain/catchup.test.ts` | le tableau de rattrapage ne prend aucune donnée d'enfant en entrée |
| `src/domain/status.test.ts` | la restitution du carnet ne produit aucune date calculée |
| `src/domain/travel.test.ts` | aucune fonction ne prend un pays en entrée ; le module ne contient aucun nom de pays |

**Si l'un de ces tests échoue, ce n'est pas un test cassé : c'est la position
juridique de l'application qui a bougé.** Ne le neutralise jamais pour faire
passer une fonctionnalité. Remonte le problème.

La destination revendiquée et toutes les mentions vivent dans `src/ui/legal.ts`.
Elles doivent rester vraies : un texte contredit par le comportement du produit
n'est pas un bouclier, c'est une pièce à charge.

## Le référentiel

`src/data/schedules/fr-2025.json` est la seule source de vérité du calendrier.
Il porte `publishedAt`, `checkedAt` et `sourceUrl`, affichés à l'écran avec le
résultat.

Règle : **le référentiel se transcrit, jamais ne se reformule.** Toute
divergence entre le JSON et la publication du ministère est un bug, pas une
interprétation. Le scénario de sinistre réaliste de cette app n'est pas « elle
a mal conseillé » — les mentions et le médecin brisent le lien de causalité —
c'est « elle a restitué faussement un texte public ». Aucune mention ne couvre
ça.

Aucun contenu médical ne s'écrit de mémoire. Il se vérifie contre ce fichier.
Cette règle a déjà rattrapé deux erreurs : un « DTP dose 4 » inventé à 16-18
mois (il est à 6 ans), et des tranches d'âge de rattrapage fabriquées.

Une veille mensuelle automatique est en place (tâche planifiée « Carnet — veille
calendrier vaccinal »). Elle observe et signale, elle ne modifie rien.

## Décisions arrêtées le 27/09/2026

- **Les courbes restent celles de l'OMS.** La bascule vers les courbes
  françaises AFPA/CRESS/Inserm a été étudiée puis abandonnée : le CRESS ne
  publie **aucune licence, aucune condition de réutilisation, aucun format de
  citation** pour ces courbes. Basculer, c'était remplacer un risque documenté
  (clause non commerciale de l'OMS, écrite et connue) par un risque non
  documenté. Une demande d'autorisation est adressée à l'OMS ; si elle est
  refusée, la fonction croissance sera retirée ou l'app dépubliée. Posture
  assumée pour un projet de portefeuille : on ne touche à rien, on demande, et
  on retire si besoin.
- **Catégorie App Store : « Utilitaires ».** Choisir « Médecine » serait signer
  soi-même une déclaration de finalité médicale. « Forme et santé » est
  défendable mais moins bon.
- **Les notifications ne portent QUE les aide-mémoire créés par le parent.**
  `syncReminders` ne reçoit que des `ParentReminder` ; les échéances calculées
  par `timeline.ts` ne sont jamais poussées. C'est déterminant : une
  notification poussée à une date d'échéance serait un acte d'incitation à un
  acte de prévention. **Ne jamais brancher `calendarReminders` sur les
  notifications natives.**
- **Aucun achat intégré, et le code qui en portait un a été supprimé.** Un
  paywall « Carnet Pro — 4,99 € » verrouillait les courbes de croissance, le
  partage co-parent, le multi-enfants et le partage du récapitulatif. Il
  contredisait la décision du 26/09, la fiche App Store qui affirme l'absence
  d'achat intégré, et il faisait payer l'accès aux courbes de l'OMS —
  précisément ce que leur clause non commerciale interdit. `src/pro/` est
  supprimé. Ne pas le réintroduire sans rouvrir ces trois points.
- **La liste des sept vaccins de voyage est une sélection éditoriale**, pas la
  reproduction d'une recommandation officielle. L'écran le dit désormais.
  Toute modification de cette liste engage l'éditeur.

## Questions ouvertes, à régler avant publication

1. **Licence des courbes de croissance de l'OMS — demande en cours.** Elles
   arrivent par le paquet npm `who-growth-standards`, sous licence MIT — mais
   son propre fichier `NOTICE` précise que « the underlying reference data
   remains the work of the WHO ». La MIT ne couvre que le code du paquet : un
   tiers ne peut pas céder des droits qu'il ne détient pas. Demande
   d'autorisation adressée à l'OMS ; brouillon dans
   `~/Developer/_docs/carnet/carnet-demande-oms.md`. **Envoyer la demande AVANT de publier** :
   publier avec une demande en cours est défendable, publier et attendre de se
   faire prendre ne l'est pas.
2. **Relecture de `src/ui/legal.ts`** par un avocat en droit des dispositifs
   médicaux — pas un généraliste.
3. **Guideline Apple 5.1.3 (ii)** : interdit de stocker des données de santé
   dans iCloud. Une base IndexedDB peut être embarquée par défaut dans la
   sauvegarde iCloud : à exclure explicitement avant soumission.
4. **Catégorie App Store : « Forme et santé »**, pas « Médecine ». Tenir ce
   parti jusque dans les captures et la description — c'est là que les rejets
   se déclenchent.

## Pièges de l'environnement

- **`git` sur le dossier monté** : les fichiers `.git/*.lock` ne peuvent pas
  être supprimés. Les renommer avant toute opération :
  `for f in .git/index.lock .git/HEAD.lock; do [ -e "$f" ] && mv "$f" "$f.$RANDOM"; done`
- **`npm run build`** échoue si `dist/` existe déjà, pour la même raison.
  `mv dist dist-old-$RANDOM` avant de construire.
- **Le push** utilise une clé de déploiement, déjà configurée dans
  `core.sshCommand` (`/Users/kanja/Developer/.cles/carnet-deploy-key`).
- **`tsc --noEmit` ne vérifie rien** à la racine d'un projet à références :
  toujours `tsc -b`. Une vraie erreur de type est déjà passée en production
  à cause de ça.

## Positionnement, pour ne pas le réinventer

Benchmark du 26/09/2026, dans `~/Developer/_docs/carnet/carnet-benchmark-2026-09-26.md`.

Mon espace santé couvre déjà le carnet vaccinal, les courbes, les rappels,
l'export PDF crèche/école/voyage et le partage entre parents séparés, avec un
profil créé automatiquement à la naissance. Carnet ne gagne pas ce combat de
front et n'essaie pas : c'est une **archive de santé hors-cloud**, gratuite,
sans compte, sans serveur, sans publicité. Rien ne sort de l'appareil — c'est
le seul argument qui reste, et toute dépendance extérieure ajoutée le détruit.

Décidé le 26/09/2026 : **gratuite, sans publicité, sans achat intégré.**
Un SDK publicitaire dans une app de santé enfant détruirait cet argument,
rendrait Alexandre responsable de traitement au sens du RGPD, et rapporterait
quelques euros par an. La question a été posée et tranchée ; ne la rouvre pas
sans raison nouvelle.

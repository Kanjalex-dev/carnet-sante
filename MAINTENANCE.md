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

## Questions ouvertes, à régler avant publication

1. **Licence des courbes de croissance de l'OMS.** Elles arrivent par le paquet
   npm `who-growth-standards`, sous licence MIT — mais son propre fichier
   `NOTICE` précise que « the underlying reference data remains the work of the
   WHO ». La MIT ne couvre que le code du paquet : un tiers ne peut pas céder
   des droits qu'il ne détient pas. La politique de l'OMS applique par défaut
   une clause **non commerciale**, qui vise probablement aussi une app gratuite
   éditée par une société. À trancher par une demande d'autorisation écrite, ou
   en basculant sur les courbes françaises AFPA/CRESS/Inserm.
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
  `core.sshCommand` (`/Users/kanja/Sites/.carnet-deploy-key`).
- **`tsc --noEmit` ne vérifie rien** à la racine d'un projet à références :
  toujours `tsc -b`. Une vraie erreur de type est déjà passée en production
  à cause de ça.

## Positionnement, pour ne pas le réinventer

Benchmark du 26/09/2026, dans `~/Sites/carnet-benchmark-2026-09-26.md`.

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

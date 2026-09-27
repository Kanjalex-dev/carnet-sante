# Portage iOS — ce qui est fait, ce qui reste

Le projet Capacitor existe déjà (`ios/App`). Il n'y a pas d'app à écrire : il y
a une chaîne de publication à monter. Ce fichier est la liste exacte.

## Fait dans le dépôt

- **Exclusion de la sauvegarde iCloud** (`AppDelegate.swift`). La guideline
  App Store **5.1.3 (ii)** interdit de stocker des données de santé
  personnelles dans iCloud. Sans cette exclusion, IndexedDB — donc tout le
  carnet — part dans la sauvegarde iCloud de l'appareil par défaut. Cela
  contredit à la fois la guideline et la promesse faite à l'utilisateur.
  L'exclusion porte sur `Library/WebKit` et `Library/Application Support`, et
  s'applique **à chaque lancement** : iOS recrée ces dossiers et l'attribut se
  perd à la recréation.
  **Ce code n'a jamais été compilé** — il a été écrit sans Xcode. À vérifier au
  premier build.
- **`CFBundleDevelopmentRegion` passé de `en` à `fr`.**
- Les quatre chaînes de permission de l'`Info.plist` (caméra, photothèque,
  ajout photo, Face ID) sont rédigées et disent ce que l'app fait vraiment.

## À faire sur le Mac, dans cet ordre

Le sync et le build ne peuvent pas tourner depuis mon environnement : c'est une
VM Linux sans Xcode, et la suppression de fichiers y est interdite, ce qui fait
échouer `cap sync` à chaque tentative.

```
cd ~/Sites/carnet-app
rm -rf dist-old-* ios/cordova-old-* ios/App/App/public-old-* ios/App/App/*.old-*
npm run build
npx cap sync ios
npx cap open ios
```

Les `*-old-*` sont des dossiers que j'ai dû renommer au lieu de supprimer. Ils
ne servent à rien et ne sont pas suivis par git.

Dans Xcode :

1. **Signing & Capabilities** → équipe IE Digital, bundle `com.iedigital.carnet`.
2. **Icône.** Il n'y a qu'un `AppIcon-512@2x.png`. Vérifier qu'il couvre toutes
   les tailles requises, sinon la soumission est rejetée.
3. **Build sur appareil réel**, pas seulement simulateur. À tester en
   particulier : clavier qui masque les champs de saisie, zones sûres en haut
   et en bas, retour arrière, appareil photo, Face ID, notifications locales.
4. **Vérifier l'exclusion iCloud** : lancer l'app, saisir une vaccination, puis
   Réglages → iCloud → Sauvegardes → gérer le stockage, et confirmer que Carnet
   ne pèse rien ou presque.
5. Archive → App Store Connect.

## Fiche App Store — règles à tenir

La destination revendiquée s'apprécie sur **tout le matériel promotionnel**,
pas seulement sur les écrans. Une fiche mal écrite annule les seize textes de
`legal.ts`.

- **Catégorie : « Utilitaires ».** Choisir « Médecine » revient à signer
  soi-même une déclaration de finalité médicale.
- **Champ App Privacy : « Data Not Collected »**, strictement cohérent avec
  l'architecture.
- **Ne joindre aucun document d'autorisation réglementaire** et ne cocher
  aucune case déclarant une application médicale.
- **Verbes interdits** dans le titre, le sous-titre, la description et les
  mots-clés : surveiller, contrôler, dépister, détecter, évaluer, prévenir,
  protéger, vérifier que, s'assurer que, suivre (au sens de surveiller).
- **Verbes admis** : enregistrer, photographier, archiver, retrouver,
  consulter, afficher, noter, exporter.
- **Captures** : aucune ne doit montrer un compteur de manques, un badge rouge,
  une pastille ou un point d'exclamation. Le texte incrusté sur une capture est
  une revendication au même titre que la description.
- **Mots-clés** : « vaccination », « carnet de santé » passent. « rappel
  vaccinal », « immunité », « protection », « suivi médical », « à jour » sont
  à exclure.
- Reprendre dans la description une phrase invitant à consulter un médecin
  (guideline 1.4.1 l'exige).

Formulations à proscrire, et leur remplacement :

| À proscrire | Remplacement |
|---|---|
| « Ne manquez plus aucun vaccin. » | « Retrouvez ce que vous avez inscrit, quand vous en avez besoin. » |
| « Vérifiez que votre enfant est à jour. » | « Consultez le calendrier officiel et ce que vous avez inscrit. » |
| « Carnet vous alerte quand un vaccin est dû. » | « Carnet affiche les échéances que le calendrier officiel fait figurer à cet âge. » |
| « Protégez votre enfant. » | À supprimer sans remplacement. |

Titre et sous-titre proposés : **« Carnet — carnet de santé de l'enfant »** /
**« Archiver, retrouver, se souvenir »**.

## Préalables à la soumission

1. **Autorisation OMS** sur les courbes de croissance (brouillon dans
   `~/Sites/carnet-demande-oms.md`). À envoyer avant publication.
2. **Contreseing d'un avocat** en dispositifs médicaux sur `legal.ts` et le
   dossier de non-qualification.
3. **Assurance RC produits** avec extension dommages immatériels non
   consécutifs, base réclamation, reprise du passé — souscrite **avant** la
   mise en ligne. Sans reprise du passé, souscrire après laisse un trou
   définitif.

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

Le sync est **déjà fait et propre** dans le dépôt : les assets embarqués dans
`ios/App/App/public` sont identiques au dernier build. Il reste à compiler.

```
cd ~/Sites/carnet-app
npx cap open ios
```

Si tu as modifié le code web entre-temps : `npm run build && npx cap sync ios`
d'abord.

Dans Xcode :

1. **Signing & Capabilities** → équipe IE Digital, bundle `com.iedigital.carnet`.
2. **Icône : rien à faire.** Le `Contents.json` utilise le format d'icône
   unique d'Xcode 14+ — un seul PNG 1024×1024 « universal », à partir duquel
   Xcode génère toutes les tailles. Vérifié.
3. **Build sur appareil réel**, pas seulement simulateur. À tester en
   particulier : clavier qui masque les champs de saisie, zones sûres en haut
   et en bas, retour arrière, appareil photo, Face ID, notifications locales.
4. **Vérifier l'exclusion iCloud** : lancer l'app, saisir une vaccination, puis
   Réglages → iCloud → Sauvegardes → gérer le stockage, et confirmer que Carnet
   ne pèse rien ou presque.
5. Archive → App Store Connect.

## Manifeste de confidentialité

`ios/App/App/PrivacyInfo.xcprivacy` est créé. Il déclare : aucun suivi, aucune
donnée collectée, et deux API à raison obligatoire (horodatage de fichiers,
UserDefaults de l'app). **À vérifier au premier envoi vers App Store Connect** :
Apple signale à l'upload toute API utilisée et non déclarée. Ne jamais déclarer
une catégorie « au cas où » — une déclaration inexacte est un motif de rejet au
même titre qu'une déclaration manquante.

**Le fichier doit être ajouté à la cible dans Xcode** (Build Phases → Copy
Bundle Resources) s'il n'y apparaît pas automatiquement après `cap sync`.

## Fiche App Store

Les textes prêts à coller — nom, sous-titre, description, mots-clés, réponses
au questionnaire de confidentialité, notes pour l'examinateur — sont dans
**`APPSTORE.md`**.

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

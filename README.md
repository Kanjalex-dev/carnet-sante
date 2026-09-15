# Carnet

Suivi vaccinal et de croissance d'un enfant, de la naissance à l'âge adulte.
Application web autonome, déployable sur GitHub Pages.

## Ce que fait l'application

- Calcule l'état vaccinal à partir du calendrier français, **résolu selon la date de naissance de l'enfant** (3 valences obligatoires avant 2018, 11 après, 13 depuis 2025).
- Regroupe les doses par rendez-vous : une injection couvre plusieurs valences.
- Distingue trois états : à faire, fait mais non vérifié, fait et vérifié.
- Propose un schéma de rattrapage en cas de retard, à faire confirmer par un médecin.
- Conserve les photographies des pages du carnet papier, débarrassées de leurs métadonnées EXIF.
- Chiffre l'ensemble des données sur l'appareil derrière une phrase secrète.
- Produit un récapitulatif PDF avec les photographies en pages de preuve et un cartouche à faire contresigner.
- Lit une page de carnet photographiée, localement, et propose les vaccinations trouvées — sans jamais rien enregistrer sans validation.
- Place le poids, la taille et le périmètre crânien sur les courbes de référence de l'OMS, calculées sur l'appareil.
- Fusionne deux carnets tenus séparément par deux parents, à partir d'un fichier chiffré, avec un aperçu ligne par ligne avant toute écriture.
- N'affiche aucun acronyme médical : chaque vaccin porte son nom courant, et un appui ouvre une fiche expliquant contre quoi il protège. Le même geste explique les chiffres affichés.

## Ce qu'elle ne fait pas

- Elle ne donne **aucun conseil médical** et ne remplace ni le carnet officiel ni un professionnel de santé.
- Elle ne produit **aucun certificat**. Le récapitulatif PDF n'a de valeur qu'une fois contresigné par un professionnel.
- Elle n'envoie rien : aucun serveur, aucune analytique, aucune police distante.

## Où vivent les données

Dans le navigateur de l'appareil (IndexedDB), et nulle part ailleurs. Le dépôt
ne contient que du code et des données de référence publiques ; un contrôle
d'intégration continue rejette tout export de carnet committé par erreur.

## Développement

```bash
npm install
npm run dev      # serveur local
npm test         # suite de tests du domaine
npm run build    # production dans dist/
```

## Déploiement

Pousser sur `main` déclenche le workflow `.github/workflows/deploy.yml` :
vérification des types, tests, contrôle anti-fuite, build, publication sur
GitHub Pages. Activer Pages sur le dépôt avec la source « GitHub Actions ».

`base` est réglé sur `./` : l'application fonctionne à la racine d'un domaine
comme sous `/<nom-du-depot>/`, sans configuration.

## État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 0 | Squelette, CI, déploiement Pages | fait |
| 2 | Référentiel fr-2025, moteur de statut, rattrapage, LMS | fait, 32 tests |
| 3 | Persistance IndexedDB, chiffrement AES-GCM, effacement | fait, 8 tests |
| 4 | Onboarding, écran Statut, saisie de dose, réglages | fait |
| 5 | Photographies, lecture OCR locale et écran de validation | fait, 27 tests sur l'analyse |
| 6 | Récapitulatif PDF avec pages de preuve | fait — export .ics à faire |
| 7 | Courbes de croissance (tables OMS embarquées) | fait, 14 tests |
| 8 | Fusion co-parent : export chiffré, aperçu, arbitrage | fait, 27 tests — multi-enfants à faire |
| 9 | Durcissement, PWA, polices embarquées | à faire |

Revue de mise en page effectuée à 320 px et 390 px : aucun débordement horizontal
sur les trois onglets, y compris avec un prénom long et des valeurs saisies sans
espace.

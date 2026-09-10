# Carnet

Suivi vaccinal et de croissance d'un enfant, de la naissance à l'âge adulte.
Application web autonome, déployable sur GitHub Pages.

## Ce que fait l'application

- Calcule l'état vaccinal à partir du calendrier français, **résolu selon la date de naissance de l'enfant** (3 valences obligatoires avant 2018, 11 après, 13 depuis 2025).
- Regroupe les doses par rendez-vous : une injection couvre plusieurs valences.
- Distingue trois états : à faire, fait mais non vérifié, fait et vérifié.
- Propose un schéma de rattrapage en cas de retard, à faire confirmer par un médecin.

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
| 3 | Persistance IndexedDB | partiel — chiffrement à faire |
| 4 | Onboarding, écran Statut, saisie de dose | fait |
| 5 | Import photo et OCR | à faire |
| 6 | Récapitulatif PDF et export .ics | à faire |
| 7 | Courbes de croissance | math faite, tables OMS à embarquer |
| 8 | Multi-enfants et fusion co-parent | à faire |
| 9 | Durcissement, PWA, polices embarquées | à faire |

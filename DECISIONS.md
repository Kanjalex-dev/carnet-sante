# Journal des arbitrages

## `base: './'` plutôt qu'un chemin de dépôt en dur
Décision : chemins relatifs, pas de routeur.
Raison : l'application fonctionne à n'importe quelle profondeur d'URL et ne peut pas renvoyer un 404 au rafraîchissement.
Alternative écartée : `base: '/<repo>/'` avec react-router, qui casse au moindre renommage du dépôt et ajoute une dépendance à maintenir sur 15 ans.

## Dates civiles en chaînes, arithmétique en jours juliens
Décision : aucune date de santé ne passe par un objet `Date` ni par UTC.
Raison : `new Date('2025-07-12').toISOString()` décale d'un jour à l'ouest de Greenwich et fausse toutes les échéances.
Alternative écartée : `date-fns` sur des objets `Date`, qui rend le piège possible à chaque appel.

## « Due » et « en retard » sont deux états distincts
Décision : `due` = date cible dépassée mais fenêtre encore ouverte ; `late` = fenêtre dépassée.
Raison : la fenêtre est la vérité médicale ; annoncer « en retard » dès la date cible produirait des alertes fausses.
Alternative écartée : un seul état « en retard » à partir de la date cible.

## Regroupement par rendez-vous plutôt que par valence
Décision : l'écran Statut présente une carte par rendez-vous, listant les valences concernées.
Raison : la première version affichait 21 cartes pour un carnet vide — illisible, et sans rapport avec le geste réel, une injection couvrant plusieurs valences.
Alternative écartée : une carte par dose, fidèle au modèle de données mais pas à l'usage.

## Aucune police distante
Décision : piles système en repli, fichiers woff2 à embarquer dans le dépôt.
Raison : une requête vers Google Fonts transmet l'adresse IP de chaque utilisateur d'une application de santé à un tiers.
Alternative écartée : `<link>` vers fonts.googleapis.com, plus simple mais incompatible avec la promesse faite dans PRIVACY.md.
Reste à faire : télécharger Newsreader et Public Sans en woff2 et les servir depuis `public/`.

## Méningocoque B : schéma 3-5-12
Décision : retenir le schéma de Vaccination Info Service.
Raison : source professionnelle de Santé publique France, plus autoritative que la presse santé.
Alternative écartée : 2-4-12, présenté par d'autres sources. Divergence documentée dans `docs/DATA-SOURCES.md` — **à trancher avec un professionnel**.

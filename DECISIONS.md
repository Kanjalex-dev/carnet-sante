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

## Modèle « coffre » plutôt que chiffrement champ par champ
Décision : tout le jeu de données est sérialisé et chiffré comme un seul enregistrement ; les photographies sont chiffrées une par une, à part.
Raison : aucune donnée de santé ne peut alors subsister en clair dans un index IndexedDB, et le code de déchiffrement tient en un endroit vérifiable.
Alternative écartée : chiffrer chaque champ sensible en gardant les index en clair — plus rapide à grande échelle, mais l'index trahit déjà les dates et les identifiants. Le modèle coffre ne tient pas sur des milliers d'enregistrements ; ce n'est pas l'usage ici.

## Les photographies sont réencodées, jamais stockées telles quelles
Décision : passage systématique par un canvas, réencodage JPEG, 2000 px de côté maximum.
Raison : une photo de téléphone embarque les coordonnées GPS du lieu de prise de vue dans ses métadonnées EXIF. Le réencodage les supprime intégralement. Effet secondaire utile : 182 ko au lieu de plusieurs mégaoctets.
Alternative écartée : stocker le fichier d'origine et masquer l'EXIF à l'affichage — la donnée resterait présente dans l'export.

## Une sortie de secours en cas de phrase perdue
Décision : l'écran de déverrouillage permet d'effacer définitivement toutes les données, après saisie du mot EFFACER.
Raison : sans elle, un utilisateur qui oublie sa phrase se retrouve devant une application qu'il ne peut ni ouvrir ni réinitialiser. Une impasse est un défaut, pas une mesure de sécurité.
Alternative écartée : une question de secours ou une clé de récupération — les deux affaiblissent le chiffrement au profit d'un confort marginal.

## Le PDF n'est jamais appelé « certificat »
Décision : le document s'intitule « Récapitulatif vaccinal », porte un cartouche de contresignature et une mention de pied de page indiquant qu'il ne fait foi qu'une fois signé. Ni le cartouche ni la mention ne sont désactivables.
Raison : un document produit par une application personnelle n'a aucune valeur opposable. Le présenter autrement créerait un faux sentiment de conformité vis-à-vis d'une crèche ou d'une école.
Alternative écartée : un document d'allure officielle sans réserve — plus « rassurant », et trompeur.

## Les photographies sont jointes en pages de preuve
Décision : chaque page du carnet photographiée devient une page pleine du PDF, après le récapitulatif.
Raison : c'est la photo du carnet papier qui fait preuve, pas notre retranscription. Le destinataire voit la source.
Alternative écartée : un tableau seul — plus court, mais invérifiable par celui qui le reçoit.

## Le PDF affiche les libellés, jamais les codes internes
Décision : les valences sont converties en libellés lisibles depuis le référentiel avant impression.
Raison : un document lu par un médecin ne doit pas porter « MenB » ou « Coq ». Défaut détecté en relisant le PDF généré, pas en lisant le code.

## L'onglet Carnet porte l'historique, pas seulement les photos
Décision : les vaccinations enregistrées sont listées, corrigeables et supprimables.
Raison : une dose marquée faite disparaissait de l'écran Statut sans réapparaître ailleurs — impossible de la relire ou de corriger une erreur de saisie. Un enregistrement qu'on ne peut pas relire n'est pas un carnet.

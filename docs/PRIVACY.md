# Confidentialité

## Ce qui est stocké, et où

Toutes les données — enfants, vaccinations, mesures, photographies — sont
écrites dans **IndexedDB, dans le navigateur de l'appareil**. Il n'existe aucun
serveur applicatif, aucun compte, aucune synchronisation automatique.

## Ce qui sort de l'appareil

Rien, dans le fonctionnement nominal :

- aucune analytique, aucune télémétrie, aucun traceur ;
- aucune police, feuille de style ou script chargés depuis un tiers à l'exécution ;
- aucun envoi automatique d'e-mail.

Une seule sortie réseau est prévue, et elle reste optionnelle : la **lecture
d'une photo par une API de vision distante**, si et seulement si l'utilisateur a
saisi sa propre clé d'API et confirmé un écran de consentement nommant le
destinataire. Par défaut, la reconnaissance se fait localement.

## Chiffrement

Implémenté, activable depuis les réglages.

- Dérivation de clé : `PBKDF2`, 310 000 itérations, SHA-256, sel aléatoire de 16 octets.
- Chiffrement : `AES-GCM` 256 bits, vecteur d'initialisation aléatoire à chaque écriture. AES-GCM est authentifié : une altération du chiffré est détectée, pas silencieusement acceptée.
- **La phrase secrète n'est jamais persistée**, ni en clair ni sous forme d'empreinte. La vérification passe par un témoin chiffré : si la clé dérivée le déchiffre, la phrase est la bonne.
- Modèle « coffre » : l'ensemble des données est sérialisé puis chiffré comme un seul enregistrement, et chaque photographie est chiffrée séparément. Rien de sensible ne subsiste dans un index IndexedDB.

Tant que le chiffrement n'est pas activé, les données sont en clair dans
IndexedDB — lisibles par toute personne ayant accès au navigateur déverrouillé.
Les réglages le disent explicitement.

### Phrase perdue

Il n'existe aucune récupération : c'est la contrepartie d'un chiffrement qui
protège réellement. L'écran de déverrouillage propose la seule issue possible —
effacer l'intégralité des données de l'appareil et repartir du carnet papier.

## Photographies

- Le fichier d'origine n'est **jamais** stocké. L'image est redessinée dans un canvas puis réencodée en JPEG, ce qui **supprime toutes les métadonnées EXIF**, dont les coordonnées GPS du lieu de prise de vue.
- Redimensionnement à 2000 px de côté maximum : une page de carnet reste lisible, et le stockage du navigateur ne sature pas.
- Aucune photo n'est envoyée nulle part. Aucune analyse automatique n'est faite à ce stade.

## Partage

Les exports `.carnet` contiennent des données de santé d'un mineur. Ils ne
doivent transiter que par un canal de confiance. Le dépôt Git n'en est pas un :
`.gitignore` et un contrôle d'intégration continue empêchent leur commit.

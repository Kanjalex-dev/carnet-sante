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

À implémenter (phase 3) : dérivation `PBKDF2` (≥ 310 000 itérations, SHA-256,
sel aléatoire) puis `AES-GCM` 256 bits, phrase secrète jamais persistée. Tant
que cette phase n'est pas faite, **les données sont en clair dans IndexedDB** —
lisibles par toute personne ayant accès au navigateur déverrouillé.

## Partage

Les exports `.carnet` contiennent des données de santé d'un mineur. Ils ne
doivent transiter que par un canal de confiance. Le dépôt Git n'en est pas un :
`.gitignore` et un contrôle d'intégration continue empêchent leur commit.

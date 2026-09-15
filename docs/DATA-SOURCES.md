# Sources des données de référence

## Calendrier vaccinal — `src/data/schedules/fr-2025.json`

- **Source** : Vaccination Info Service (Santé publique France), calendrier des vaccinations.
- **Version** : `fr-2025`, publiée au 1er janvier 2025.
- **Dernière vérification** : 11 septembre 2026.

### Méningocoque B — schéma retenu

Une divergence entre sources a été tranchée sur le calendrier du ministère de
la Santé : **3 doses — 3 mois, 5 mois, rappel à 12 mois** (Bexsero). Le champ
`warning` du fichier a été retiré en conséquence.

Quatre schémas de rattrapage sont également codés, avec leurs bornes d'âge et
leurs intervalles minimaux :

| Âge au début du rattrapage | Schéma |
|---|---|
| 6 à 11 mois | 2 doses espacées d'au moins 2 mois + rappel au cours de la 2ᵉ année |
| 12 à 23 mois | 2 doses espacées d'au moins 2 mois + rappel 12 à 23 mois après |
| 2 à 4 ans révolus | 2 doses espacées d'au moins 1 mois — obligatoire avant le 5ᵉ anniversaire |
| 15 à 24 ans révolus | 2 doses espacées d'au moins 1 mois — recommandé, non obligatoire |

Ces règles vivent dans le référentiel (`catchUp`), jamais dans le code : le
moteur de rattrapage les applique sans en connaître le contenu.

### Cohortes

L'obligation dépend de la date de naissance, jamais de la date du jour :

| Né à partir du | Valences obligatoires |
|---|---|
| avant 2018-01-01 | DTP seul |
| 2018-01-01 | + Coqueluche, Hib, Hépatite B, Pneumocoque, ROR, Méningocoque C |
| 2025-01-01 | Méningocoque ACWY remplace le C, + Méningocoque B |

## Noms commerciaux — `src/data/products-fr.json`

Liste des vaccins couramment inscrits dans les carnets français, avec les valences
correspondantes. Elle sert **uniquement** à proposer une lecture : la mention portée
par le professionnel de santé fait foi, et toute proposition doit être validée à
l'écran avant d'être enregistrée.

À revoir en même temps que le calendrier : les noms commerciaux changent, des
produits sortent, d'autres arrivent.

## Croissance

Les formules LMS sont implémentées dans `src/domain/growth.ts`. **Les tables de
coefficients L, M et S de l'OMS ne sont pas encore embarquées** : aucune courbe
ne peut être affichée tant qu'elles ne le sont pas.

## Procédure de mise à jour annuelle

1. Relire le calendrier officiel publié en début d'année.
2. Créer un nouveau fichier `fr-<année>.json` plutôt que modifier l'ancien — les enfants déjà suivis doivent conserver le référentiel de leur cohorte.
3. Mettre à jour `checkedAt` et ce document.
4. Ajouter un test de cohorte pour toute nouvelle bascule d'obligation.


## Courbes de croissance — tables OMS

- **Source** : WHO Child Growth Standards, tables LMS étendues, via le paquet
  `who-growth-standards` (MIT) qui les embarque telles quelles.
- **Portée** : 0 à 5 ans (1856 jours). Au-delà, les mesures sont conservées mais
  ne sont plus placées sur la courbe — une autre référence s'applique.
- Le calcul se fait sur l'appareil. Aucune mesure d'enfant ne sort du navigateur.
- L'application **situe**, elle n'interprète pas : un enfant durablement au 10ᵉ
  centile peut se porter parfaitement bien. Ce jugement appartient au médecin.
- Vérifié contre quatre valeurs publiées avant d'être retenu (poids médian fille
  3,2 kg à la naissance et 8,9 kg à 12 mois ; taille 74,0 cm à 12 mois ;
  périmètre crânien garçon 46,1 cm à 12 mois).

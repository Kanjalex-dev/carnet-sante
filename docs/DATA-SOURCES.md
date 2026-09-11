# Sources des données de référence

## Calendrier vaccinal — `src/data/schedules/fr-2025.json`

- **Source** : Vaccination Info Service (Santé publique France), calendrier des vaccinations.
- **Version** : `fr-2025`, publiée au 1er janvier 2025.
- **Dernière vérification** : 10 septembre 2026.

### Point à confirmer avant tout usage réel

Deux sources consultées présentent des schémas différents pour le
**méningocoque B** :

| Source | Schéma retenu |
|---|---|
| Vaccination Info Service (retenu ici) | 3 mois, 5 mois, rappel 12 mois |
| Presse santé / groupes de cliniques | 2 mois, 4 mois, rappel 12 mois |

Le fichier JSON retient le premier et porte un champ `warning`. **Ce point doit
être tranché avec un professionnel de santé ou le calendrier officiel du
ministère avant que l'application ne soit utilisée pour de vrai.**

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

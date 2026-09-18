/**
 * Plan de categories par defaut et regles de depart.
 *
 * Le jeu de regles couvre les enseignes les plus courantes en France. Il n'a pas
 * vocation a etre exhaustif : chaque recategorisation manuelle cree une regle
 * apprise, et le systeme se specialise sur les depenses reelles de son
 * utilisateur en quelques semaines.
 */

import type { CategoryKind } from '@prisma/client';

export interface SeedCategory {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  children?: { name: string; icon?: string }[];
}

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  {
    name: 'Alimentation',
    kind: 'EXPENSE',
    icon: '🛒',
    color: '#4f9d69',
    children: [
      { name: 'Courses', icon: '🛒' },
      { name: 'Restaurants', icon: '🍽️' },
      { name: 'Cafes et bars', icon: '☕' },
      { name: 'Livraison', icon: '🛵' },
    ],
  },
  {
    name: 'Logement',
    kind: 'EXPENSE',
    icon: '🏠',
    color: '#3d7ea6',
    children: [
      { name: 'Loyer ou credit', icon: '🏠' },
      { name: 'Charges et copropriete', icon: '🧾' },
      { name: 'Electricite et gaz', icon: '⚡' },
      { name: 'Eau', icon: '💧' },
      { name: 'Internet et telephone', icon: '📶' },
      { name: 'Travaux et entretien', icon: '🔧' },
    ],
  },
  {
    name: 'Transport',
    kind: 'EXPENSE',
    icon: '🚗',
    color: '#c98b3a',
    children: [
      { name: 'Carburant', icon: '⛽' },
      { name: 'Transports en commun', icon: '🚆' },
      { name: 'Peage et stationnement', icon: '🅿️' },
      { name: 'Entretien vehicule', icon: '🔩' },
      { name: 'Location et LLD', icon: '🚙' },
      { name: 'Taxi et VTC', icon: '🚕' },
    ],
  },
  {
    name: 'Sante',
    kind: 'EXPENSE',
    icon: '🩺',
    color: '#b8566b',
    children: [
      { name: 'Pharmacie', icon: '💊' },
      { name: 'Consultations', icon: '🩺' },
      { name: 'Mutuelle', icon: '🛡️' },
      { name: 'Optique et dentaire', icon: '👓' },
    ],
  },
  {
    name: 'Loisirs',
    kind: 'EXPENSE',
    icon: '🎬',
    color: '#7a5ea8',
    children: [
      { name: 'Abonnements medias', icon: '📺' },
      { name: 'Sport', icon: '🏋️' },
      { name: 'Sorties et culture', icon: '🎭' },
      { name: 'Voyages', icon: '✈️' },
      { name: 'Jeux et applications', icon: '🎮' },
    ],
  },
  {
    name: 'Achats',
    kind: 'EXPENSE',
    icon: '🛍️',
    color: '#c96a8b',
    children: [
      { name: 'Vetements', icon: '👕' },
      { name: 'Equipement maison', icon: '🛋️' },
      { name: 'High-tech', icon: '💻' },
      { name: 'Cadeaux', icon: '🎁' },
    ],
  },
  {
    name: 'Assurances et frais',
    kind: 'EXPENSE',
    icon: '🛡️',
    color: '#6b7280',
    children: [
      { name: 'Assurance habitation', icon: '🏠' },
      { name: 'Assurance auto', icon: '🚗' },
      { name: 'Frais bancaires', icon: '🏦' },
      { name: 'Autres assurances', icon: '🛡️' },
    ],
  },
  {
    name: 'Impots et taxes',
    kind: 'EXPENSE',
    icon: '🏛️',
    color: '#8a7a5c',
    children: [
      { name: 'Impot sur le revenu', icon: '🏛️' },
      { name: 'Taxe fonciere', icon: '🏡' },
      { name: 'Autres taxes', icon: '📋' },
    ],
  },
  {
    name: 'Famille',
    kind: 'EXPENSE',
    icon: '👨‍👩‍👧',
    color: '#5b9aa0',
    children: [
      { name: 'Enfants', icon: '🧒' },
      { name: 'Garde et scolarite', icon: '🎒' },
      { name: 'Animaux', icon: '🐾' },
    ],
  },
  {
    name: 'Epargne et investissement',
    kind: 'TRANSFER',
    icon: '📈',
    color: '#2f8f7a',
    children: [
      { name: 'Versement assurance vie', icon: '🏦' },
      { name: 'Versement compte-titres', icon: '📈' },
      { name: 'Livret et epargne', icon: '🐖' },
    ],
  },
  {
    name: 'Revenus',
    kind: 'INCOME',
    icon: '💶',
    color: '#3f8f4f',
    children: [
      { name: 'Salaire', icon: '💼' },
      { name: 'Revenus independants', icon: '🧾' },
      { name: 'Revenus locatifs', icon: '🏘️' },
      { name: 'Dividendes et interets', icon: '📊' },
      { name: 'Remboursements', icon: '↩️' },
      { name: 'Autres revenus', icon: '💶' },
    ],
  },
  { name: 'Virements internes', kind: 'TRANSFER', icon: '🔁', color: '#9ca3af' },
  { name: 'Non categorise', kind: 'EXPENSE', icon: '❓', color: '#9ca3af' },
];

export interface SeedRule {
  /** Motif recherche dans le libelle normalise. */
  pattern: string;
  /** Chemin de categorie : "Parent > Enfant" ou "Parent". */
  category: string;
  priority?: number;
  amountMin?: number;
  amountMax?: number;
}

/**
 * Regles de depart. Les motifs sont compares au libelle NORMALISE
 * (majuscules, sans accents, sans ponctuation).
 */
export const DEFAULT_RULES: SeedRule[] = [
  // --- Alimentation ---
  { pattern: 'CARREFOUR', category: 'Alimentation > Courses' },
  { pattern: 'LECLERC', category: 'Alimentation > Courses' },
  { pattern: 'E LECLERC', category: 'Alimentation > Courses' },
  { pattern: 'INTERMARCHE', category: 'Alimentation > Courses' },
  { pattern: 'AUCHAN', category: 'Alimentation > Courses' },
  { pattern: 'LIDL', category: 'Alimentation > Courses' },
  { pattern: 'ALDI', category: 'Alimentation > Courses' },
  { pattern: 'CASINO', category: 'Alimentation > Courses' },
  { pattern: 'MONOPRIX', category: 'Alimentation > Courses' },
  { pattern: 'FRANPRIX', category: 'Alimentation > Courses' },
  { pattern: 'SUPER U', category: 'Alimentation > Courses' },
  { pattern: 'HYPER U', category: 'Alimentation > Courses' },
  { pattern: 'GRAND FRAIS', category: 'Alimentation > Courses' },
  { pattern: 'BIOCOOP', category: 'Alimentation > Courses' },
  { pattern: 'PICARD', category: 'Alimentation > Courses' },
  { pattern: 'NATURALIA', category: 'Alimentation > Courses' },
  { pattern: 'BOULANGERIE', category: 'Alimentation > Courses' },
  { pattern: 'UBER EATS', category: 'Alimentation > Livraison', priority: 50 },
  { pattern: 'DELIVEROO', category: 'Alimentation > Livraison' },
  { pattern: 'JUST EAT', category: 'Alimentation > Livraison' },
  { pattern: 'FRICHTI', category: 'Alimentation > Livraison' },
  { pattern: 'MCDONALD', category: 'Alimentation > Restaurants' },
  { pattern: 'BURGER KING', category: 'Alimentation > Restaurants' },
  { pattern: 'RESTAURANT', category: 'Alimentation > Restaurants' },
  { pattern: 'BRASSERIE', category: 'Alimentation > Restaurants' },
  { pattern: 'PIZZERIA', category: 'Alimentation > Restaurants' },
  { pattern: 'SUSHI', category: 'Alimentation > Restaurants' },
  { pattern: 'STARBUCKS', category: 'Alimentation > Cafes et bars' },
  { pattern: 'COLUMBUS CAFE', category: 'Alimentation > Cafes et bars' },

  // --- Logement ---
  { pattern: 'EDF', category: 'Logement > Electricite et gaz' },
  { pattern: 'ENGIE', category: 'Logement > Electricite et gaz' },
  { pattern: 'TOTALENERGIES', category: 'Logement > Electricite et gaz' },
  { pattern: 'ELECTRICITE', category: 'Logement > Electricite et gaz' },
  { pattern: 'VEOLIA', category: 'Logement > Eau' },
  { pattern: 'SUEZ', category: 'Logement > Eau' },
  { pattern: 'EAU DU', category: 'Logement > Eau' },
  { pattern: 'ORANGE', category: 'Logement > Internet et telephone' },
  { pattern: 'SFR', category: 'Logement > Internet et telephone' },
  { pattern: 'BOUYGUES TELECOM', category: 'Logement > Internet et telephone' },
  { pattern: 'FREE MOBILE', category: 'Logement > Internet et telephone', priority: 50 },
  { pattern: 'FREE', category: 'Logement > Internet et telephone' },
  { pattern: 'SOSH', category: 'Logement > Internet et telephone' },
  { pattern: 'RED BY SFR', category: 'Logement > Internet et telephone' },
  { pattern: 'LEROY MERLIN', category: 'Logement > Travaux et entretien' },
  { pattern: 'CASTORAMA', category: 'Logement > Travaux et entretien' },
  { pattern: 'BRICO DEPOT', category: 'Logement > Travaux et entretien' },
  { pattern: 'LOYER', category: 'Logement > Loyer ou credit' },
  { pattern: 'SYNDIC', category: 'Logement > Charges et copropriete' },

  // --- Transport ---
  { pattern: 'SNCF', category: 'Transport > Transports en commun' },
  { pattern: 'TRAINLINE', category: 'Transport > Transports en commun' },
  { pattern: 'ILEVIA', category: 'Transport > Transports en commun' },
  { pattern: 'RATP', category: 'Transport > Transports en commun' },
  { pattern: 'BLABLACAR', category: 'Transport > Transports en commun' },
  { pattern: 'FLIXBUS', category: 'Transport > Transports en commun' },
  { pattern: 'TOTAL ACCESS', category: 'Transport > Carburant' },
  { pattern: 'ESSO', category: 'Transport > Carburant' },
  { pattern: 'STATION SERVICE', category: 'Transport > Carburant' },
  { pattern: 'BP FRANCE', category: 'Transport > Carburant' },
  { pattern: 'SHELL', category: 'Transport > Carburant' },
  { pattern: 'VINCI AUTOROUTES', category: 'Transport > Peage et stationnement' },
  { pattern: 'SANEF', category: 'Transport > Peage et stationnement' },
  { pattern: 'APRR', category: 'Transport > Peage et stationnement' },
  { pattern: 'ULYS', category: 'Transport > Peage et stationnement' },
  { pattern: 'PARKING', category: 'Transport > Peage et stationnement' },
  { pattern: 'INDIGO', category: 'Transport > Peage et stationnement' },
  { pattern: 'NORAUTO', category: 'Transport > Entretien vehicule' },
  { pattern: 'FEU VERT', category: 'Transport > Entretien vehicule' },
  { pattern: 'MIDAS', category: 'Transport > Entretien vehicule' },
  { pattern: 'UBER', category: 'Transport > Taxi et VTC', priority: 90 },
  { pattern: 'BOLT', category: 'Transport > Taxi et VTC' },
  { pattern: 'G7', category: 'Transport > Taxi et VTC' },

  // --- Sante ---
  { pattern: 'PHARMACIE', category: 'Sante > Pharmacie' },
  { pattern: 'DOCTOLIB', category: 'Sante > Consultations' },
  { pattern: 'CPAM', category: 'Sante > Consultations' },
  { pattern: 'MUTUELLE', category: 'Sante > Mutuelle' },
  { pattern: 'HARMONIE MUTUELLE', category: 'Sante > Mutuelle' },
  { pattern: 'MGEN', category: 'Sante > Mutuelle' },
  { pattern: 'ALAN', category: 'Sante > Mutuelle' },
  { pattern: 'OPTIC', category: 'Sante > Optique et dentaire' },
  { pattern: 'GRAND OPTICAL', category: 'Sante > Optique et dentaire' },

  // --- Loisirs ---
  { pattern: 'NETFLIX', category: 'Loisirs > Abonnements medias' },
  { pattern: 'SPOTIFY', category: 'Loisirs > Abonnements medias' },
  { pattern: 'DEEZER', category: 'Loisirs > Abonnements medias' },
  { pattern: 'DISNEY', category: 'Loisirs > Abonnements medias' },
  { pattern: 'CANAL', category: 'Loisirs > Abonnements medias' },
  { pattern: 'PRIME VIDEO', category: 'Loisirs > Abonnements medias' },
  { pattern: 'YOUTUBE PREMIUM', category: 'Loisirs > Abonnements medias' },
  { pattern: 'MOLOTOV', category: 'Loisirs > Abonnements medias' },
  { pattern: 'BASIC FIT', category: 'Loisirs > Sport' },
  { pattern: 'FITNESS PARK', category: 'Loisirs > Sport' },
  { pattern: 'DECATHLON', category: 'Loisirs > Sport' },
  { pattern: 'STRAVA', category: 'Loisirs > Sport' },
  { pattern: 'UGC', category: 'Loisirs > Sorties et culture' },
  { pattern: 'PATHE', category: 'Loisirs > Sorties et culture' },
  { pattern: 'FNAC', category: 'Loisirs > Sorties et culture' },
  { pattern: 'BOOKING COM', category: 'Loisirs > Voyages' },
  { pattern: 'AIRBNB', category: 'Loisirs > Voyages' },
  { pattern: 'AIR FRANCE', category: 'Loisirs > Voyages' },
  { pattern: 'RYANAIR', category: 'Loisirs > Voyages' },
  { pattern: 'EASYJET', category: 'Loisirs > Voyages' },
  { pattern: 'TRANSAVIA', category: 'Loisirs > Voyages' },
  { pattern: 'STEAM', category: 'Loisirs > Jeux et applications' },
  { pattern: 'NINTENDO', category: 'Loisirs > Jeux et applications' },
  { pattern: 'PLAYSTATION', category: 'Loisirs > Jeux et applications' },
  { pattern: 'APPLE COM BILL', category: 'Loisirs > Jeux et applications' },
  { pattern: 'GOOGLE PLAY', category: 'Loisirs > Jeux et applications' },

  // --- Achats ---
  { pattern: 'AMAZON', category: 'Achats > High-tech' },
  { pattern: 'CDISCOUNT', category: 'Achats > High-tech' },
  { pattern: 'BOULANGER', category: 'Achats > High-tech' },
  { pattern: 'DARTY', category: 'Achats > High-tech' },
  { pattern: 'LA REDOUTE', category: 'Achats > Vetements' },
  { pattern: 'ZARA', category: 'Achats > Vetements' },
  { pattern: 'UNIQLO', category: 'Achats > Vetements' },
  { pattern: 'KIABI', category: 'Achats > Vetements' },
  { pattern: 'VINTED', category: 'Achats > Vetements' },
  { pattern: 'IKEA', category: 'Achats > Equipement maison' },
  { pattern: 'MAISONS DU MONDE', category: 'Achats > Equipement maison' },
  { pattern: 'ACTION', category: 'Achats > Equipement maison' },

  // --- Assurances et frais ---
  { pattern: 'MAIF', category: 'Assurances et frais > Autres assurances' },
  { pattern: 'MACIF', category: 'Assurances et frais > Autres assurances' },
  { pattern: 'MAAF', category: 'Assurances et frais > Autres assurances' },
  { pattern: 'AXA', category: 'Assurances et frais > Autres assurances' },
  { pattern: 'ALLIANZ', category: 'Assurances et frais > Autres assurances' },
  { pattern: 'GROUPAMA', category: 'Assurances et frais > Autres assurances' },
  { pattern: 'MATMUT', category: 'Assurances et frais > Autres assurances' },
  { pattern: 'COTISATION CARTE', category: 'Assurances et frais > Frais bancaires' },
  { pattern: 'FRAIS TENUE DE COMPTE', category: 'Assurances et frais > Frais bancaires' },
  { pattern: 'COMMISSION D INTERVENTION', category: 'Assurances et frais > Frais bancaires' },
  { pattern: 'AGIOS', category: 'Assurances et frais > Frais bancaires' },

  // --- Impots ---
  { pattern: 'DGFIP', category: 'Impots et taxes > Autres taxes' },
  { pattern: 'IMPOT', category: 'Impots et taxes > Impot sur le revenu' },
  { pattern: 'TRESOR PUBLIC', category: 'Impots et taxes > Autres taxes' },
  { pattern: 'TAXE FONCIERE', category: 'Impots et taxes > Taxe fonciere' },
  { pattern: 'URSSAF', category: 'Impots et taxes > Autres taxes' },

  // --- Epargne et investissement ---
  { pattern: 'YOMONI', category: 'Epargne et investissement > Versement assurance vie' },
  { pattern: 'TRADE REPUBLIC', category: 'Epargne et investissement > Versement compte-titres' },
  { pattern: 'LINXEA', category: 'Epargne et investissement > Versement assurance vie' },
  { pattern: 'BOURSORAMA VIE', category: 'Epargne et investissement > Versement assurance vie' },
  { pattern: 'LIVRET A', category: 'Epargne et investissement > Livret et epargne' },
  { pattern: 'LDDS', category: 'Epargne et investissement > Livret et epargne' },

  // --- Revenus (montants positifs) ---
  { pattern: 'SALAIRE', category: 'Revenus > Salaire', amountMin: 0 },
  { pattern: 'PAIE', category: 'Revenus > Salaire', amountMin: 0 },
  { pattern: 'REMB', category: 'Revenus > Remboursements', amountMin: 0, priority: 150 },
  { pattern: 'CAF', category: 'Revenus > Autres revenus', amountMin: 0 },
  { pattern: 'POLE EMPLOI', category: 'Revenus > Autres revenus', amountMin: 0 },
  { pattern: 'FRANCE TRAVAIL', category: 'Revenus > Autres revenus', amountMin: 0 },
];

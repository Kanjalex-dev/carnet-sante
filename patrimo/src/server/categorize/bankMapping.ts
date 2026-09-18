/**
 * Correspondance entre les categories fournies par la banque et la taxonomie
 * interne.
 *
 * Pourquoi ce module existe : les regles par enseigne ne couvrent, sur un
 * relevé reel, qu'une petite part des operations — environ un quart. La banque,
 * elle, categorise presque tout. Sa categorie est un signal bien meilleur qu'un
 * modele de langage pour ce qu'elle couvre : elle est gratuite, instantanee,
 * stable, et elle vient de celui qui voit le marchand derriere le libelle.
 *
 * Ordre de priorite retenu :
 *
 *   1. regles deterministes (dont les regles apprises de l'utilisateur)
 *   2. categorie de la banque, via cette table
 *   3. modele de langage, pour le reste
 *
 * La banque reste faillible — son "Vie quotidienne > Vie quotidienne" ne veut
 * rien dire — donc les correspondances trop vagues pointent volontairement vers
 * une categorie generique plutot que d'inventer une precision absente.
 *
 * Les cles sont normalisees : minuscules, sans accents, sans ponctuation.
 */

import { deaccent } from '@/lib/normalize';

export function normalizeBankCategory(raw: string): string {
  return deaccent(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Table BoursoBank. Cle = "categorieParente > categorie" normalisee.
 * Valeur = chemin dans la taxonomie interne ("Parent > Enfant").
 *
 * Etablie a partir des 60 couples distincts observes sur un export reel couvrant
 * six ans. Les autres banques qui exportent une categorie pourront reutiliser la
 * meme mecanique en ajoutant leur table ici.
 */
export const BOURSOBANK_CATEGORY_MAP: Record<string, string> = {
  // --- Vie quotidienne ---
  'vie quotidienne alimentation': 'Alimentation > Courses',
  'vie quotidienne vetements et accessoires': 'Achats > Vetements',
  'vie quotidienne livres cd dvd bijoux jouets': 'Achats > Cadeaux',
  'vie quotidienne electronique et informatique': 'Achats > High-tech',
  'vie quotidienne mobilier electromenager decoration': 'Achats > Equipement maison',
  'vie quotidienne bricolage et jardinage': 'Logement > Travaux et entretien',
  'vie quotidienne equipements sportifs et artistiques': 'Loisirs > Sport',
  'vie quotidienne bien etre et soins coiffeur parfums': 'Achats > Vetements',
  'vie quotidienne animaux domestiques': 'Famille > Animaux',
  'vie quotidienne remboursements frais de vie quotidienne': 'Revenus > Remboursements',
  // "Vie quotidienne > Vie quotidienne" ne dit rien de plus que "une depense".
  // On ne devine pas : la ligne reste a classer, ou passe a l'IA.

  // --- Loisirs et sorties ---
  'loisirs et sorties restaurants bars discotheques': 'Alimentation > Restaurants',
  'loisirs et sorties divertissement culture cine theatre concerts':
    'Loisirs > Sorties et culture',
  'loisirs et sorties club association sport hobby art': 'Loisirs > Sport',
  'loisirs et sorties depenses jeux et paris': 'Loisirs > Jeux et applications',
  'loisirs et sorties loisirs et sorties': 'Loisirs > Sorties et culture',

  // --- Auto et moto ---
  'auto moto carburant': 'Transport > Carburant',
  'auto moto parking': 'Transport > Peage et stationnement',
  'auto moto peages': 'Transport > Peage et stationnement',
  'auto moto entretien reparation': 'Transport > Entretien vehicule',
  'auto moto contraventions': 'Transport > Entretien vehicule',
  'auto moto auto moto autres': 'Transport',
  'auto moto auto moto': 'Transport',

  // --- Voyages et transports ---
  'voyages transports hebergement hotels camping': 'Loisirs > Voyages',
  'voyages transports transports longue distance avions trains':
    'Transport > Transports en commun',
  'voyages transports agences de voyages': 'Loisirs > Voyages',
  'voyages transports location de vehicules': 'Transport > Location et LLD',
  'voyages transports taxis': 'Transport > Taxi et VTC',

  // --- Sante ---
  'sante medecins et frais medicaux': 'Sante > Consultations',
  'sante pharmacie et laboratoire': 'Sante > Pharmacie',
  'sante optique audition': 'Sante > Optique et dentaire',
  'sante remboursements frais de sante': 'Revenus > Remboursements',

  // --- Logement ---
  'logement travaux reparation entretien amenagement': 'Logement > Travaux et entretien',
  'logement frais exceptionnels demenagements frais agences':
    'Logement > Charges et copropriete',

  // --- Abonnements ---
  'abonnements telephonie abonnements telephonie': 'Logement > Internet et telephone',
  'abonnements telephonie journaux magazines': 'Loisirs > Abonnements medias',

  // --- Impots, frais, credits ---
  'impots taxes impots taxes': 'Impots et taxes > Autres taxes',
  'services financiers professionnels frais bancaires et de gestion dont agios':
    'Assurances et frais > Frais bancaires',
  'services financiers professionnels services financiers professionnels autres':
    'Assurances et frais > Frais bancaires',
  'services financiers professionnels remboursement de frais offres boursobank':
    'Revenus > Remboursements',
  'emprunts hors immobilier credit conso': 'Logement > Loyer ou credit',

  // --- Famille, dons ---
  'cadeaux et solidarite dons et cadeaux': 'Achats > Cadeaux',
  'cadeaux et solidarite financement personnes dependantes': 'Famille > Enfants',
  'education famille etudes formation fournitures cantines':
    'Famille > Garde et scolarite',

  // --- Epargne et investissement (mouvements, pas depenses) ---
  'depenses d epargne epargne financiere retraite prevoyance pea assurance vie':
    'Epargne et investissement > Versement compte-titres',
  'revenus d epargne revenus epargne financiere retraite prevoyance pea assurance vie':
    'Revenus > Dividendes et interets',
  'revenus d epargne crypto monnaies': 'Epargne et investissement > Versement compte-titres',

  // --- Revenus ---
  'autres revenus vente d equipements': 'Revenus > Autres revenus',

  // --- Mouvements internes : ni depense ni revenu ---
  'mouvements internes debiteurs prelevements cartes debit differe et cartes credit conso':
    'Virements internes',
  'mouvements internes debiteurs virements emis de comptes a comptes': 'Virements internes',
  'mouvements internes debiteurs mouvements internes debiteurs': 'Virements internes',
  'mouvements internes crediteurs credit carte': 'Virements internes',
  'mouvements internes crediteurs virements recus de comptes a comptes': 'Virements internes',

  // --- Retraits et cheques : la destination reelle est inconnue ---
  'retraits cash retraits cash': 'Non categorise',
  'cheques cheques': 'Non categorise',

  // Les virements emis/recus generiques ne disent rien de la nature de la
  // depense : les mapper reviendrait a ranger un loyer avec un remboursement
  // entre amis. On laisse les regles ou l'utilisateur trancher.
};

/**
 * Traduit une categorie bancaire en chemin interne, ou null si la
 * correspondance n'existe pas ou serait trompeuse.
 */
export function mapBankCategory(bankCategory: string | undefined): string | null {
  if (!bankCategory) return null;
  const key = normalizeBankCategory(bankCategory);
  return BOURSOBANK_CATEGORY_MAP[key] ?? null;
}

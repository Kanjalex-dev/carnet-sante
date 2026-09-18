/**
 * Normalisation des libelles bancaires.
 *
 * Les releves francais sont bruyants : "CARTE 4589 CARREFOUR MARKET LILLE 12/09",
 * "PRLV SEPA SPOTIFY AB ECH/240912 MANDAT XY82HD", "VIR INST DE M DUPONT JEAN".
 *
 * Le pipeline est volontairement ordonne : on retire le bruit AVANT d'effacer la
 * ponctuation, sinon "12/09" devient "12 09" et n'est plus reconnaissable comme
 * une date.
 *
 *   brut
 *     -> deaccent + majuscules            (comparaison insensible aux accents)
 *     -> retrait du prefixe d'operation   (CARTE, PRLV SEPA, VIR...)
 *     -> retrait des fragments volatils   (dates, n° de carte, references)
 *     -> retrait de la ponctuation        (forme canonique)
 */

const COMBINING_MARKS = /[̀-ͯ]/g;
const WHITESPACE = /[\s  ]+/g;

export function deaccent(input: string): string {
  return input.normalize('NFD').replace(COMBINING_MARKS, '');
}

/** Forme canonique : majuscules, sans accents, sans ponctuation, espaces reduits. */
export function normalizeLabel(raw: string): string {
  return deaccent(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

/** Prefixes d'operation que les banques francaises collent devant le libelle. */
const OPERATION_PREFIXES = [
  'PAIEMENT PAR CARTE',
  'PRELEVEMENT SEPA',
  'VIREMENT SEPA RECU',
  'VIREMENT INSTANTANE',
  'ACHAT CARTE',
  'PAIEMENT CB',
  'VIREMENT RECU',
  'PRELEVEMENT',
  'REMISE CHEQUE',
  'VIREMENT EMIS',
  'REMBOURSEMENT',
  'RETRAIT DAB',
  'VIR INSTANTANE',
  'VIR INST',
  'PRLV SEPA',
  'VIR SEPA',
  'VIREMENT',
  'ACHAT CB',
  'COTISATION',
  'ECHEANCE',
  'RETRAIT',
  'FACTURE',
  'CHEQUE',
  'CARTE',
  'PRLV',
  'AVOIR',
  'FRAIS',
  'VIR',
  'CB',
];

/**
 * Retire le prefixe d'operation en tete de libelle. Applique en boucle : un
 * libelle peut cumuler "PAIEMENT CB CARTE ...".
 */
export function stripOperationPrefix(upper: string): string {
  let s = upper.trim();
  const prefixes = [...OPERATION_PREFIXES].sort((a, b) => b.length - a.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prefixes) {
      if (s === p) return '';
      if (s.startsWith(`${p} `) || s.startsWith(`${p}/`) || s.startsWith(`${p}:`)) {
        s = s.slice(p.length + 1).trim();
        changed = true;
        break;
      }
    }
  }
  // Un numero de carte suit souvent le prefixe : "CARTE 4589 CARREFOUR".
  s = s.replace(/^\d{4,6}\b\s*/, '');
  return s.trim();
}

/**
 * Retire les fragments qui varient d'une occurrence a l'autre. C'est ce qui
 * permet de regrouper les prelevements d'un meme abonnement.
 * A appeler sur une chaine qui a ENCORE sa ponctuation.
 */
export function stripVolatile(upper: string): string {
  let s = ` ${upper} `;

  // L'ordre compte. Les mots-cles suivis d'une reference doivent partir AVANT
  // que les nombres isoles ne soient effaces, sinon le mot-cle se retrouve
  // orphelin et avale le token suivant.

  // Mots-cles SEPA suivis de leur reference : "MANDAT XY82HD", "REF/8827361822".
  s = s.replace(
    /\b(?:MANDAT|RUM|REF|ID|NUM|NO)\b[/:.\-°]?[ ]?[A-Z0-9]{2,}\b/g,
    ' ',
  );
  s = s.replace(/\b(?:MANDAT|RUM|REF|NUM)\b/g, ' ');
  // Echeance : "ECH/240912", "ECH 12/09". La reference est collee ou juste apres.
  s = s.replace(/\bECH\b[/:.\-]?[ ]?[0-9/.\-]{2,}/g, ' ');
  s = s.replace(/\bECH\b/g, ' ');
  // Numeros de carte : "CARTE 4589".
  s = s.replace(/\bCARTE\s*\d+\b/g, ' ');
  // Heures : 14H32, 14:32
  s = s.replace(/\b\d{1,2}[H:]\d{2}\b/g, ' ');
  // Dates : 12/09, 12.09.26, 12-09-2026
  s = s.replace(/\b\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?\b/g, ' ');
  // References alphanumeriques longues contenant au moins un chiffre.
  s = s.replace(/\b(?=[A-Z0-9]*\d)[A-Z0-9]{8,}\b/g, ' ');
  // Nombres isoles restants : n° de carte, dates compactes, references.
  s = s.replace(/\b\d{3,}\b/g, ' ');
  // Mois abreges.
  s = s.replace(
    /\b(?:JANV?|FEVR?|MARS|AVR|MAI|JUIN|JUIL|AOUT|SEPT?|OCTO?|NOVE?|DECE?)\b/g,
    ' ',
  );

  return s.replace(WHITESPACE, ' ').trim();
}

/** Chaine de traitement complete : brut -> forme canonique debruitee. */
export function canonicalLabel(rawLabel: string): string {
  const upper = deaccent(rawLabel).toUpperCase().replace(WHITESPACE, ' ').trim();
  const withoutPrefix = stripOperationPrefix(upper);
  const denoised = stripVolatile(withoutPrefix);
  return denoised
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

/**
 * Cle de regroupement d'une serie recurrente. Deux prelevements du meme
 * abonnement doivent produire exactement la meme cle.
 */
export function recurringKey(rawLabel: string): string {
  const base = canonicalLabel(rawLabel);
  const words = base.split(' ').filter((w) => w.length > 1 && !/^\d+$/.test(w));
  // Au-dela de quatre mots signifiants, c'est du bruit d'agence ou de ville.
  return words.slice(0, 4).join(' ') || base;
}

/** Libelle affichable dans l'interface. */
export function cleanLabel(rawLabel: string): string {
  const base = canonicalLabel(rawLabel);
  if (base === '') return rawLabel.trim();
  return base
    .toLowerCase()
    .split(' ')
    .map((w) =>
      w.length > 3 || /[aeiouy]/.test(w)
        ? w.charAt(0).toUpperCase() + w.slice(1)
        : w.toUpperCase(),
    )
    .join(' ');
}

/**
 * Devine l'enseigne : le premier groupe de mots alphabetiques significatifs.
 * Sert a l'affichage et au regroupement des abonnements.
 */
export function guessMerchant(rawLabel: string): string | null {
  const words = canonicalLabel(rawLabel)
    .split(' ')
    .filter((w) => w.length > 2 && /^[A-Z]+$/.test(w));
  if (words.length === 0) return null;
  return words.slice(0, 2).join(' ');
}

/** Ecart relatif entre deux montants (0 = identiques, 1 = tout oppose). */
export function relativeGap(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 0;
  return Math.abs(a - b) / max;
}

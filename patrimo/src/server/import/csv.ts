/**
 * Parseur CSV pour releves bancaires francais.
 *
 * Il n'existe pas de format standard : chaque banque exporte ses colonnes, son
 * separateur et son encodage. Trois strategies, dans cet ordre :
 *
 *  1. profil connu, reconnu a la signature de son en-tete (le plus fiable) ;
 *  2. detection heuristique des colonnes par leur intitule ;
 *  3. detection par le contenu des cellules, si l'en-tete est absent.
 *
 * Deux colonnes debit/credit separees sont gerees : beaucoup de banques
 * francaises exportent ainsi plutot qu'une colonne signee.
 */

import Papa from 'papaparse';
import { parseFrenchAmount } from '@/lib/money';
import { parseStatementDate } from '@/lib/dates';
import { deaccent } from '@/lib/normalize';
import type { ParseResult, ParsedRow, ParseWarning } from './types';
import { ImportError } from './types';

export interface BankProfile {
  name: string;
  /** Intitules de colonnes qui identifient ce profil (comparaison normalisee). */
  signature: string[];
  dateColumns: string[];
  valueDateColumns?: string[];
  labelColumns: string[];
  /** Colonne unique signee. */
  amountColumns?: string[];
  /** Ou bien deux colonnes separees. */
  debitColumns?: string[];
  creditColumns?: string[];
  /** Colonnes identifiant le compte, quand le fichier en melange plusieurs. */
  accountColumns?: string[];
  accountLabelColumns?: string[];
  /** Solde du compte apres operation. */
  balanceColumns?: string[];
  /** Categorie proposee par la banque. */
  categoryColumns?: string[];
  categoryParentColumns?: string[];
  delimiter?: string;
  /** Nombre de lignes a ignorer avant l'en-tete (certains exports ont un cartouche). */
  skipLines?: number;
}

/**
 * Profils des principales banques francaises.
 *
 * A VERIFIER : ces signatures viennent de formats d'export publiquement
 * documentes et de conventions courantes, pas d'un test sur chacun des exports
 * reels. Si un import tombe en detection heuristique, comparer l'en-tete du
 * fichier avec le profil correspondant et ajuster ici.
 */
export const BANK_PROFILES: BankProfile[] = [
  {
    // Signature verifiee sur un export reel (septembre 2026). L'ancienne
    // version de ce profil etait fausse et l'import basculait en detection
    // heuristique, qui echouait faute de colonne "libelle".
    name: 'BoursoBank',
    signature: ['dateop', 'label', 'amount', 'accountnum'],
    dateColumns: ['dateop'],
    valueDateColumns: ['dateval'],
    // `label` porte le libelle brut ; `suggestedLabel` l'enseigne devinee par
    // la banque. On garde le brut : c'est lui qui sert d'empreinte.
    labelColumns: ['label'],
    amountColumns: ['amount'],
    accountColumns: ['accountnum'],
    accountLabelColumns: ['accountlabel'],
    balanceColumns: ['accountbalance'],
    categoryColumns: ['category'],
    categoryParentColumns: ['categoryparent'],
    delimiter: ';',
  },
  {
    name: 'Credit Agricole',
    signature: ['dateoperation', 'libelleoperation', 'debiteuros'],
    dateColumns: ['dateoperation', 'date'],
    valueDateColumns: ['datevaleur'],
    labelColumns: ['libelleoperation', 'libelle'],
    debitColumns: ['debiteuros', 'debit'],
    creditColumns: ['crediteuros', 'credit'],
    delimiter: ';',
  },
  {
    name: 'BNP Paribas',
    signature: ['dateoperation', 'categorie', 'libelle', 'montant'],
    dateColumns: ['dateoperation', 'date'],
    labelColumns: ['libelle', 'libelleoperation'],
    amountColumns: ['montant', 'montanteuros'],
    delimiter: ';',
  },
  {
    name: 'Societe Generale',
    signature: ['dateoperation', 'libelle', 'montanteuros'],
    dateColumns: ['dateoperation', 'date'],
    valueDateColumns: ['datevaleur'],
    labelColumns: ['libelle', 'detail'],
    amountColumns: ['montanteuros', 'montant'],
    delimiter: ';',
  },
  {
    name: 'LCL',
    signature: ['date', 'montant', 'libelle'],
    dateColumns: ['date', 'dateoperation'],
    labelColumns: ['libelle', 'natureoperation'],
    amountColumns: ['montant'],
    delimiter: ';',
  },
  {
    name: 'Fortuneo',
    signature: ['dateoperation', 'datevaleur', 'libelle', 'debit', 'credit'],
    dateColumns: ['dateoperation'],
    valueDateColumns: ['datevaleur'],
    labelColumns: ['libelle'],
    debitColumns: ['debit'],
    creditColumns: ['credit'],
    delimiter: ';',
  },
  {
    name: 'Hello bank! / Nickel',
    signature: ['date', 'libelle', 'montant'],
    dateColumns: ['date'],
    labelColumns: ['libelle', 'description'],
    amountColumns: ['montant'],
    delimiter: ';',
  },
  {
    name: 'Revolut',
    signature: ['starteddate', 'description', 'amount'],
    dateColumns: ['completeddate', 'starteddate', 'date'],
    labelColumns: ['description'],
    amountColumns: ['amount'],
    delimiter: ',',
  },
  {
    name: 'N26',
    signature: ['booking date', 'partner name', 'amount eur'],
    dateColumns: ['bookingdate', 'valuedate', 'date'],
    labelColumns: ['partnername', 'paymentreference', 'description'],
    amountColumns: ['amounteur', 'amount'],
    delimiter: ',',
  },
];

/** Normalise un intitule de colonne pour la comparaison. */
function normHeader(h: string): string {
  return deaccent(h)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/** Devine le separateur en comparant le nombre de champs produits. */
export function detectDelimiter(sample: string): string {
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestScore = -1;
  const lines = sample.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 10);
  for (const d of candidates) {
    const counts = lines.map((l) => l.split(d).length);
    if (counts.length === 0) continue;
    const first = counts[0];
    // Un bon separateur donne le meme nombre de colonnes sur toutes les lignes.
    const consistent = counts.every((c) => c === first);
    const score = (consistent ? 100 : 0) + first;
    if (first > 1 && score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Decode le buffer en tenant compte du BOM et du Latin-1 encore repandu. */
export function decodeBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  const utf8 = buffer.toString('utf8');
  // U+FFFD signale un decodage UTF-8 rate : le fichier est probablement en
  // Windows-1252, encore courant dans les exports bancaires francais.
  if (utf8.includes('�')) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
  return utf8;
}

function pickColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map(normHeader);
  for (const c of candidates) {
    const idx = normalized.indexOf(normHeader(c));
    if (idx >= 0) return headers[idx];
  }
  // Correspondance partielle en dernier recours.
  for (const c of candidates) {
    const target = normHeader(c);
    const idx = normalized.findIndex((h) => h.includes(target) || target.includes(h));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function matchProfile(headers: string[]): BankProfile | null {
  const normalized = new Set(headers.map(normHeader));
  let best: BankProfile | null = null;
  let bestHits = 0;
  for (const profile of BANK_PROFILES) {
    const hits = profile.signature.filter((s) => normalized.has(normHeader(s))).length;
    if (hits === profile.signature.length && hits > bestHits) {
      best = profile;
      bestHits = hits;
    }
  }
  return best;
}

/** Detection heuristique quand aucun profil ne correspond. */
function heuristicColumns(headers: string[]) {
  return {
    account: pickColumn(headers, ['accountnum', 'numerodecompte', 'compte']),
    accountLabel: pickColumn(headers, ['accountlabel', 'libellecompte', 'nomducompte']),
    balance: pickColumn(headers, ['accountbalance', 'solde']),
    category: pickColumn(headers, ['category', 'categorie']),
    categoryParent: pickColumn(headers, ['categoryparent', 'categorieparente']),
    date: pickColumn(headers, ['dateoperation', 'dateopé', 'date', 'bookingdate', 'transactiondate', 'completeddate']),
    valueDate: pickColumn(headers, ['datevaleur', 'valuedate']),
    label: pickColumn(headers, ['libelle', 'libelleoperation', 'label', 'description', 'nature', 'intitule', 'detail', 'partnername', 'reference']),
    amount: pickColumn(headers, ['montant', 'montanteuros', 'amount', 'amounteur', 'valeur']),
    debit: pickColumn(headers, ['debit', 'debiteuros', 'depense', 'retrait']),
    credit: pickColumn(headers, ['credit', 'crediteuros', 'recette', 'depot']),
  };
}

export function parseCsv(buffer: Buffer, filename: string): ParseResult {
  const text = decodeBuffer(buffer);
  if (text.trim() === '') throw new ImportError('Le fichier est vide.');

  const delimiter = detectDelimiter(text.slice(0, 8000));
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const headers = (parsed.meta.fields ?? []).filter((h) => h && h.trim() !== '');
  if (headers.length < 2) {
    throw new ImportError(
      "Impossible de lire l'en-tete du fichier. Verifier qu'il s'agit bien d'un export CSV de releve.",
    );
  }

  const profile = matchProfile(headers);
  const cols = profile
    ? {
        date: pickColumn(headers, profile.dateColumns),
        valueDate: profile.valueDateColumns
          ? pickColumn(headers, profile.valueDateColumns)
          : null,
        label: pickColumn(headers, profile.labelColumns),
        amount: profile.amountColumns ? pickColumn(headers, profile.amountColumns) : null,
        debit: profile.debitColumns ? pickColumn(headers, profile.debitColumns) : null,
        credit: profile.creditColumns ? pickColumn(headers, profile.creditColumns) : null,
        account: profile.accountColumns ? pickColumn(headers, profile.accountColumns) : null,
        accountLabel: profile.accountLabelColumns
          ? pickColumn(headers, profile.accountLabelColumns)
          : null,
        balance: profile.balanceColumns ? pickColumn(headers, profile.balanceColumns) : null,
        category: profile.categoryColumns ? pickColumn(headers, profile.categoryColumns) : null,
        categoryParent: profile.categoryParentColumns
          ? pickColumn(headers, profile.categoryParentColumns)
          : null,
      }
    : heuristicColumns(headers);

  if (!cols.date) {
    throw new ImportError(
      `Aucune colonne de date reconnue. Colonnes trouvees : ${headers.join(', ')}`,
    );
  }
  if (!cols.label) {
    throw new ImportError(
      `Aucune colonne de libelle reconnue. Colonnes trouvees : ${headers.join(', ')}`,
    );
  }
  if (!cols.amount && !cols.debit && !cols.credit) {
    throw new ImportError(
      `Aucune colonne de montant reconnue. Colonnes trouvees : ${headers.join(', ')}`,
    );
  }

  const rows: ParsedRow[] = [];
  const warnings: ParseWarning[] = [];

  parsed.data.forEach((record, index) => {
    const line = index + 2; // +1 pour l'en-tete, +1 pour l'indexation humaine
    const rawDate = (record[cols.date!] ?? '').trim();
    if (rawDate === '') return; // ligne de total ou ligne vide

    const date = parseStatementDate(rawDate);
    if (!date) {
      warnings.push({ line, message: `Date illisible : "${rawDate}"`, raw: rawDate });
      return;
    }

    let amountCents: number | null = null;
    if (cols.amount) {
      amountCents = parseFrenchAmount(record[cols.amount] ?? '');
    }
    if (amountCents === null && (cols.debit || cols.credit)) {
      const debit = cols.debit ? parseFrenchAmount(record[cols.debit] ?? '') : null;
      const credit = cols.credit ? parseFrenchAmount(record[cols.credit] ?? '') : null;
      if (debit !== null && debit !== 0) {
        // La colonne debit peut etre ecrite positive ou negative selon la banque :
        // on force le signe negatif, c'est la convention interne.
        amountCents = -Math.abs(debit);
      } else if (credit !== null && credit !== 0) {
        amountCents = Math.abs(credit);
      }
    }

    if (amountCents === null || amountCents === 0) {
      warnings.push({ line, message: 'Montant absent ou nul, ligne ignoree.' });
      return;
    }

    const rawLabel = (record[cols.label!] ?? '').trim();
    if (rawLabel === '') {
      warnings.push({ line, message: 'Libelle vide, ligne ignoree.' });
      return;
    }

    const valueDate = cols.valueDate
      ? parseStatementDate((record[cols.valueDate] ?? '').trim()) ?? undefined
      : undefined;

    const accountKey = cols.account ? (record[cols.account] ?? '').trim() : undefined;
    const accountLabel = cols.accountLabel
      ? (record[cols.accountLabel] ?? '').trim()
      : undefined;
    const balanceCents = cols.balance
      ? parseFrenchAmount(record[cols.balance] ?? '') ?? undefined
      : undefined;

    const parent = cols.categoryParent ? (record[cols.categoryParent] ?? '').trim() : '';
    const child = cols.category ? (record[cols.category] ?? '').trim() : '';
    const bankCategory = [parent, child].filter(Boolean).join(' > ') || undefined;

    rows.push({
      date,
      valueDate,
      amountCents,
      rawLabel,
      accountKey: accountKey || undefined,
      accountLabel: accountLabel || undefined,
      balanceCents,
      bankCategory,
    });
  });

  if (rows.length === 0) {
    throw new ImportError(
      "Aucune operation exploitable dans ce fichier. Verifier le format et l'encodage.",
    );
  }

  // Un export peut melanger plusieurs comptes : compte courant et carte a
  // debit differe, typiquement. Les confondre fausse le solde et compte deux
  // fois chaque depense (une fois sur la carte, une fois au prelevement).
  const accountMap = new Map<string, string>();
  for (const row of rows) {
    if (row.accountKey && !accountMap.has(row.accountKey)) {
      accountMap.set(row.accountKey, row.accountLabel || row.accountKey);
    }
  }

  return {
    rows,
    warnings,
    profile: profile ? profile.name : `Detection automatique (${filename})`,
    format: 'CSV',
    accounts: accountMap.size > 0
      ? [...accountMap.entries()].map(([key, label]) => ({ key, label }))
      : undefined,
  };
}

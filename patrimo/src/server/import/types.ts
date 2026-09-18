/** Structures partagees par tous les parseurs d'import. */

export interface ParsedRow {
  /**
   * Compte auquel appartient l'operation, quand le fichier en contient
   * plusieurs. Les exports BoursoBank, par exemple, melangent le compte courant
   * et la carte a debit differe dans un seul fichier.
   */
  accountKey?: string;
  accountLabel?: string;
  /** Solde du compte apres cette operation, si le fichier le fournit. */
  balanceCents?: number;
  /** Categorie proposee par la banque : un signal utile, pas une verite. */
  bankCategory?: string;
  /** Date d'operation, en UTC minuit. */
  date: Date;
  /** Date de valeur si le releve la fournit. */
  valueDate?: Date;
  /** Montant en centimes. Negatif = depense. */
  amountCents: number;
  /** Libelle brut, exactement tel qu'ecrit dans le fichier. */
  rawLabel: string;
  /** Identifiant fourni par la banque (FITID en OFX), s'il existe. */
  externalId?: string;
}

export interface ParseWarning {
  line: number;
  message: string;
  raw?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: ParseWarning[];
  /** Nom du profil bancaire reconnu, pour tracer l'origine de l'import. */
  profile: string;
  format: 'CSV' | 'OFX' | 'QIF';
  /** Solde final declare par le fichier, si present (OFX <LEDGERBAL>). */
  statedBalanceCents?: number;
  statedBalanceDate?: Date;
  /** Comptes distincts rencontres dans le fichier. */
  accounts?: { key: string; label: string }[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

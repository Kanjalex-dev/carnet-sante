/**
 * Couche d'agregation patrimoniale.
 *
 * Tous les connecteurs implementent la meme interface, quelle que soit leur
 * nature : API non officielle, saisie manuelle, ou parsing de relevés. C'est ce
 * qui permet d'en ajouter un nouveau sans toucher au reste de l'application —
 * et de basculer un connecteur casse en saisie manuelle sans rien reecrire.
 */

import type { AssetClass, AssetProvider, AssetTxType } from '@prisma/client';

export interface ConnectorHolding {
  isin?: string;
  symbol?: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  unitPrice: number;
  value: number;
  costBasis?: number;
  currency: string;
}

export interface ConnectorTransaction {
  externalId?: string;
  date: Date;
  type: AssetTxType;
  isin?: string;
  symbol?: string;
  name?: string;
  quantity?: number;
  price?: number;
  amount: number;
  fees?: number;
  currency: string;
}

export interface ConnectorSnapshot {
  asOf: Date;
  holdings: ConnectorHolding[];
  cashValue: number;
  totalValue: number;
  transactions?: ConnectorTransaction[];
}

export interface SyncOutcome {
  ok: boolean;
  provider: AssetProvider;
  message: string;
  holdingsUpserted?: number;
  transactionsInserted?: number;
  totalValue?: number;
  durationMs: number;
}

export interface Connector {
  provider: AssetProvider;
  label: string;
  /** Un connecteur non officiel doit le declarer : l'interface l'affiche. */
  unofficial: boolean;
  /** Verifie que la configuration permet une tentative de synchronisation. */
  isConfigured(): Promise<boolean>;
  fetchSnapshot(assetAccountId: string): Promise<ConnectorSnapshot>;
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly provider: AssetProvider,
    readonly recoverable = true,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

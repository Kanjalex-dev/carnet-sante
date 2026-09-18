/**
 * Connecteur Yomoni — SAISIE MANUELLE.
 *
 * Yomoni ne publie aucune API, et il n'existe pas de client open source. Les
 * seules options etaient : scraper l'espace client (fragile, contraire aux CGU,
 * casse a chaque refonte), ou saisir la valorisation a la main.
 *
 * Choix retenu : la saisie manuelle. Un contrat en gestion pilotee se met a jour
 * une fois par mois — c'est trente secondes de saisie contre un scraper qui
 * casse deux fois par an et qu'il faut reparer.
 *
 * Ce module n'appelle donc rien : il expose la structure d'un releve Yomoni
 * (valorisation, versements cumules, repartition par classe d'actifs) et
 * l'enregistre comme n'importe quelle autre source. Le reste de l'application ne
 * fait aucune difference entre une donnee saisie et une donnee synchronisee.
 */

import type { AssetClass } from '@prisma/client';
import { db } from '@/server/db';
import { dateOnly } from '@/lib/dates';
import type { Connector, ConnectorSnapshot } from './types';
import { ConnectorError } from './types';

/** Les poches d'un contrat Yomoni en gestion pilotee. */
export const YOMONI_BUCKETS: { key: AssetClass; label: string; hint: string }[] = [
  { key: 'ETF', label: 'Actions (ETF)', hint: 'Poche actions de la gestion pilotee' },
  { key: 'BOND', label: 'Obligations', hint: 'Poche obligataire' },
  { key: 'EURO_FUND', label: 'Fonds euros', hint: 'Capital garanti' },
  { key: 'REAL_ESTATE', label: 'Immobilier (SCPI/SCI)', hint: 'Poche immobiliere' },
  { key: 'CASH', label: 'Liquidites', hint: 'Non investi' },
];

export interface YomoniEntry {
  /** Date de la valorisation, telle qu'affichee sur l'espace client. */
  asOf: Date;
  /** Valorisation totale du contrat, en euros. */
  totalValue: number;
  /** Somme des versements nets depuis l'ouverture, en euros. */
  invested?: number;
  /** Repartition en euros par classe d'actifs. */
  breakdown: Partial<Record<AssetClass, number>>;
  note?: string;
}

export const yomoniConnector: Connector = {
  provider: 'YOMONI',
  label: 'Yomoni (assurance vie)',
  unofficial: false,

  async isConfigured() {
    // Toujours "configure" : la saisie manuelle ne depend d'aucun secret.
    return true;
  },

  async fetchSnapshot(assetAccountId: string): Promise<ConnectorSnapshot> {
    // Il n'y a rien a aller chercher : on renvoie la derniere saisie connue.
    const last = await db.valuationSnapshot.findFirst({
      where: { assetAccountId },
      orderBy: { date: 'desc' },
    });
    if (!last) {
      throw new ConnectorError(
        "Aucune valorisation Yomoni saisie. Renseigner la premiere valeur depuis l'ecran Patrimoine.",
        'YOMONI',
        false,
      );
    }

    const holdings = await db.holding.findMany({ where: { assetAccountId } });
    return {
      asOf: last.date,
      holdings: holdings.map((h) => ({
        isin: h.isin ?? undefined,
        symbol: h.symbol ?? undefined,
        name: h.name,
        assetClass: h.assetClass,
        quantity: h.quantity.toNumber(),
        unitPrice: h.unitPrice.toNumber(),
        value: h.value.toNumber(),
        costBasis: h.costBasis?.toNumber(),
        currency: h.currency,
      })),
      cashValue: 0,
      totalValue: last.totalValue.toNumber(),
    };
  },
};

// La saisie manuelle vit desormais dans ../manualEntry : elle n'a rien de
// specifique a Yomoni, et doit rester disponible sur TOUTES les sources, y
// compris celles qui ont un connecteur. Un connecteur non officiel casse ; le
// suivi ne doit pas casser avec lui.
export {
  recordValuation,
  VALUATION_BUCKETS,
  type ValuationEntry,
} from '../manualEntry';

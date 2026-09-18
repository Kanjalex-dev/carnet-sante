/**
 * Saisie manuelle d'une valorisation — le socle de repli, toujours disponible.
 *
 * Regle de conception : QUEL QUE SOIT le connecteur, la saisie a la main reste
 * possible sur toutes les sources. Ce n'est pas une concession, c'est ce qui
 * rend l'application utilisable dans la duree :
 *
 *  - le connecteur Trade Republic est non officiel : il cassera un jour, sans
 *    preavis, et il ne doit pas emmener le suivi patrimonial avec lui ;
 *  - Yomoni ne publie aucune API : la saisie est le seul chemin ;
 *  - une source future (PEA, PER, immobilier, crypto) doit pouvoir entrer dans
 *    la vue consolidee le jour meme, sans attendre qu'un connecteur existe.
 *
 * Une valorisation saisie et une valorisation synchronisee sont stockees de la
 * meme facon : le reste de l'application ne fait aucune difference entre les
 * deux. C'est ce qui permet de basculer d'un mode a l'autre sans rien perdre —
 * un connecteur qui casse laisse un historique intact, qu'on continue a la main.
 *
 * Chaque poche est stockee comme une "position" de quantite 1 : cela evite un
 * modele de donnees special, et permet aux vues de repartition et de
 * performance de traiter une saisie exactement comme un portefeuille reel.
 */

import type { AssetClass } from '@prisma/client';
import { db } from '@/server/db';
import { dateOnly } from '@/lib/dates';
import { ConnectorError } from './connectors/types';

/** Classes d'actifs proposees a la saisie, dans l'ordre d'affichage. */
export const VALUATION_BUCKETS: { key: AssetClass; label: string; hint: string }[] = [
  { key: 'ETF', label: 'Actions (ETF)', hint: 'Fonds indiciels' },
  { key: 'EQUITY', label: 'Actions en direct', hint: 'Titres vifs' },
  { key: 'BOND', label: 'Obligations', hint: 'Poche obligataire' },
  { key: 'EURO_FUND', label: 'Fonds euros', hint: 'Capital garanti' },
  { key: 'REAL_ESTATE', label: 'Immobilier (SCPI/SCI)', hint: 'Poche immobiliere' },
  { key: 'CRYPTO', label: 'Crypto', hint: 'Actifs numeriques' },
  { key: 'CASH', label: 'Liquidites', hint: 'Non investi' },
];

export interface ValuationEntry {
  /** Date de la valorisation, telle qu'affichee sur l'espace client. */
  asOf: Date;
  /** Valorisation totale, en euros. */
  totalValue: number;
  /** Somme des versements nets depuis l'ouverture, en euros. */
  invested?: number;
  /** Repartition en euros par classe d'actifs. */
  breakdown: Partial<Record<AssetClass, number>>;
  note?: string;
}

/**
 * Enregistre une valorisation saisie a la main sur n'importe quelle source.
 *
 * Le controle de coherence entre le total et la repartition est volontairement
 * strict : une erreur de saisie sur un patrimoine se propage ensuite dans la
 * repartition, la performance et les recommandations d'arbitrage. Mieux vaut
 * refuser la saisie que produire des conseils fondes sur un chiffre faux.
 */
export async function recordValuation(
  profileId: string,
  assetAccountId: string,
  entry: ValuationEntry,
): Promise<{ totalValue: number; date: Date }> {
  const account = await db.assetAccount.findFirst({
    where: { id: assetAccountId, profileId },
  });
  if (!account) {
    throw new ConnectorError('Source introuvable.', 'MANUAL', false);
  }

  const date = dateOnly(entry.asOf);
  const breakdownSum = Object.values(entry.breakdown).reduce(
    (sum, v) => sum + (v ?? 0),
    0,
  );

  if (
    breakdownSum > 0 &&
    Math.abs(breakdownSum - entry.totalValue) > entry.totalValue * 0.02
  ) {
    throw new ConnectorError(
      `La repartition (${breakdownSum.toFixed(2)} €) ne correspond pas au total saisi ` +
        `(${entry.totalValue.toFixed(2)} €). Ecart de plus de 2 %.`,
      account.provider,
      false,
    );
  }

  await db.$transaction(async (tx) => {
    await tx.valuationSnapshot.upsert({
      where: { assetAccountId_date: { assetAccountId, date } },
      create: {
        profileId,
        assetAccountId,
        date,
        totalValue: entry.totalValue,
        invested: entry.invested ?? null,
        breakdown: entry.breakdown as Record<string, number>,
      },
      update: {
        totalValue: entry.totalValue,
        invested: entry.invested ?? null,
        breakdown: entry.breakdown as Record<string, number>,
      },
    });

    // Une repartition saisie REMPLACE l'integralite des positions de la source.
    //
    // C'est le point delicat. Sur un compte deja synchronise par un connecteur,
    // ajouter les poches saisies aux positions existantes compterait deux fois
    // le meme argent dans la repartition par classe d'actifs. Et laisser en
    // place une poche qui n'est plus renseignee la figerait a sa derniere
    // valeur connue apres un arbitrage.
    //
    // Quand aucune repartition n'est saisie, on ne touche a rien : le total
    // fait foi pour la valeur de la source, et la composition affichee reste la
    // derniere connue. L'interface le dit explicitement.
    if (breakdownSum > 0) {
      await tx.holding.deleteMany({ where: { assetAccountId } });
    }

    for (const bucket of VALUATION_BUCKETS) {
      const value = entry.breakdown[bucket.key];
      if (value === undefined) continue;
      await tx.holding.upsert({
        where: {
          assetAccountId_isin_symbol: {
            assetAccountId,
            isin: `MANUAL-${bucket.key}`,
            symbol: bucket.key,
          },
        },
        create: {
          profileId,
          assetAccountId,
          isin: `MANUAL-${bucket.key}`,
          symbol: bucket.key,
          name: bucket.label,
          assetClass: bucket.key,
          quantity: 1,
          unitPrice: value,
          value,
          currency: 'EUR',
          asOf: date,
        },
        update: { unitPrice: value, value, asOf: date },
      });
    }

    // Une saisie vaut mise a jour : la date de derniere synchronisation le
    // reflete, et l'eventuelle erreur du dernier connecteur est effacee.
    await tx.assetAccount.update({
      where: { id: assetAccountId },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });
  });

  return { totalValue: entry.totalValue, date };
}

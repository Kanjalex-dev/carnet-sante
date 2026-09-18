/**
 * Orchestration de la synchronisation patrimoniale.
 *
 * Regle : l'echec d'une source ne doit jamais empecher les autres de se mettre
 * a jour, ni faire echouer le job. Un connecteur non officiel qui casse est un
 * evenement attendu, pas un incident — il est journalise, affiche dans
 * l'interface, et la valeur precedente reste visible avec sa date.
 */

import { createHash } from 'node:crypto';
import { Prisma, type AssetProvider } from '@prisma/client';
import { db } from '../db';
import { dateOnly } from '@/lib/dates';
import { tradeRepublicConnector } from './connectors/tradeRepublic';
import { yomoniConnector } from './connectors/yomoni';
import type { Connector, ConnectorSnapshot, SyncOutcome } from './connectors/types';
import { snapshotConsolidated } from './portfolio';
import { syncBenchmarks } from './quotes';

const CONNECTORS: Record<string, Connector> = {
  TRADE_REPUBLIC: tradeRepublicConnector,
  YOMONI: yomoniConnector,
};

export function getConnector(provider: AssetProvider): Connector | null {
  return CONNECTORS[provider] ?? null;
}

export function listConnectors(): { provider: string; label: string; unofficial: boolean }[] {
  return Object.values(CONNECTORS).map((c) => ({
    provider: c.provider,
    label: c.label,
    unofficial: c.unofficial,
  }));
}

async function persistSnapshot(
  profileId: string,
  assetAccountId: string,
  snapshot: ConnectorSnapshot,
): Promise<{ holdings: number; transactions: number }> {
  const date = dateOnly(snapshot.asOf);

  // Les positions fermees doivent disparaitre : on remplace l'ensemble plutot
  // que de faire un upsert ligne a ligne, sinon un titre vendu resterait
  // eternellement affiche.
  await db.holding.deleteMany({ where: { assetAccountId } });

  if (snapshot.holdings.length > 0) {
    await db.holding.createMany({
      data: snapshot.holdings.map((h) => ({
        profileId,
        assetAccountId,
        isin: h.isin ?? null,
        symbol: h.symbol ?? null,
        name: h.name,
        assetClass: h.assetClass,
        quantity: new Prisma.Decimal(h.quantity),
        unitPrice: new Prisma.Decimal(h.unitPrice),
        value: new Prisma.Decimal(h.value),
        costBasis: h.costBasis !== undefined ? new Prisma.Decimal(h.costBasis) : null,
        currency: h.currency,
        asOf: snapshot.asOf,
      })),
      skipDuplicates: true,
    });
  }

  if (snapshot.cashValue > 0) {
    await db.holding.create({
      data: {
        profileId,
        assetAccountId,
        symbol: 'CASH',
        name: 'Liquidites',
        assetClass: 'CASH',
        quantity: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(snapshot.cashValue),
        value: new Prisma.Decimal(snapshot.cashValue),
        currency: 'EUR',
        asOf: snapshot.asOf,
      },
    });
  }

  await db.valuationSnapshot.upsert({
    where: { assetAccountId_date: { assetAccountId, date } },
    create: {
      profileId,
      assetAccountId,
      date,
      totalValue: new Prisma.Decimal(snapshot.totalValue),
      breakdown: snapshot.holdings.reduce<Record<string, number>>((acc, h) => {
        acc[h.assetClass] = (acc[h.assetClass] ?? 0) + h.value;
        return acc;
      }, {}),
    },
    update: { totalValue: new Prisma.Decimal(snapshot.totalValue) },
  });

  let transactionsInserted = 0;
  if (snapshot.transactions && snapshot.transactions.length > 0) {
    const rows = snapshot.transactions.map((t) => {
      const base = t.externalId
        ? `${assetAccountId}|${t.externalId}`
        : `${assetAccountId}|${t.date.toISOString().slice(0, 10)}|${t.amount}|${t.name ?? ''}`;
      return {
        profileId,
        assetAccountId,
        date: dateOnly(t.date),
        type: t.type,
        isin: t.isin ?? null,
        symbol: t.symbol ?? null,
        name: t.name ?? null,
        quantity: t.quantity !== undefined ? new Prisma.Decimal(t.quantity) : null,
        price: t.price !== undefined ? new Prisma.Decimal(t.price) : null,
        amount: new Prisma.Decimal(t.amount),
        fees: t.fees !== undefined ? new Prisma.Decimal(t.fees) : null,
        currency: t.currency,
        externalId: t.externalId ?? null,
        fingerprint: createHash('sha256').update(base).digest('hex').slice(0, 40),
      };
    });
    const result = await db.assetTransaction.createMany({
      data: rows,
      skipDuplicates: true,
    });
    transactionsInserted = result.count;
  }

  return { holdings: snapshot.holdings.length, transactions: transactionsInserted };
}

export async function syncAccount(
  profileId: string,
  assetAccountId: string,
): Promise<SyncOutcome> {
  const started = Date.now();
  const account = await db.assetAccount.findFirst({
    where: { id: assetAccountId, profileId },
  });
  if (!account) {
    return {
      ok: false,
      provider: 'MANUAL',
      message: 'Compte introuvable.',
      durationMs: Date.now() - started,
    };
  }

  const connector = getConnector(account.provider);
  if (!connector) {
    return {
      ok: false,
      provider: account.provider,
      message: `Aucun connecteur pour ${account.provider}.`,
      durationMs: Date.now() - started,
    };
  }

  try {
    if (!(await connector.isConfigured())) {
      throw new Error(
        `Le connecteur ${connector.label} n'est pas configure. Voir les variables d'environnement.`,
      );
    }
    const snapshot = await connector.fetchSnapshot(assetAccountId);
    const { holdings, transactions } = await persistSnapshot(
      profileId,
      assetAccountId,
      snapshot,
    );

    await db.assetAccount.update({
      where: { id: assetAccountId },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });
    await db.syncLog.create({
      data: {
        profileId,
        provider: account.provider,
        ok: true,
        message: `${holdings} position(s), ${transactions} operation(s)`,
        durationMs: Date.now() - started,
      },
    });

    return {
      ok: true,
      provider: account.provider,
      message: `${holdings} position(s) mises a jour.`,
      holdingsUpserted: holdings,
      transactionsInserted: transactions,
      totalValue: snapshot.totalValue,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.assetAccount.update({
      where: { id: assetAccountId },
      data: { lastSyncError: message },
    });
    await db.syncLog.create({
      data: {
        profileId,
        provider: account.provider,
        ok: false,
        message: message.slice(0, 500),
        durationMs: Date.now() - started,
      },
    });
    return {
      ok: false,
      provider: account.provider,
      message,
      durationMs: Date.now() - started,
    };
  }
}

/** Synchronise toutes les sources actives, puis enregistre le point consolide. */
export async function syncAll(profileId: string): Promise<SyncOutcome[]> {
  const accounts = await db.assetAccount.findMany({
    where: { profileId, isActive: true },
  });
  const outcomes: SyncOutcome[] = [];

  for (const account of accounts) {
    // La saisie manuelle n'a rien a aller chercher : la synchroniser ne ferait
    // que produire une erreur trompeuse quand aucune valeur n'a encore ete saisie.
    if (account.provider === 'YOMONI' || account.provider === 'MANUAL') continue;
    outcomes.push(await syncAccount(profileId, account.id));
  }

  try {
    await syncBenchmarks();
  } catch (error) {
    console.error('[sync] cotations indisponibles :', error);
  }

  try {
    await snapshotConsolidated(profileId);
  } catch (error) {
    console.error('[sync] point consolide non enregistre :', error);
  }

  return outcomes;
}

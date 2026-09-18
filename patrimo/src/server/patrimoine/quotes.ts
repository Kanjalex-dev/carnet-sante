/**
 * Fournisseur de cotations.
 *
 * Choix de Stooq : gratuit, sans cle, sans quota agressif, et renvoie du CSV
 * simple a parser. Ses limites, assumees : pas de garantie de disponibilite, une
 * couverture inegale sur les ETF europeens, et des donnees de fin de journee
 * seulement — ce qui suffit pour un suivi patrimonial, ou l'intraday n'apporte
 * rien d'autre que de l'anxiete.
 *
 * A VERIFIER : la disponibilite et le format de Stooq peuvent changer. Si les
 * cotations cessent d'arriver, la valorisation retombe sur le dernier cours
 * connu et l'interface le signale, plutot que d'afficher une valeur fausse.
 */

import { db } from '../db';
import { env } from '@/lib/env';
import { dateOnly } from '@/lib/dates';

export interface QuotePoint {
  date: Date;
  close: number;
}

const STOOQ_BASE = 'https://stooq.com/q/d/l/';

/** Indices de reference proposes par defaut. */
export const DEFAULT_BENCHMARKS = [
  { key: 'CAC40', label: 'CAC 40', symbol: '^fchi' },
  { key: 'MSCI_WORLD', label: 'MSCI World (proxy IWDA)', symbol: 'iwda.uk' },
  { key: 'SP500', label: 'S&P 500', symbol: '^spx' },
  { key: 'STOXX600', label: 'Stoxx Europe 600', symbol: '^stoxx' },
];

async function fetchStooq(
  symbol: string,
  from: Date,
  to: Date,
): Promise<QuotePoint[]> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const url = `${STOOQ_BASE}?s=${encodeURIComponent(symbol)}&d1=${fmt(from)}&d2=${fmt(to)}&i=d`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'patrimo/1.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Stooq a repondu ${response.status} pour ${symbol}.`);
  }

  const text = await response.text();
  // Stooq renvoie "No data" en texte brut quand le symbole est inconnu.
  if (!text.includes('Date,Open')) {
    throw new Error(`Aucune donnee Stooq pour le symbole "${symbol}".`);
  }

  const lines = text.trim().split('\n').slice(1);
  const points: QuotePoint[] = [];
  for (const line of lines) {
    const [date, , , , close] = line.split(',');
    const value = Number(close);
    if (!date || !Number.isFinite(value)) continue;
    points.push({ date: new Date(`${date}T00:00:00Z`), close: value });
  }
  return points;
}

/** Recupere et stocke l'historique d'un symbole. Renvoie le nombre de points ajoutes. */
export async function syncQuotes(
  symbol: string,
  days = 400,
): Promise<{ inserted: number; latest: QuotePoint | null }> {
  if (env.quotesProvider === 'none') return { inserted: 0, latest: null };

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const points = await fetchStooq(symbol, from, to);
  if (points.length === 0) return { inserted: 0, latest: null };

  const existing = await db.quote.findMany({
    where: { symbol, date: { gte: dateOnly(from) } },
    select: { date: true },
  });
  const known = new Set(existing.map((e) => e.date.toISOString().slice(0, 10)));

  const toInsert = points.filter(
    (p) => !known.has(p.date.toISOString().slice(0, 10)),
  );
  if (toInsert.length > 0) {
    await db.quote.createMany({
      data: toInsert.map((p) => ({ symbol, date: p.date, close: p.close })),
      skipDuplicates: true,
    });
  }

  return { inserted: toInsert.length, latest: points[points.length - 1] };
}

export async function getQuoteSeries(
  symbol: string,
  from: Date,
): Promise<QuotePoint[]> {
  const rows = await db.quote.findMany({
    where: { symbol, date: { gte: dateOnly(from) } },
    orderBy: { date: 'asc' },
  });
  return rows.map((r) => ({ date: r.date, close: r.close.toNumber() }));
}

export async function ensureBenchmarks(): Promise<void> {
  for (const b of DEFAULT_BENCHMARKS) {
    await db.benchmark.upsert({
      where: { key: b.key },
      create: { key: b.key, label: b.label, symbol: b.symbol, enabled: true },
      update: {},
    });
  }
}

/** Met a jour les cotations de tous les indices actives. */
export async function syncBenchmarks(): Promise<{ symbol: string; inserted: number }[]> {
  await ensureBenchmarks();
  const benchmarks = await db.benchmark.findMany({ where: { enabled: true } });
  const results: { symbol: string; inserted: number }[] = [];
  for (const b of benchmarks) {
    try {
      const { inserted } = await syncQuotes(b.symbol);
      results.push({ symbol: b.symbol, inserted });
    } catch (error) {
      console.error(`[quotes] echec pour ${b.symbol} :`, error);
      results.push({ symbol: b.symbol, inserted: 0 });
    }
  }
  return results;
}

/**
 * Performance normalisee base 100 : c'est la seule facon honnete de comparer un
 * portefeuille a un indice, puisque les montants n'ont rien a voir.
 */
export function rebase100(points: QuotePoint[]): { date: Date; index: number }[] {
  if (points.length === 0) return [];
  const base = points[0].close;
  if (base === 0) return [];
  return points.map((p) => ({ date: p.date, index: (p.close / base) * 100 }));
}

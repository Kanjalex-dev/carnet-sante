/**
 * Connecteur Trade Republic — NON OFFICIEL.
 *
 * Trade Republic ne publie pas d'API. Ce connecteur passe par un pont Python
 * (`scripts/tr_bridge.py`) qui s'appuie sur la bibliotheque `pytr`, laquelle
 * rejoue le protocole websocket de l'application mobile.
 *
 * Ce que cela implique, et qui est affiche dans l'interface :
 *
 *  - l'usage est contraire aux conditions generales de Trade Republic ;
 *  - le connecteur peut cesser de fonctionner sans preavis ;
 *  - une re-authentification 2FA est necessaire quand la session expire.
 *
 * Toute erreur est capturee et journalisee : une panne du connecteur ne doit
 * jamais empecher le reste de l'application de fonctionner.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import type { AssetClass, AssetTxType } from '@prisma/client';
import { env } from '@/lib/env';
import { dateOnly } from '@/lib/dates';
import type {
  Connector,
  ConnectorHolding,
  ConnectorSnapshot,
  ConnectorTransaction,
} from './types';
import { ConnectorError } from './types';

const BRIDGE = path.join(process.cwd(), 'scripts', 'tr_bridge.py');
const TIMEOUT_MS = 90_000;

interface BridgeResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function runBridge<T>(command: string, args: string[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const python = env.pytrPython;
    if (!python) {
      reject(
        new ConnectorError(
          "PYTR_PYTHON n'est pas configure : le connecteur Trade Republic est desactive.",
          'TRADE_REPUBLIC',
          false,
        ),
      );
      return;
    }

    const child = spawn(python, [BRIDGE, command, ...args], {
      env: {
        ...process.env,
        TR_PHONE: env.trPhone,
        TR_PIN: env.trPin,
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new ConnectorError(
          'Le connecteur Trade Republic n\'a pas repondu dans le delai imparti.',
          'TRADE_REPUBLIC',
        ),
      );
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        new ConnectorError(
          `Impossible de lancer le pont Python : ${error.message}`,
          'TRADE_REPUBLIC',
          false,
        ),
      );
    });

    child.on('close', () => {
      clearTimeout(timer);
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        reject(
          new ConnectorError(
            `Le pont Python n'a rien renvoye. Diagnostic : ${stderr.slice(0, 500)}`,
            'TRADE_REPUBLIC',
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(line) as BridgeResponse<T>;
        if (!parsed.ok) {
          reject(
            new ConnectorError(
              parsed.error ?? 'Erreur inconnue du connecteur.',
              'TRADE_REPUBLIC',
            ),
          );
          return;
        }
        resolve(parsed.data as T);
      } catch {
        reject(
          new ConnectorError(
            `Reponse illisible du pont Python : ${line.slice(0, 200)}`,
            'TRADE_REPUBLIC',
          ),
        );
      }
    });
  });
}

/**
 * Deduit la classe d'actif a partir de l'ISIN et du nom.
 *
 * Heuristique, et assumee comme telle : il n'existe pas de champ fiable dans la
 * reponse. Un ETF se reconnait presque toujours a son nom (UCITS, ETF, indice),
 * et le pays de l'ISIN donne le reste. A corriger a la main dans l'interface si
 * une ligne est mal classee.
 */
export function inferAssetClass(name: string, isin?: string): AssetClass {
  const upper = name.toUpperCase();
  if (/\b(ETF|UCITS|INDEX|MSCI|S&P|STOXX|FTSE|NASDAQ|TRACKER)\b/.test(upper)) {
    return 'ETF';
  }
  if (/\b(BOND|OBLIG|TREASURY|GOVIES|AGGREGATE)\b/.test(upper)) return 'BOND';
  if (/\b(BITCOIN|ETHEREUM|CRYPTO|BTC|ETH)\b/.test(upper)) return 'CRYPTO';
  if (/\b(REIT|SIIC|IMMOBILIER|PROPERTY)\b/.test(upper)) return 'REAL_ESTATE';
  if (isin && /^(XF|CRYP)/.test(isin)) return 'CRYPTO';
  return 'EQUITY';
}

/** Traduit un type d'evenement Trade Republic vers notre nomenclature. */
function mapEventType(eventType: string | null | undefined, amount: number): AssetTxType {
  const type = (eventType ?? '').toUpperCase();
  if (type.includes('SAVINGS') || type.includes('BUY') || type.includes('ORDER_EXECUTED')) {
    return amount < 0 ? 'BUY' : 'SELL';
  }
  if (type.includes('DIVIDEND') || type.includes('COUPON')) return 'DIVIDEND';
  if (type.includes('INTEREST')) return 'INTEREST';
  if (type.includes('PAYMENT_INBOUND') || type.includes('DEPOSIT')) return 'DEPOSIT';
  if (type.includes('PAYMENT_OUTBOUND') || type.includes('WITHDRAWAL')) return 'WITHDRAWAL';
  if (type.includes('FEE') || type.includes('TAX')) return 'FEE';
  return amount < 0 ? 'BUY' : 'SELL';
}

interface BridgePortfolio {
  holdings: {
    isin: string;
    name: string;
    quantity: number;
    unitPrice: number;
    value: number;
    costBasis: number | null;
    currency: string;
  }[];
  cash: number;
  currency: string;
}

interface BridgeTransactions {
  transactions: {
    externalId?: string;
    date: string;
    title?: string;
    subtitle?: string;
    eventType?: string;
    amount?: number;
    currency?: string;
  }[];
}

export const tradeRepublicConnector: Connector = {
  provider: 'TRADE_REPUBLIC',
  label: 'Trade Republic',
  unofficial: true,

  async isConfigured() {
    return env.pytrPython !== '' && env.trPhone !== '' && env.trPin !== '';
  },

  async fetchSnapshot(): Promise<ConnectorSnapshot> {
    const portfolio = await runBridge<BridgePortfolio>('portfolio');

    const holdings: ConnectorHolding[] = portfolio.holdings.map((h) => ({
      isin: h.isin,
      name: h.name,
      assetClass: inferAssetClass(h.name, h.isin),
      quantity: h.quantity,
      unitPrice: h.unitPrice,
      value: h.value,
      costBasis: h.costBasis ?? undefined,
      currency: h.currency || 'EUR',
    }));

    let transactions: ConnectorTransaction[] = [];
    try {
      const raw = await runBridge<BridgeTransactions>('transactions', ['300']);
      transactions = raw.transactions
        .filter((t) => t.amount !== null && t.amount !== undefined)
        .map((t) => {
          const amount = Number(t.amount);
          return {
            externalId: t.externalId,
            date: dateOnly(new Date(t.date)),
            type: mapEventType(t.eventType, amount),
            name: [t.title, t.subtitle].filter(Boolean).join(' — ') || undefined,
            amount,
            currency: t.currency ?? 'EUR',
          };
        })
        .filter((t) => !Number.isNaN(t.date.getTime()));
    } catch (error) {
      // L'historique est un bonus : son echec ne doit pas invalider la
      // valorisation, qui est l'information principale.
      console.error('[trade-republic] historique indisponible :', error);
    }

    const holdingsValue = holdings.reduce((sum, h) => sum + h.value, 0);

    return {
      asOf: new Date(),
      holdings,
      cashValue: portfolio.cash ?? 0,
      totalValue: holdingsValue + (portfolio.cash ?? 0),
      transactions,
    };
  },
};

/** Lance l'authentification interactive. A executer depuis un terminal du VPS. */
export async function tradeRepublicLogin(): Promise<void> {
  await runBridge<{ loggedIn: boolean }>('login');
}

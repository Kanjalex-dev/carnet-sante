/**
 * Alertes.
 *
 * Une alerte n'a de valeur que si elle est rare. Deux garde-fous :
 *
 *  - chaque evenement porte une cle de deduplication, donc une meme situation
 *    ne genere qu'une notification, meme si le job tourne toutes les nuits ;
 *  - chaque type d'alerte a un seuil configurable, et est desactivable.
 */

import type { AlertType, Prisma } from '@prisma/client';
import { db } from '../db';
import { monthRange, currentMonthKey, type MonthKey } from '@/lib/dates';
import { formatEur } from '@/lib/money';
import { getMonthOverview } from '../budget/tracking';
import { getEnvelopeState } from '../budget/envelopes';
import { forecastMonth } from './forecast';

export interface AlertDefaults {
  type: AlertType;
  label: string;
  description: string;
  config: Record<string, number>;
}

export const ALERT_DEFAULTS: AlertDefaults[] = [
  {
    type: 'BUDGET_OVERRUN',
    label: 'Depassement de budget',
    description:
      "Previent quand une categorie atteint un pourcentage de son budget mensuel.",
    config: { percent: 90 },
  },
  {
    type: 'LOW_BALANCE',
    label: 'Solde bas',
    description: 'Previent quand le solde projete passe sous un seuil.',
    config: { thresholdEur: 300 },
  },
  {
    type: 'LARGE_UPCOMING',
    label: 'Gros prelevement a venir',
    description: 'Previent quelques jours avant une echeance importante.',
    config: { thresholdEur: 200, daysAhead: 5 },
  },
  {
    type: 'LARGE_TRANSACTION',
    label: 'Operation inhabituelle',
    description: "Previent lorsqu'une operation depasse un montant.",
    config: { thresholdEur: 500 },
  },
  {
    type: 'NEW_SUBSCRIPTION',
    label: 'Nouvel abonnement',
    description: "Previent quand un nouvel abonnement recurrent est detecte.",
    config: {},
  },
  {
    type: 'PRICE_INCREASE',
    label: "Hausse d'un abonnement",
    description: "Previent quand le montant d'un abonnement augmente.",
    config: { percent: 8 },
  },
  {
    type: 'PORTFOLIO_DRIFT',
    label: 'Derive du portefeuille',
    description:
      "Previent quand la repartition s'ecarte de l'allocation cible.",
    config: { percentPoints: 5 },
  },
  {
    type: 'PORTFOLIO_MOVE',
    label: 'Mouvement de marche',
    description: 'Previent en cas de variation quotidienne importante.',
    config: { percent: 3 },
  },
];

export async function ensureAlertRules(profileId: string): Promise<void> {
  for (const def of ALERT_DEFAULTS) {
    await db.alertRule.upsert({
      where: { profileId_type: { profileId, type: def.type } },
      create: { profileId, type: def.type, config: def.config, enabled: true },
      update: {},
    });
  }
}

async function raise(
  profileId: string,
  type: AlertType,
  dedupeKey: string,
  title: string,
  body: string,
  severity: 'info' | 'warn' | 'critical' = 'info',
  payload?: Record<string, unknown>,
): Promise<boolean> {
  const rule = await db.alertRule.findUnique({
    where: { profileId_type: { profileId, type } },
  });
  if (!rule || !rule.enabled) return false;

  const existing = await db.alertEvent.findUnique({
    where: { profileId_dedupeKey: { profileId, dedupeKey } },
  });
  if (existing) return false;

  await db.alertEvent.create({
    data: {
      profileId,
      ruleId: rule.id,
      title,
      body,
      severity,
      dedupeKey,
      payload: (payload ?? {}) as Prisma.InputJsonValue,
    },
  });
  await db.alertRule.update({
    where: { id: rule.id },
    data: {},
  });
  return true;
}

function configOf(config: unknown, key: string, fallback: number): number {
  if (config && typeof config === 'object' && key in config) {
    const value = (config as Record<string, unknown>)[key];
    if (typeof value === 'number') return value;
  }
  return fallback;
}

/** Evalue toutes les alertes. Appele par le worker, et a chaque import. */
export async function evaluateAlerts(
  profileId: string,
  month?: MonthKey,
): Promise<{ raised: number; details: string[] }> {
  await ensureAlertRules(profileId);
  const profile = await db.profile.findUnique({ where: { id: profileId } });
  const startDay = profile?.monthStartDay ?? 1;
  const targetMonth = month ?? currentMonthKey(startDay);

  const rules = await db.alertRule.findMany({ where: { profileId } });
  const ruleByType = new Map(rules.map((r) => [r.type, r]));
  const details: string[] = [];
  let raised = 0;

  // --- Depassement de budget ou d'enveloppe --------------------------------
  const overrunRule = ruleByType.get('BUDGET_OVERRUN');
  if (overrunRule?.enabled) {
    const threshold = configOf(overrunRule.config, 'percent', 90) / 100;

    if (profile?.budgetMode === 'ENVELOPE') {
      const state = await getEnvelopeState(profileId, targetMonth, startDay);
      for (const envelope of state.envelopes) {
        const budget = envelope.carriedCents + envelope.allocatedCents;
        if (budget <= 0) continue;
        const usage = envelope.spentCents / budget;
        if (usage < threshold) continue;
        const over = envelope.availableCents < 0;
        const ok = await raise(
          profileId,
          'BUDGET_OVERRUN',
          `env:${envelope.id}:${targetMonth}:${over ? 'over' : 'near'}`,
          over
            ? `Enveloppe ${envelope.name} depassee`
            : `Enveloppe ${envelope.name} a ${Math.round(usage * 100)} %`,
          over
            ? `Il manque ${formatEur(Math.abs(envelope.availableCents))}. Reallouer depuis une autre enveloppe.`
            : `${formatEur(envelope.spentCents)} depenses sur ${formatEur(budget)} disponibles.`,
          over ? 'warn' : 'info',
          { envelopeId: envelope.id, month: targetMonth },
        );
        if (ok) {
          raised += 1;
          details.push(`Enveloppe ${envelope.name}`);
        }
      }
    } else {
      const overview = await getMonthOverview(profileId, targetMonth, startDay);
      for (const category of overview.categories) {
        if (category.usage === null || category.usage < threshold) continue;
        const over = category.usage > 1;
        const ok = await raise(
          profileId,
          'BUDGET_OVERRUN',
          `cat:${category.categoryId}:${targetMonth}:${over ? 'over' : 'near'}`,
          over
            ? `Budget ${category.name} depasse`
            : `Budget ${category.name} a ${Math.round(category.usage * 100)} %`,
          `${formatEur(category.spentCents)} depenses sur ${formatEur(category.budgetCents ?? 0)} budgetes.`,
          over ? 'warn' : 'info',
          { categoryId: category.categoryId, month: targetMonth },
        );
        if (ok) {
          raised += 1;
          details.push(`Budget ${category.name}`);
        }
      }
    }
  }

  // --- Solde bas et gros prelevements --------------------------------------
  const forecast = await forecastMonth(profileId, targetMonth, startDay);

  const lowRule = ruleByType.get('LOW_BALANCE');
  if (lowRule?.enabled) {
    const thresholdCents = configOf(lowRule.config, 'thresholdEur', 300) * 100;
    if (forecast.projectedBalanceCents < thresholdCents) {
      const ok = await raise(
        profileId,
        'LOW_BALANCE',
        `low:${targetMonth}:${Math.floor(forecast.projectedBalanceCents / 10000)}`,
        'Solde de fin de mois sous le seuil',
        forecast.negativeOn
          ? `Solde projete ${formatEur(forecast.projectedBalanceCents)}, negatif a partir du ${forecast.negativeOn.toISOString().slice(0, 10)}.`
          : `Solde projete ${formatEur(forecast.projectedBalanceCents)} en fin de mois.`,
        forecast.projectedBalanceCents < 0 ? 'critical' : 'warn',
        { month: targetMonth },
      );
      if (ok) {
        raised += 1;
        details.push('Solde bas');
      }
    }
  }

  const upcomingRule = ruleByType.get('LARGE_UPCOMING');
  if (upcomingRule?.enabled) {
    const thresholdCents = configOf(upcomingRule.config, 'thresholdEur', 200) * 100;
    const daysAhead = configOf(upcomingRule.config, 'daysAhead', 5);
    const limit = Date.now() + daysAhead * 86_400_000;
    for (const item of forecast.upcoming) {
      if (Math.abs(item.amountCents) < thresholdCents) continue;
      if (item.expectedDate.getTime() > limit) continue;
      const ok = await raise(
        profileId,
        'LARGE_UPCOMING',
        `up:${item.seriesId}:${item.expectedDate.toISOString().slice(0, 10)}`,
        `Prelevement de ${formatEur(Math.abs(item.amountCents))} attendu`,
        `${item.label} — prevu le ${item.expectedDate.toISOString().slice(0, 10)}.`,
        'info',
        { seriesId: item.seriesId },
      );
      if (ok) {
        raised += 1;
        details.push(item.label);
      }
    }
  }

  // --- Operation inhabituelle ----------------------------------------------
  const largeRule = ruleByType.get('LARGE_TRANSACTION');
  if (largeRule?.enabled) {
    const thresholdCents = configOf(largeRule.config, 'thresholdEur', 500) * 100;
    const { start, end } = monthRange(targetMonth, startDay);
    const large = await db.transaction.findMany({
      where: {
        profileId,
        date: { gte: start, lt: end },
        isTransfer: false,
        amount: { lt: -thresholdCents / 100 },
      },
      select: { id: true, label: true, amount: true, date: true },
    });
    for (const tx of large) {
      const ok = await raise(
        profileId,
        'LARGE_TRANSACTION',
        `big:${tx.id}`,
        `Operation de ${formatEur(Math.abs(Math.round(tx.amount.toNumber() * 100)))}`,
        `${tx.label} le ${tx.date.toISOString().slice(0, 10)}.`,
        'info',
        { transactionId: tx.id },
      );
      if (ok) {
        raised += 1;
        details.push(tx.label);
      }
    }
  }

  // --- Nouveaux abonnements et hausses -------------------------------------
  const newSubRule = ruleByType.get('NEW_SUBSCRIPTION');
  if (newSubRule?.enabled) {
    const recent = await db.recurringSeries.findMany({
      where: {
        profileId,
        isSubscription: true,
        status: 'ACTIVE',
        firstSeen: { gte: new Date(Date.now() - 90 * 86_400_000) },
      },
    });
    for (const s of recent) {
      const ok = await raise(
        profileId,
        'NEW_SUBSCRIPTION',
        `newsub:${s.id}`,
        `Nouvel abonnement : ${s.merchant ?? s.label}`,
        `${formatEur(Math.abs(Math.round(s.amountLast.toNumber() * 100)))} — ${s.occurrences} prelevements observes.`,
        'info',
        { seriesId: s.id },
      );
      if (ok) {
        raised += 1;
        details.push(`Abonnement ${s.label}`);
      }
    }
  }

  const priceRule = ruleByType.get('PRICE_INCREASE');
  if (priceRule?.enabled) {
    const threshold = configOf(priceRule.config, 'percent', 8) / 100;
    const { listSubscriptions } = await import('./recurring');
    const subscriptions = await listSubscriptions(profileId);
    for (const s of subscriptions) {
      if (!s.priceIncrease || s.priceIncrease.percent < threshold) continue;
      const ok = await raise(
        profileId,
        'PRICE_INCREASE',
        `price:${s.id}:${s.priceIncrease.toCents}`,
        `${s.merchant ?? s.label} : +${(s.priceIncrease.percent * 100).toFixed(0)} %`,
        `De ${formatEur(Math.abs(s.priceIncrease.fromCents))} a ${formatEur(Math.abs(s.priceIncrease.toCents))}.`,
        'warn',
        { seriesId: s.id },
      );
      if (ok) {
        raised += 1;
        details.push(`Hausse ${s.label}`);
      }
    }
  }

  return { raised, details };
}

export async function listAlerts(profileId: string, limit = 50) {
  return db.alertEvent.findMany({
    where: { profileId },
    include: { rule: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function markAlertsRead(profileId: string, ids?: string[]): Promise<number> {
  const result = await db.alertEvent.updateMany({
    where: ids
      ? { profileId, id: { in: ids }, readAt: null }
      : { profileId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

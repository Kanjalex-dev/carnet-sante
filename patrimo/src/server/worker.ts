/**
 * Worker de fond.
 *
 * Trois taches planifiees. Elles tournent dans un processus separe du serveur
 * web : une synchronisation qui traine ne doit jamais retarder une page.
 *
 *   03:15  synchronisation patrimoniale + cotations + point consolide
 *   06:30  detection des recurrences et evaluation des alertes
 *   07:00  reconduction des budgets au premier jour du mois
 *
 * Toute exception est capturee : un worker qui meurt silencieusement est pire
 * qu'un worker qui se plaint.
 *
 * Chaque tache boucle sur les profils, un par un. Un profil dont l'analyse
 * echoue ne doit pas empecher les autres de tourner : c'est la raison du
 * try/catch a l'interieur de la boucle plutot qu'autour.
 */

import cron from 'node-cron';
import { db } from './db';
import { currentMonthKey } from '@/lib/dates';
import { syncAll } from './patrimoine/sync';
import { detectRecurring } from './analysis/recurring';
import { detectInternalTransfers } from './import/ingest';
import { evaluateAlerts } from './analysis/alerts';
import { rolloverBudgets } from './budget/tracking';

const TZ = process.env.TZ ?? 'Europe/Paris';

function log(message: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

async function guard(name: string, task: () => Promise<void>): Promise<void> {
  const started = Date.now();
  try {
    await task();
    log(`${name} : ok (${Date.now() - started} ms)`);
  } catch (error) {
    log(`${name} : ECHEC — ${error instanceof Error ? error.message : error}`);
  }
}

/** Profils a traiter, du plus ancien au plus recent. */
async function allProfiles() {
  return db.profile.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, monthStartDay: true },
  });
}

/** Execute une tache pour chaque profil, sans qu'un echec en bloque un autre. */
async function forEachProfile(
  label: string,
  task: (profile: { id: string; name: string; monthStartDay: number }) => Promise<string>,
): Promise<void> {
  const profiles = await allProfiles();
  if (profiles.length === 0) {
    log(`  ${label} : aucun profil configure`);
    return;
  }
  for (const profile of profiles) {
    try {
      const detail = await task(profile);
      log(`  [${profile.name}] ${detail}`);
    } catch (error) {
      log(
        `  [${profile.name}] ECHEC — ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

async function jobPatrimoine(): Promise<void> {
  await forEachProfile('patrimoine', async (profile) => {
    const outcomes = await syncAll(profile.id);
    if (outcomes.length === 0) return 'aucune source automatique';
    return outcomes
      .map((o) => `${o.provider} ${o.ok ? 'ok' : 'echec'} — ${o.message}`)
      .join(' ; ');
  });
}

async function jobAnalysis(): Promise<void> {
  await forEachProfile('analyse', async (profile) => {
    const transfers = await detectInternalTransfers(profile.id);
    const recurring = await detectRecurring(profile.id);
    const alerts = await evaluateAlerts(profile.id);
    return (
      `${transfers} virement(s) apparie(s), ${recurring.seriesFound} recurrence(s), ` +
      `${alerts.raised} alerte(s)`
    );
  });
}

async function jobRollover(): Promise<void> {
  const today = new Date().getUTCDate();
  await forEachProfile('reconduction', async (profile) => {
    // Chaque profil a son propre jour de debut de mois budgetaire.
    if (today !== profile.monthStartDay) return 'hors du jour de reconduction';
    const count = await rolloverBudgets(
      profile.id,
      currentMonthKey(profile.monthStartDay),
    );
    return `${count} budget(s) reconduit(s)`;
  });
}

async function main(): Promise<void> {
  log(`demarrage — fuseau ${TZ}`);

  cron.schedule('15 3 * * *', () => void guard('patrimoine', jobPatrimoine), {
    timezone: TZ,
  });
  cron.schedule('30 6 * * *', () => void guard('analyse', jobAnalysis), {
    timezone: TZ,
  });
  cron.schedule('0 7 * * *', () => void guard('reconduction', jobRollover), {
    timezone: TZ,
  });

  // Une passe au demarrage : apres un redemarrage du serveur, on ne veut pas
  // attendre le lendemain pour voir les alertes a jour.
  if (process.env.WORKER_RUN_ON_BOOT !== 'false') {
    await guard('analyse (demarrage)', jobAnalysis);
  }

  log('taches planifiees, en attente');
}

main().catch((error) => {
  console.error('[worker] arret sur erreur fatale :', error);
  process.exit(1);
});

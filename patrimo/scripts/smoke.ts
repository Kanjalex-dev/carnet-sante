/**
 * Test de bout en bout sur une base reelle.
 *
 * Genere douze mois d'operations plausibles (salaire, loyer, abonnements,
 * courses, essence, achats ponctuels), les importe par le vrai pipeline, puis
 * verifie que chaque brique produit un resultat coherent.
 *
 *   npx tsx scripts/smoke.ts
 *
 * ATTENTION : ce script EFFACE les donnees de la base pointee par DATABASE_URL.
 * A n'executer que sur une base de developpement.
 */

import { db } from '../src/server/db';
import { seedIfEmpty } from '../src/server/seed';
import { hashPin } from '../src/lib/crypto';
import { ingestFile, detectInternalTransfers } from '../src/server/import/ingest';
import { detectRecurring, listSubscriptions } from '../src/server/analysis/recurring';
import { buildRecommendations } from '../src/server/analysis/recommendations';
import { evaluateAlerts, listAlerts } from '../src/server/analysis/alerts';
import { recategorize } from '../src/server/categorize/engine';
import { forecastMonth } from '../src/server/analysis/forecast';
import { getMonthOverview, setBudget, suggestBudgets } from '../src/server/budget/tracking';
import {
  getEnvelopeState,
  switchMode,
  allocate,
  moveBetweenEnvelopes,
  computeAgeOfMoney,
} from '../src/server/budget/envelopes';
import { recordValuation } from '../src/server/patrimoine/manualEntry';
import { getNetWorth, snapshotConsolidated, portfolioSignals } from '../src/server/patrimoine/portfolio';
import { formatEur } from '../src/lib/money';
import { currentMonthKey, addMonths } from '../src/lib/dates';

const REFERENCE = new Date('2026-09-15T00:00:00Z');

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Genere un releve CSV plausible sur `months` mois. */
function buildStatement(months: number): string {
  const lines = ['Date operation;Date valeur;Libelle;Montant'];
  const end = new Date(REFERENCE);

  for (let back = months - 1; back >= 0; back--) {
    const cursor = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - back, 1),
    );
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const date = (day: number) => `${pad(day)}/${pad(m)}/${y}`;

    // Revenus et charges fixes.
    lines.push(`${date(2)};${date(2)};VIREMENT SEPA RECU LA REDOUTE SALAIRE;3 250,00`);
    lines.push(`${date(5)};${date(5)};PRLV SEPA LOYER APPARTEMENT MANDAT L8827;-1 150,00`);
    lines.push(`${date(6)};${date(6)};PRLV SEPA EDF ELECTRICITE REF ${y}${pad(m)}01;-92,40`);
    lines.push(`${date(8)};${date(8)};PRLV SEPA ORANGE FRANCE ECH/${String(y).slice(2)}${pad(m)}08;-39,99`);
    lines.push(`${date(10)};${date(10)};PRLV SEPA SPOTIFY AB ECH/${String(y).slice(2)}${pad(m)}10 MANDAT XY82HD;-11,99`);
    // Netflix augmente a partir du 7e mois : la detection de hausse doit le voir.
    const netflix = back < 6 ? '-19,99' : '-15,49';
    lines.push(`${date(12)};${date(12)};PRLV SEPA NETFLIX COM MANDAT NFX901;${netflix}`);
    lines.push(`${date(12)};${date(12)};PRLV SEPA DEEZER PREMIUM MANDAT DZ441;-11,99`);
    lines.push(`${date(15)};${date(15)};PRLV SEPA BASIC FIT FRANCE MANDAT BF77;-29,99`);
    lines.push(`${date(20)};${date(20)};PRLV SEPA MAIF ASSURANCE HABITATION;-24,50`);
    lines.push(`${date(25)};${date(25)};VIR SEPA YOMONI VERSEMENT PROGRAMME;-300,00`);

    // Depenses variables.
    for (const day of [3, 9, 16, 23, 28]) {
      const amount = (48 + ((back * 7 + day) % 35)).toFixed(2).replace('.', ',');
      lines.push(`${date(day)};${date(day)};CARTE 4589 CARREFOUR MARKET LILLE ${pad(day)}/${pad(m)};-${amount}`);
    }
    for (const day of [7, 21]) {
      const amount = (62 + ((back * 3 + day) % 18)).toFixed(2).replace('.', ',');
      lines.push(`${date(day)};${date(day)};CARTE 4589 TOTAL ACCESS MOUVAUX;-${amount}`);
    }
    for (const day of [4, 11, 18, 26]) {
      const amount = (9 + ((back + day) % 13)).toFixed(2).replace('.', ',');
      lines.push(`${date(day)};${date(day)};CARTE 4589 BOULANGERIE DU CENTRE;-${amount}`);
    }
    // Petites depenses repetees chez un meme marchand : doit declencher une piste.
    for (const day of [1, 3, 5, 8, 10, 14, 17, 22, 24, 29]) {
      lines.push(`${date(day)};${date(day)};CARTE 4589 STARBUCKS LILLE;-5,80`);
    }

    // Achats ponctuels, plus gros certains mois.
    if (back % 3 === 0) {
      lines.push(`${date(14)};${date(14)};ACHAT CB AMAZON EU SARL ${pad(14)}/${pad(m)}/${y};-129,90`);
    }
    if (back === 0) {
      // Derive volontaire sur le mois courant : la recommandation doit la voir.
      lines.push(`${date(9)};${date(9)};CARTE 4589 FNAC LILLE;-349,00`);
      lines.push(`${date(11)};${date(11)};CARTE 4589 DARTY VILLENEUVE;-289,00`);
    }
  }

  return lines.join('\n');
}

function ok(condition: boolean, label: string, detail = ''): boolean {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return condition;
}

async function main() {
  const failures: string[] = [];
  const check = (condition: boolean, label: string, detail = '') => {
    if (!ok(condition, label, detail)) failures.push(label);
  };

  console.log('\n── Reinitialisation ──');
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "AlertEvent","AlertRule","EnvelopeTransfer","EnvelopeAllocation",
      "Envelope","Budget","Transaction","ImportBatch","CategoryRule","RecurringSeries",
      "Category","Account","Profile","Holding","ValuationSnapshot","AssetTransaction",
      "AssetAccount","Quote","Benchmark","SyncLog" RESTART IDENTITY CASCADE;
  `);
  const owner = await db.profile.create({
    data: { name: 'Moi', pinHash: hashPin('1234'), isOwner: true, onboarded: true },
  });
  const P = owner.id;
  // Un second profil, cree des le depart : chaque assertion de cloisonnement
  // ci-dessous verifie qu'il ne voit jamais rien des donnees du premier.
  const guest = await db.profile.create({
    data: { name: 'Ami', pinHash: hashPin('5678'), onboarded: true },
  });
  const seeded = await seedIfEmpty(P);
  await seedIfEmpty(guest.id);
  console.log(`  ${seeded.categories} categories, ${seeded.rules} regles`);

  const account = await db.account.findFirstOrThrow({ where: { profileId: P } });

  console.log('\n── Import ──');
  const csv = buildStatement(12);
  const first = await ingestFile(P, account.id, 'releve.csv', Buffer.from(csv, 'utf8'));
  console.log(
    `  ${first.parsed} lignes lues, ${first.inserted} inserees, profil « ${first.profile} »`,
  );
  check(first.inserted === first.parsed, 'toutes les lignes sont inserees');
  check(first.rejected === 0, 'aucune ligne rejetee', `${first.rejected}`);
  check(
    first.categorized.byRule > first.parsed * 0.85,
    'plus de 85 % categorise par regles seules',
    `${first.categorized.byRule}/${first.parsed}`,
  );

  console.log('\n── Reimport du meme fichier ──');
  const second = await ingestFile(P, account.id, 'releve.csv', Buffer.from(csv, 'utf8'));
  check(second.inserted === 0, 'aucun doublon cree', `${second.inserted} inseree(s)`);
  check(
    second.duplicates === second.parsed,
    'toutes les lignes reconnues comme doublons',
  );

  console.log('\n── Import chevauchant ──');
  // Un export des 3 derniers mois, apres un export des 12 mois : classique.
  const overlap = buildStatement(3);
  const third = await ingestFile(P, account.id, 'releve-3m.csv', Buffer.from(overlap, 'utf8'));
  check(third.inserted === 0, 'un export chevauchant ne cree rien de neuf', `${third.inserted}`);

  console.log('\n── Recurrences et abonnements ──');
  await detectInternalTransfers(P);
  const recurring = await detectRecurring(P);
  console.log(`  ${recurring.seriesFound} series, ${recurring.subscriptions} abonnements`);
  const subscriptions = await listSubscriptions(P);
  const names = subscriptions.map((s) => `${s.merchant ?? s.label}`).join(', ');
  console.log(`  detectes : ${names}`);
  check(subscriptions.length >= 5, 'au moins 5 abonnements detectes', `${subscriptions.length}`);
  check(
    subscriptions.some((s) => /SPOTIFY/i.test(`${s.label} ${s.merchant}`)),
    'Spotify reconnu comme abonnement',
  );
  const netflix = subscriptions.find((s) => /NETFLIX/i.test(`${s.label} ${s.merchant}`));
  check(netflix !== undefined, 'Netflix reconnu comme abonnement');
  check(
    netflix?.priceIncrease != null,
    'hausse de tarif Netflix detectee',
    netflix?.priceIncrease
      ? `${(netflix.priceIncrease.percent * 100).toFixed(0)} %`
      : 'aucune',
  );

  console.log('\n── Recommandations ──');
  const month = currentMonthKey(1, REFERENCE);
  const recommendations = await buildRecommendations(P, month, 1);
  for (const r of recommendations.slice(0, 6)) {
    console.log(
      `  · ${r.title}${r.monthlySavingCents ? ` (${formatEur(r.monthlySavingCents)}/mois)` : ''}`,
    );
  }
  check(recommendations.length > 0, 'au moins une recommandation');
  check(
    recommendations.some((r) => r.kind === 'DUPLICATE_SUBSCRIPTION'),
    'doublon Spotify/Deezer identifie',
  );
  check(
    recommendations.some((r) => r.kind === 'PRICE_INCREASE'),
    'hausse de tarif remontee comme piste',
  );
  check(
    recommendations.some((r) => r.kind === 'FREQUENT_SMALL_SPEND'),
    'petites depenses repetees identifiees',
  );

  // Un virement d'epargne recurrent n'est pas un abonnement, et le loyer n'est
  // pas dans la meme famille que Netflix : sans cette separation, le "cout des
  // abonnements" melange 12 € de streaming et 1 150 € de loyer.
  check(
    !subscriptions.some((s) => /YOMONI/i.test(`${s.label} ${s.merchant}`)),
    "le virement d'epargne n'est pas compte comme un abonnement",
  );
  const streaming = subscriptions.filter((s) => s.kind === 'SUBSCRIPTION');
  const charges = subscriptions.filter((s) => s.kind === 'FIXED_CHARGE');
  console.log(
    `  ${streaming.length} abonnement(s) · ${charges.length} charge(s) fixe(s)`,
  );
  check(
    charges.some((s) => /LOYER/i.test(`${s.label} ${s.merchant}`)),
    'le loyer est classe en charge fixe, pas en abonnement',
  );
  const streamingTotal = streaming.reduce(
    (sum, s) => sum + Math.abs(s.monthlyEquivalentCents),
    0,
  );
  check(
    streamingTotal < 30000,
    'le cout mensuel des abonnements reste dans un ordre de grandeur credible',
    formatEur(streamingTotal),
  );

  console.log('\n── Mode Suivi ──');
  const overview = await getMonthOverview(P, month, 1);
  console.log(
    `  entrees ${formatEur(overview.incomeCents)}, depenses ${formatEur(overview.expenseCents)}, net ${formatEur(overview.netCents)}`,
  );
  check(overview.incomeCents > 0, 'des entrees sont comptees');
  check(overview.expenseCents > 0, 'des depenses sont comptees');
  check(
    overview.categories.every((c) => c.spentCents >= 0),
    'aucune depense negative dans la repartition',
  );
  const shareSum = overview.categories.reduce((s, c) => s + c.share, 0);
  check(Math.abs(shareSum - 1) < 0.01, 'les parts somment a 100 %', shareSum.toFixed(4));

  const suggestions = await suggestBudgets(P, month, 6, 1);
  check(suggestions.length > 0, 'des budgets sont proposes', `${suggestions.length}`);
  for (const s of suggestions.slice(0, 3)) {
    await setBudget(P, s.categoryId, month, s.suggestedCents);
  }
  const withBudgets = await getMonthOverview(P, month, 1);
  check(
    withBudgets.categories.some((c) => c.budgetCents !== null),
    'les budgets apparaissent dans la vue',
  );

  console.log('\n── Bascule vers le mode Enveloppes ──');
  const transactionsBefore = await db.transaction.count();
  const categorizedBefore = await db.transaction.count({
    where: { categoryId: { not: null } },
  });
  const switched = await switchMode(P, 'ENVELOPE', month);
  console.log(`  ${switched.details}`);
  const transactionsAfter = await db.transaction.count();
  const categorizedAfter = await db.transaction.count({
    where: { categoryId: { not: null } },
  });
  check(
    transactionsBefore === transactionsAfter,
    'aucune operation perdue a la bascule',
    `${transactionsBefore} → ${transactionsAfter}`,
  );
  check(
    categorizedBefore === categorizedAfter,
    'aucune categorisation perdue',
    `${categorizedBefore} → ${categorizedAfter}`,
  );

  const envelopes = await getEnvelopeState(P, month, 1);
  check(envelopes.envelopes.length > 0, 'des enveloppes existent', `${envelopes.envelopes.length}`);
  check(
    envelopes.envelopes.some((e) => e.allocatedCents > 0),
    'les budgets ont ete repris en allocations',
  );
  console.log(`  a repartir : ${formatEur(envelopes.toBeBudgetedCents)}`);
  console.log(`  age de l'argent : ${envelopes.ageOfMoneyDays ?? '—'} jours`);
  check(envelopes.ageOfMoneyDays !== null, "l'age de l'argent est calculable");
  check(
    (envelopes.ageOfMoneyDays ?? 0) > 0 && (envelopes.ageOfMoneyDays ?? 0) < 400,
    "l'age de l'argent est dans un ordre de grandeur plausible",
    `${envelopes.ageOfMoneyDays} j`,
  );

  console.log('\n── Reallocation ──');
  const [source, target] = envelopes.envelopes.filter((e) => e.allocatedCents > 0);
  if (source && target) {
    const before = { from: source.allocatedCents, to: target.allocatedCents };
    await moveBetweenEnvelopes(P, source.id, target.id, month, 5000, 'test');
    const after = await getEnvelopeState(P, month, 1);
    const newSource = after.envelopes.find((e) => e.id === source.id)!;
    const newTarget = after.envelopes.find((e) => e.id === target.id)!;
    check(
      newSource.allocatedCents === before.from - 5000,
      'la source est debitee',
      `${formatEur(newSource.allocatedCents)}`,
    );
    check(
      newTarget.allocatedCents === before.to + 5000,
      'la destination est creditee',
      `${formatEur(newTarget.allocatedCents)}`,
    );
    check(
      after.totalAllocatedCents === envelopes.totalAllocatedCents,
      'le total alloue est conserve (jeu a somme nulle)',
    );
  }

  console.log('\n── Retour au mode Suivi ──');
  const back = await switchMode(P, 'TRACKING', month);
  console.log(`  ${back.details}`);
  const envelopesKept = await db.envelope.count();
  const allocationsKept = await db.envelopeAllocation.count();
  check(envelopesKept > 0, 'les enveloppes sont conservees', `${envelopesKept}`);
  check(allocationsKept > 0, 'les allocations sont conservees', `${allocationsKept}`);
  check(
    (await db.transaction.count()) === transactionsBefore,
    'toujours aucune operation perdue',
  );

  console.log('\n── Previsionnel ──');
  const forecast = await forecastMonth(P, month, 1, REFERENCE);
  console.log(
    `  solde actuel ${formatEur(forecast.currentBalanceCents)} (${forecast.balanceSource}) → projete ${formatEur(forecast.projectedBalanceCents)}`,
  );
  console.log(`  ${forecast.upcoming.length} echeance(s) restante(s) ce mois-ci`);
  check(forecast.dailyPath.length > 0, 'une trajectoire journaliere est produite');
  check(
    forecast.projectedLowCents <= forecast.projectedBalanceCents &&
      forecast.projectedBalanceCents <= forecast.projectedHighCents,
    'la fourchette encadre la projection',
  );

  // Garde-fou contre une regression connue : si l'on exclut des depenses
  // variables toute transaction rattachee a une serie recurrente, les courses et
  // les cafes disparaissent du previsionnel sans etre reprojetes, et le rythme
  // journalier s'effondre a quelques centimes. Le jeu de donnees genere ici
  // porte environ 20 a 45 € de depenses variables par jour.
  const dailyRate = forecast.daysRemaining
    ? Math.abs(forecast.estimatedVariableCents / forecast.daysRemaining)
    : 0;
  console.log(`  rythme variable estime : ${formatEur(Math.round(dailyRate))}/jour`);
  check(
    dailyRate > 1000,
    'le rythme des depenses variables est plausible',
    `${formatEur(Math.round(dailyRate))}/jour`,
  );

  console.log('\n── Alertes ──');
  const alerts = await evaluateAlerts(P, month);
  console.log(`  ${alerts.raised} alerte(s) : ${alerts.details.slice(0, 4).join(', ')}`);
  const again = await evaluateAlerts(P, month);
  check(again.raised === 0, 'une seconde evaluation ne redeclenche rien (deduplication)', `${again.raised}`);

  console.log('\n── Patrimoine ──');
  const yomoni = await db.assetAccount.create({
    data: { profileId: P, provider: 'YOMONI', label: 'Yomoni Vie' },
  });
  await recordValuation(P, yomoni.id, {
    asOf: new Date('2026-08-31T00:00:00Z'),
    totalValue: 11800,
    invested: 10800,
    breakdown: { ETF: 7080, BOND: 2360, EURO_FUND: 2360 },
  });
  await recordValuation(P, yomoni.id, {
    asOf: REFERENCE,
    totalValue: 12150,
    invested: 11100,
    breakdown: { ETF: 7290, BOND: 2430, EURO_FUND: 2430 },
  });

  const tr = await db.assetAccount.create({
    data: { profileId: P, provider: 'TRADE_REPUBLIC', label: 'Trade Republic' },
  });
  await db.holding.createMany({
    data: [
      {
        profileId: P,
        assetAccountId: tr.id,
        isin: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World UCITS ETF',
        assetClass: 'ETF',
        quantity: 45,
        unitPrice: 98.4,
        value: 4428,
        costBasis: 3900,
        asOf: REFERENCE,
      },
      {
        profileId: P,
        assetAccountId: tr.id,
        isin: 'FR0000120073',
        name: 'Air Liquide',
        assetClass: 'EQUITY',
        quantity: 12,
        unitPrice: 168.2,
        value: 2018.4,
        costBasis: 1850,
        asOf: REFERENCE,
      },
      {
        profileId: P,
        assetAccountId: tr.id,
        symbol: 'CASH',
        name: 'Liquidites',
        assetClass: 'CASH',
        quantity: 1,
        unitPrice: 1250,
        value: 1250,
        asOf: REFERENCE,
      },
    ],
  });
  await db.valuationSnapshot.create({
    data: { profileId: P, assetAccountId: tr.id, date: REFERENCE, totalValue: 7696.4 },
  });
  await db.assetAccount.updateMany({
    where: { profileId: P },
    data: { lastSyncAt: REFERENCE },
  });

  await snapshotConsolidated(P);
  const netWorth = await getNetWorth(P);
  console.log(`  patrimoine total : ${formatEur(netWorth.totalCents)}`);
  console.log(
    `  repartition : ${netWorth.allocation.map((a) => `${a.label} ${Math.round(a.share * 100)} %`).join(', ')}`,
  );
  check(netWorth.totalCents > 0, 'le patrimoine consolide est calcule');
  check(
    netWorth.bySource.length === 2,
    'les deux sources sont agregees',
    `${netWorth.bySource.length}`,
  );
  const allocSum = netWorth.allocation.reduce((s, a) => s + a.share, 0);
  check(Math.abs(allocSum - 1) < 0.01, 'la repartition somme a 100 %', allocSum.toFixed(4));
  check(
    netWorth.bySource.find((s) => s.provider === 'TRADE_REPUBLIC')?.unofficial === true,
    'la source Trade Republic est signalee comme non officielle',
  );

  // Garde-fou : les evolutions doivent s'appuyer sur des points consolides, pas
  // sur une somme des derniers releves par source. Sinon, la premiere
  // synchronisation d'un second compte affiche une hausse fantaisiste.
  const changes = Object.entries(netWorth.changes);
  const absurd = changes.filter(
    ([, c]) => c !== null && Math.abs(c.percent) > 0.5,
  );
  check(
    absurd.length === 0,
    'aucune evolution absurde sur une periode courte',
    absurd.map(([k, c]) => `${k}: ${((c!.percent) * 100).toFixed(0)} %`).join(', ') || 'aucune',
  );

  const signals = await portfolioSignals(P);
  console.log(`  ${signals.length} signal(aux) :`);
  for (const signal of signals.slice(0, 5)) {
    console.log(`    · ${signal.title}`);
    console.log(`      ${signal.computation}`);
  }
  check(
    signals.every((s) => s.computation.length > 0),
    'chaque signal porte son calcul',
  );

  console.log('\n── Age de l argent, verification independante ──');
  const age = await computeAgeOfMoney(P);
  check(age !== null, 'calculable', `${age} jours`);

  // -------------------------------------------------------------------------
  // Etancheite entre profils.
  //
  // C'est la verification qui compte le plus dans cette version : l'application
  // est faite pour etre partagee, et un profil qui verrait les operations d'un
  // autre serait un defaut bien plus grave qu'un chiffre faux. On interroge donc
  // le second profil, qui n'a JAMAIS rien importe, par tous les chemins de
  // lecture de l'application.
  // -------------------------------------------------------------------------
  console.log('\n── Etancheite entre profils ──');
  const G = guest.id;

  const guestTx = await db.transaction.count({ where: { profileId: G } });
  check(guestTx === 0, 'le second profil ne voit aucune operation', `${guestTx}`);

  const guestOverview = await getMonthOverview(G, month, 1);
  check(
    guestOverview.expenseCents === 0 && guestOverview.incomeCents === 0,
    'son tableau de bord est vide',
    `${guestOverview.expenseCents} / ${guestOverview.incomeCents}`,
  );

  const guestSubs = await listSubscriptions(G);
  check(guestSubs.length === 0, 'aucun abonnement ne fuit vers lui', `${guestSubs.length}`);

  const guestForecast = await forecastMonth(G, month, 1);
  check(
    guestForecast.currentBalanceCents === 0,
    'son solde est nul',
    `${guestForecast.currentBalanceCents}`,
  );

  const guestNetWorth = await getNetWorth(G);
  check(guestNetWorth.totalCents === 0, 'son patrimoine est vide', `${guestNetWorth.totalCents}`);

  const guestAlerts = await listAlerts(G, 50);
  check(guestAlerts.length === 0, 'aucune alerte ne fuit vers lui', `${guestAlerts.length}`);

  const guestAccounts = await db.account.count({ where: { profileId: G } });
  check(
    guestAccounts === 1,
    'il a son propre compte par defaut, distinct',
    `${guestAccounts}`,
  );

  // Les categories sont propres a chaque profil : renommer chez l'un ne doit
  // rien changer chez l'autre.
  const ownerCat = await db.category.findFirstOrThrow({
    where: { profileId: P, parentId: null },
  });
  const guestTwin = await db.category.findFirst({
    where: { profileId: G, name: ownerCat.name, parentId: null },
  });
  check(
    guestTwin !== null && guestTwin.id !== ownerCat.id,
    'les plans de categories sont distincts',
  );

  // Une ecriture croisee doit echouer : le compte vise n'appartient pas au profil.
  let crossWriteBlocked = false;
  try {
    await ingestFile(G, account.id, 'vol.csv', Buffer.from(buildStatement(1), 'utf8'));
  } catch {
    crossWriteBlocked = true;
  }
  check(crossWriteBlocked, "un profil ne peut pas ecrire sur le compte d'un autre");

  // Idem pour une recategorisation ciblant l'operation d'un autre profil.
  const victim = await db.transaction.findFirstOrThrow({ where: { profileId: P } });
  const guestCategory = await db.category.findFirstOrThrow({ where: { profileId: G } });
  let crossCategorizeBlocked = false;
  try {
    await recategorize(G, victim.id, guestCategory.id);
  } catch {
    crossCategorizeBlocked = true;
  }
  check(
    crossCategorizeBlocked,
    "un profil ne peut pas recategoriser l'operation d'un autre",
  );

  console.log(`\n${'─'.repeat(50)}`);
  if (failures.length === 0) {
    console.log('Toutes les verifications passent.');
  } else {
    console.log(`${failures.length} verification(s) en echec :`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

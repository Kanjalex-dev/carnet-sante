/**
 * Amorcage manuel : `npm run db:seed`.
 *
 * L'amorcage se fait normalement tout seul a la creation du code PIN. Ce script
 * sert a le relancer, par exemple apres avoir ajoute des regles au catalogue.
 */

import { seedIfEmpty } from '../src/server/seed';
import { db } from '../src/server/db';

async function main() {
  // Chaque profil a son propre plan de categories : on les reamorce tous.
  const profiles = await db.profile.findMany({ select: { id: true, name: true } });
  if (profiles.length === 0) {
    console.log('Aucun profil : ouvre l\'application pour creer le premier.');
    return;
  }
  for (const profile of profiles) {
    const result = await seedIfEmpty(profile.id);
    console.log(
      `[${profile.name}] ${result.categories} categorie(s) disponibles, ` +
        `${result.rules} nouvelle(s) regle(s).`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

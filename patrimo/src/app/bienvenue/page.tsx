import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { currentProfile } from '@/server/auth';
import { Onboarding } from '@/components/Onboarding';

export const dynamic = 'force-dynamic';

/**
 * Parcours de demarrage, montre une seule fois par profil.
 *
 * Il ne sert pas a presenter l'application : il sert a ce qu'au bout de deux
 * minutes il y ait des chiffres a l'ecran. Une application de budget vide ne
 * demontre rien, et c'est a ce moment precis qu'on l'abandonne. Deux chemins
 * seulement, l'import d'un releve ou la saisie d'un solde de depart, et un
 * bouton pour passer.
 */
export default async function BienvenuePage() {
  const profile = await currentProfile();
  if (!profile) redirect('/login');
  if (profile.onboarded) redirect('/');

  const accounts = await db.account.findMany({
    where: { profileId: profile.id, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const transactionCount = await db.transaction.count({
    where: { profileId: profile.id },
  });

  return (
    <main className="page mx-auto min-h-dvh max-w-screen-sm px-4 pb-12">
      <Onboarding
        name={profile.name}
        accounts={accounts}
        alreadyHasData={transactionCount > 0}
      />
    </main>
  );
}

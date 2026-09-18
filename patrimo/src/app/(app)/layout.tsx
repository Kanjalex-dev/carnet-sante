import { redirect } from 'next/navigation';
import { TabBar } from '@/components/TabBar';
import { db } from '@/server/db';
import { currentProfile } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Le middleware verifie la signature du cookie ; ici on verifie que le profil
  // existe encore. Un profil supprime pendant qu'une session etait ouverte doit
  // retomber sur l'ecran de choix, pas sur une page vide.
  const profile = await currentProfile();
  if (!profile) redirect('/login');
  if (!profile.onboarded) redirect('/bienvenue');

  const unread = await db.alertEvent.count({
    where: { profileId: profile.id, readAt: null },
  });

  return (
    <div className="mx-auto min-h-dvh max-w-screen-sm">
      {/* pb-24 : la barre d'onglets est en position fixe, il faut lui reserver
          sa hauteur plus la zone du geste d'accueil. */}
      <main className="page px-4 pb-24">{children}</main>
      <TabBar alertCount={unread} />
    </div>
  );
}

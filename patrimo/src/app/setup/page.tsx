import { redirect } from 'next/navigation';
import { isConfigured } from '@/server/auth';
import { FirstProfileForm } from '@/components/ProfileGate';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  // Une fois le premier profil cree, cette page ne doit plus jamais etre
  // atteignable : c'est le seul endroit ou un profil se cree sans code.
  if (await isConfigured()) redirect('/login');

  return (
    <main className="page mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-center text-2xl font-semibold">Bienvenue</h1>
      <p className="mt-2 text-center text-sm text-muted">
        Ce premier profil sera celui qui administre l&apos;application. Tu
        pourras en ajouter d&apos;autres ensuite — chacun avec ses propres
        comptes, invisibles des autres.
      </p>
      <div className="mt-8">
        <FirstProfileForm />
      </div>
      <p className="mt-6 text-center text-xs text-muted">
        Le code n&apos;est pas recuperable. Note-le quelque part.
      </p>
    </main>
  );
}

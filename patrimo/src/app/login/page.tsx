import { redirect } from 'next/navigation';
import { isConfigured, listProfiles } from '@/server/auth';
import { ProfileGate } from '@/components/ProfileGate';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!(await isConfigured())) redirect('/setup');
  const params = await searchParams;
  const profiles = await listProfiles();

  return (
    <main className="page mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-center text-2xl font-semibold">Patrimo</h1>
      <div className="mt-8">
        <ProfileGate profiles={profiles} nextPath={params.next ?? '/'} />
      </div>
    </main>
  );
}

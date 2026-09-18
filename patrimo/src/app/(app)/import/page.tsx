import { db } from '@/server/db';
import { requireProfile } from '@/server/auth';
import { ImportForm } from '@/components/ImportForm';
import { Section } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const profile = await requireProfile();
  const [accounts, batches] = await Promise.all([
    db.account.findMany({
      where: { profileId: profile.id, isActive: true },
      orderBy: { name: 'asc' },
    }),
    db.importBatch.findMany({
      where: { profileId: profile.id },
      include: { account: true },
      orderBy: { importedAt: 'desc' },
      take: 10,
    }),
  ]);

  return (
    <>
      <header className="pt-2">
        <h1 className="text-2xl font-semibold">Importer un releve</h1>
        <p className="mt-1 text-sm text-muted">
          CSV, OFX ou QIF. Reimporter un fichier deja traite ne cree aucun
          doublon.
        </p>
      </header>

      <div className="mt-4">
        <ImportForm
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        />
      </div>

      <Section title="Ou trouver le fichier">
        <div className="card space-y-2 text-sm text-muted">
          <p>
            <strong className="text-ink">Prefere l&apos;OFX quand ta banque le
            propose.</strong>{' '}
            Il porte un identifiant unique par operation et le solde du releve :
            la deduplication devient exacte, et le previsionnel s&apos;ancre sur
            un solde reel plutot que sur un cumul.
          </p>
          <p>
            Depuis un iPhone : telecharge le releve depuis l&apos;app de ta
            banque, puis choisis « Enregistrer dans Fichiers ». Le selecteur
            ci-dessus y accede.
          </p>
        </div>
      </Section>

      {batches.length > 0 && (
        <Section title="Imports recents">
          <ul className="card space-y-3 text-sm">
            {batches.map((batch) => (
              <li key={batch.id}>
                <div className="flex justify-between">
                  <span className="truncate font-medium">{batch.filename}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {batch.importedAt.toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {batch.account.name} · {batch.profileUsed} ·{' '}
                  {batch.rowsInserted} ajoutee(s), {batch.rowsDuplicate} doublon(s)
                  {batch.rowsRejected > 0 && `, ${batch.rowsRejected} ignoree(s)`}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

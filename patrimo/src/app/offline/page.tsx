export const metadata = { title: 'Hors ligne — Patrimo' };

export default function OfflinePage() {
  return (
    <main className="page mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">Hors ligne</h1>
      <p className="mt-2 text-sm text-muted">
        Aucune connexion au serveur. Les donnees financieres ne sont
        volontairement pas mises en cache : mieux vaut aucune valeur qu&apos;un
        solde perime.
      </p>
      <p className="mt-4 text-sm text-muted">
        Reessaie une fois la connexion revenue.
      </p>
    </main>
  );
}

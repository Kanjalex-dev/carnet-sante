import { NextResponse } from 'next/server';
import { ingestFile, detectInternalTransfers } from '@/server/import/ingest';
import { detectRecurring } from '@/server/analysis/recurring';
import { evaluateAlerts } from '@/server/analysis/alerts';
import { ImportError } from '@/server/import/types';
import { guard } from '@/server/apiGuard';

// Le parsing et la categorisation peuvent depasser les limites par defaut sur
// un gros historique : on autorise explicitement une execution longue.
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await guard();
  if (!auth.ok) return auth.response;
  const { profile } = auth;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Requete illisible.' }, { status: 400 });
  }

  const file = form.get('file');
  const accountId = form.get('accountId');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
  }
  if (typeof accountId !== 'string' || accountId === '') {
    return NextResponse.json({ error: 'Compte manquant.' }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'Fichier trop volumineux (15 Mo maximum).' },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await ingestFile(profile.id, accountId, file.name, buffer);

    // Ces trois passes sont enchainees ici plutot que laissees au job de nuit :
    // apres un import, on veut voir le resultat complet tout de suite.
    const transfers = await detectInternalTransfers(profile.id);
    const recurring = await detectRecurring(profile.id);
    const alerts = await evaluateAlerts(profile.id);

    return NextResponse.json({
      ...summary,
      transfersPaired: transfers,
      recurring,
      alertsRaised: alerts.raised,
    });
  } catch (error) {
    if (error instanceof ImportError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('[import] echec :', error);
    return NextResponse.json(
      { error: "Echec de l'import. Voir les journaux du serveur." },
      { status: 500 },
    );
  }
}

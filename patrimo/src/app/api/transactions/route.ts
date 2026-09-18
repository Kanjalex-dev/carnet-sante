import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { recategorize } from '@/server/categorize/engine';
import { guard } from '@/server/apiGuard';

const patchSchema = z.object({
  transactionId: z.string(),
  categoryId: z.string(),
  applyToSimilar: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await guard();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requete invalide.' }, { status: 400 });
  }

  try {
    const result = await recategorize(
      auth.profile.id,
      parsed.data.transactionId,
      parsed.data.categoryId,
      { learn: true, applyToSimilar: parsed.data.applyToSimilar ?? false },
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Echec.' },
      { status: 400 },
    );
  }
}

const noteSchema = z.object({
  transactionId: z.string(),
  notes: z.string().max(500).nullable(),
});

export async function PUT(request: Request) {
  const auth = await guard();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requete invalide.' }, { status: 400 });
  }
  // updateMany avec le profil dans le filtre : une operation qui n'appartient
  // pas au profil ne correspond a rien et rien n'est ecrit.
  const result = await db.transaction.updateMany({
    where: { id: parsed.data.transactionId, profileId: auth.profile.id },
    data: { notes: parsed.data.notes },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Operation introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

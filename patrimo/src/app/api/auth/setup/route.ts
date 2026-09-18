import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createProfile,
  createSession,
  isConfigured,
  setSessionCookie,
} from '@/server/auth';
import { seedIfEmpty } from '@/server/seed';

const schema = z.object({ name: z.string().min(1).max(24), pin: z.string() });

export async function POST(request: Request) {
  // Verrou : cette route cree un profil sans avoir a connaitre de code. Elle ne
  // doit servir qu'une fois, a la toute premiere ouverture. Les profils
  // suivants passent par /api/profiles, qui exige le code du proprietaire.
  if (await isConfigured()) {
    return NextResponse.json(
      { error: 'Un profil existe deja sur cette installation.' },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Saisie invalide.' }, { status: 400 });
  }

  try {
    const profile = await createProfile(parsed.data.name, parsed.data.pin);
    // Le plan de categories et les regles de depart sont crees maintenant :
    // le premier import doit pouvoir categoriser immediatement.
    await seedIfEmpty(profile.id);
    await setSessionCookie(await createSession(profile.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Echec.' },
      { status: 400 },
    );
  }
}

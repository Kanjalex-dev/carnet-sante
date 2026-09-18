/**
 * Gestion des profils.
 *
 * Toutes les operations qui touchent a la vie des profils — creation,
 * suppression, reinitialisation d'un code — sont reservees au profil
 * proprietaire ET protegees par son code. Deux raisons :
 *
 *  - sur un telephone, un ecran de confirmation seul se declenche par accident,
 *    et une suppression de profil emporte des annees d'historique ;
 *  - la session peut rester ouverte un mois (cookie de 30 jours) : exiger le
 *    code au moment de l'acte, et pas seulement a l'ouverture, est ce qui rend
 *    l'application partageable sans arriere-pensee.
 *
 * Le renommage n'exige pas le code : c'est reversible et sans consequence.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createProfile,
  deleteProfile,
  listProfiles,
  renameProfile,
  requireOwner,
  requireProfile,
  resetPinAsOwner,
  attemptPin,
  createSession,
  setSessionCookie,
} from '@/server/auth';
import { seedIfEmpty } from '@/server/seed';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().min(1).max(24),
    pin: z.string(),
    ownerPin: z.string(),
    color: z.string().max(9).optional(),
  }),
  z.object({ action: z.literal('rename'), id: z.string(), name: z.string().min(1).max(24) }),
  z.object({ action: z.literal('delete'), id: z.string(), ownerPin: z.string() }),
  z.object({
    action: z.literal('resetPin'),
    id: z.string(),
    ownerPin: z.string(),
    newPin: z.string(),
  }),
  // Changement de profil sans passer par la deconnexion : on exige quand meme
  // le code du profil vise, sinon n'importe qui ayant la session ouverte
  // basculerait librement d'un profil a l'autre.
  z.object({ action: z.literal('switch'), id: z.string(), pin: z.string() }),
]);

export async function GET() {
  await requireProfile();
  return NextResponse.json({ profiles: await listProfiles() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requete invalide.' }, { status: 400 });
  }
  const input = parsed.data;

  try {
    if (input.action === 'switch') {
      await requireProfile();
      const result = await attemptPin(input.id, input.pin);
      if (!result.ok) {
        return NextResponse.json({ error: 'Code incorrect.' }, { status: 401 });
      }
      await setSessionCookie(await createSession(result.profileId));
      return NextResponse.json({ ok: true });
    }

    if (input.action === 'rename') {
      const me = await requireProfile();
      // Chacun peut renommer le sien ; le proprietaire peut renommer les autres.
      if (input.id !== me.id && !me.isOwner) throw new Error('FORBIDDEN');
      await renameProfile(input.id, input.name);
      return NextResponse.json({ ok: true });
    }

    const owner = await requireOwner();

    switch (input.action) {
      case 'create': {
        const check = await attemptPin(owner.id, input.ownerPin);
        if (!check.ok) {
          return NextResponse.json({ error: 'Code incorrect.' }, { status: 401 });
        }
        const profile = await createProfile(input.name, input.pin, input.color);
        // Le nouveau profil part avec son propre plan de categories, ses regles
        // et son compte par defaut : il est utilisable immediatement.
        await seedIfEmpty(profile.id);
        return NextResponse.json({ id: profile.id });
      }

      case 'delete':
        await deleteProfile(owner.id, input.id, input.ownerPin);
        return NextResponse.json({ ok: true });

      case 'resetPin':
        await resetPinAsOwner(owner.id, input.id, input.ownerPin, input.newPin);
        return NextResponse.json({ ok: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Echec.';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Non authentifie.' }, { status: 401 });
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json(
        { error: "Reserve au profil proprietaire de l'installation." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

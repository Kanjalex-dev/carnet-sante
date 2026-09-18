/**
 * Garde d'acces des routes d'API.
 *
 * Le middleware Next verifie la signature du cookie, mais il tourne sur le
 * runtime Edge et n'a pas acces a la base : il ne peut pas savoir si le profil
 * designe existe encore, ni le donner a la route. Chaque route protegee commence
 * donc par `guard()`, qui renvoie soit le profil, soit la reponse 401 a
 * retourner telle quelle.
 *
 * Ce detour evite le piege classique du multi-utilisateur : une route qui lit
 * un identifiant fourni par le client et fait confiance. Ici, l'identifiant du
 * profil ne peut venir que du cookie signe.
 */

import { NextResponse } from 'next/server';
import { currentProfile, type SessionProfile } from './auth';

export type Guarded =
  | { ok: true; profile: SessionProfile }
  | { ok: false; response: NextResponse };

export async function guard(): Promise<Guarded> {
  const profile = await currentProfile();
  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Non authentifie.' }, { status: 401 }),
    };
  }
  return { ok: true, profile };
}

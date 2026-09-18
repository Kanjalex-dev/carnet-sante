/**
 * Authentification et profils.
 *
 * L'application est concue pour etre installee une fois et partagee avec un
 * proche. Chaque profil a son propre code PIN et ses propres donnees ; aucun
 * profil ne voit celles d'un autre. Ce n'est pas un systeme de comptes complet :
 * il n'y a ni email, ni mot de passe, ni recuperation. Le modele de menace est
 * realiste — quelqu'un qui tombe sur l'URL, un telephone laisse deverrouille,
 * un proche curieux — pas un attaquant determine. On protege donc contre :
 *
 *  - la force brute, par un verrouillage progressif apres echecs, par profil ;
 *  - le vol de cookie, par un cookie httpOnly + SameSite=Lax + Secure ;
 *  - la lecture de la base, par un PIN hache en scrypt ;
 *  - la curiosite entre profils, par le cloisonnement de toutes les requetes.
 *
 * Ce qui n'est PAS protege : un attaquant qui a un acces root au serveur, ni un
 * profil proprietaire qui voudrait lire la base directement. C'est assume, et
 * c'est la raison pour laquelle l'hebergement doit rester personnel : partager
 * l'application avec quelqu'un, c'est lui demander de vous faire confiance sur
 * l'administration de la machine.
 */

import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';
import { hashPin, verifyPin } from '@/lib/crypto';
import { db } from './db';

const COOKIE_NAME = 'patrimo_session';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/** Palette proposee a la creation d'un profil, pour les distinguer d'un coup d'oeil. */
export const PROFILE_COLORS = [
  '#3d7ea6',
  '#c2703d',
  '#5b8c5a',
  '#8a5a9e',
  '#b5544f',
  '#4f6d7a',
];

function secret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function createSession(profileId: string): Promise<string> {
  return new SignJWT({ pid: profileId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(profileId)
    .setIssuedAt()
    .setExpirationTime(`${env.sessionTtlHours}h`)
    .sign(secret());
}

/** Renvoie l'identifiant du profil porte par le jeton, ou null. */
export async function readSession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    const pid = typeof payload.pid === 'string' ? payload.pid : payload.sub;
    return typeof pid === 'string' && pid.length > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * L'application est-elle REELLEMENT servie en HTTPS ?
 *
 * Cette fonction repare un bug qui rendait la connexion impossible en local.
 * L'ancienne version posait le cookie avec l'attribut `Secure` des lors que
 * NODE_ENV valait "production" — or NODE_ENV vaut "production" dans l'image
 * Docker meme quand on ouvre l'application sur http://localhost:3000. Le
 * navigateur recevait donc un cookie `Secure` sur une origine en clair, le
 * jetait en silence, et la page de connexion revenait sans le moindre message
 * d'erreur. Safari refuse ce cookie y compris sur localhost.
 *
 * L'erreur de fond etait de lier une propriete du TRANSPORT (chiffre ou non) a
 * une propriete de la CONSTRUCTION (production ou developpement). On regarde
 * donc le transport lui-meme :
 *
 *  - derriere Caddy, c'est `x-forwarded-proto` qui fait foi, car le conteneur
 *    recoit du HTTP en clair sur le reseau interne de Compose ;
 *  - a defaut d'en-tete, APP_URL dit sous quelle adresse l'application est
 *    publiee.
 *
 * Consequence voulue : `Secure` reste actif sur un vrai deploiement HTTPS, et
 * disparait uniquement la ou il empecherait de se connecter.
 */
async function servedOverHttps(): Promise<boolean> {
  try {
    const incoming = await headers();
    const forwarded = incoming.get('x-forwarded-proto');
    if (forwarded) {
      // L'en-tete peut porter une liste : « https, http ». Le premier compte.
      return forwarded.split(',')[0].trim().toLowerCase() === 'https';
    }
  } catch {
    // Appel hors contexte de requete : on retombe sur APP_URL.
  }
  return env.appUrl.toLowerCase().startsWith('https://');
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await servedOverHttps(),
    path: '/',
    maxAge: env.sessionTtlHours * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type SessionProfile = {
  id: string;
  name: string;
  color: string;
  isOwner: boolean;
  budgetMode: 'TRACKING' | 'ENVELOPE';
  monthStartDay: number;
  currency: string;
  riskProfile: number;
  horizonYears: number;
  aiEnabled: boolean;
  onboarded: boolean;
};

/**
 * Profil de la session en cours, ou null.
 *
 * Le jeton peut designer un profil supprime entre-temps : on relit donc
 * toujours la base plutot que de faire confiance au contenu du cookie.
 */
export async function currentProfile(): Promise<SessionProfile | null> {
  const store = await cookies();
  const profileId = await readSession(store.get(COOKIE_NAME)?.value);
  if (!profileId) return null;
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      name: true,
      color: true,
      isOwner: true,
      budgetMode: true,
      monthStartDay: true,
      currency: true,
      riskProfile: true,
      horizonYears: true,
      aiEnabled: true,
      onboarded: true,
    },
  });
  return profile;
}

/**
 * A appeler en tete de chaque route protegee et de chaque page.
 *
 * Renvoie le profil plutot qu'un booleen : impossible d'oublier de cloisonner
 * une requete si l'identifiant du profil est la seule facon d'obtenir le droit
 * de continuer.
 */
export async function requireProfile(): Promise<SessionProfile> {
  const profile = await currentProfile();
  if (!profile) throw new Error('UNAUTHORIZED');
  return profile;
}

/** Comme requireProfile, mais reserve au profil proprietaire de l'installation. */
export async function requireOwner(): Promise<SessionProfile> {
  const profile = await requireProfile();
  if (!profile.isOwner) throw new Error('FORBIDDEN');
  return profile;
}

/** Liste affichee sur l'ecran de choix du profil. Ne divulgue aucun secret. */
export async function listProfiles(): Promise<
  { id: string; name: string; color: string; isOwner: boolean; locked: boolean }[]
> {
  const rows = await db.profile.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, color: true, isOwner: true, lockedUntil: true },
  });
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    isOwner: r.isOwner,
    locked: r.lockedUntil !== null && r.lockedUntil > now,
  }));
}

export type PinResult =
  | { ok: true; profileId: string }
  | { ok: false; reason: 'wrong'; remaining: number }
  | { ok: false; reason: 'locked'; until: Date }
  | { ok: false; reason: 'not_configured' };

/** Verifie le PIN d'un profil et gere son compteur d'echecs. */
export async function attemptPin(profileId: string, pin: string): Promise<PinResult> {
  const profile = await db.profile.findUnique({ where: { id: profileId } });
  if (!profile) return { ok: false, reason: 'not_configured' };

  if (profile.lockedUntil && profile.lockedUntil > new Date()) {
    return { ok: false, reason: 'locked', until: profile.lockedUntil };
  }

  if (verifyPin(pin, profile.pinHash)) {
    await db.profile.update({
      where: { id: profile.id },
      data: { failedPinAttempts: 0, lockedUntil: null, lastSeenAt: new Date() },
    });
    return { ok: true, profileId: profile.id };
  }

  const failed = profile.failedPinAttempts + 1;
  if (failed >= MAX_ATTEMPTS) {
    const until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
    await db.profile.update({
      where: { id: profile.id },
      data: { failedPinAttempts: 0, lockedUntil: until },
    });
    return { ok: false, reason: 'locked', until };
  }

  await db.profile.update({
    where: { id: profile.id },
    data: { failedPinAttempts: failed },
  });
  return { ok: false, reason: 'wrong', remaining: MAX_ATTEMPTS - failed };
}

export async function isConfigured(): Promise<boolean> {
  return (await db.profile.count()) > 0;
}

function assertPinFormat(pin: string, label = 'Le code'): void {
  if (!/^\d{4,12}$/.test(pin)) {
    throw new Error(`${label} doit contenir entre 4 et 12 chiffres.`);
  }
}

function assertNameFormat(name: string): string {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 24) {
    throw new Error('Le prenom doit faire entre 1 et 24 caracteres.');
  }
  return clean;
}

/**
 * Cree un profil. Le tout premier devient proprietaire de l'installation.
 *
 * Le contenu initial (categories, regles, alertes) est seme par l'appelant :
 * cette fonction ne fait que l'identite, pour rester testable sans base
 * complete.
 */
export async function createProfile(
  name: string,
  pin: string,
  color?: string,
): Promise<{ id: string; isOwner: boolean }> {
  const clean = assertNameFormat(name);
  assertPinFormat(pin);

  const count = await db.profile.count();
  const taken = await db.profile.findUnique({ where: { name: clean } });
  if (taken) throw new Error('Ce prenom est deja utilise par un autre profil.');

  const profile = await db.profile.create({
    data: {
      name: clean,
      pinHash: hashPin(pin),
      isOwner: count === 0,
      color: color ?? PROFILE_COLORS[count % PROFILE_COLORS.length],
      sortOrder: count,
    },
  });
  return { id: profile.id, isOwner: profile.isOwner };
}

export async function renameProfile(profileId: string, name: string): Promise<void> {
  const clean = assertNameFormat(name);
  const taken = await db.profile.findUnique({ where: { name: clean } });
  if (taken && taken.id !== profileId) {
    throw new Error('Ce prenom est deja utilise par un autre profil.');
  }
  await db.profile.update({ where: { id: profileId }, data: { name: clean } });
}

/**
 * Supprime un profil et tout ce qu'il contient.
 *
 * Deux garde-fous : le profil proprietaire n'est pas supprimable (sinon
 * l'installation se retrouve sans administrateur), et la suppression exige le
 * code PIN du proprietaire — un ecran de confirmation seul serait trop facile
 * a declencher par accident sur un telephone.
 */
export async function deleteProfile(ownerId: string, targetId: string, ownerPin: string): Promise<void> {
  const check = await attemptPin(ownerId, ownerPin);
  if (!check.ok) throw new Error('Code incorrect : suppression annulee.');

  const target = await db.profile.findUnique({ where: { id: targetId } });
  if (!target) throw new Error('Profil introuvable.');
  if (target.isOwner) throw new Error('Le profil proprietaire ne peut pas etre supprime.');

  // Les cles etrangeres sont en ON DELETE CASCADE : une seule suppression
  // emporte comptes, transactions, budgets, enveloppes et patrimoine.
  await db.profile.delete({ where: { id: targetId } });
}

export async function changePin(profileId: string, current: string, next: string): Promise<void> {
  const result = await attemptPin(profileId, current);
  if (!result.ok) throw new Error('Code actuel incorrect.');
  assertPinFormat(next, 'Le nouveau code');
  await db.profile.update({
    where: { id: profileId },
    data: { pinHash: hashPin(next) },
  });
}

/**
 * Reinitialise le code d'un autre profil, sur validation du proprietaire.
 *
 * Sans cela, un profil dont on oublie le code est definitivement perdu et la
 * seule issue est de le supprimer avec ses donnees.
 */
export async function resetPinAsOwner(
  ownerId: string,
  targetId: string,
  ownerPin: string,
  newPin: string,
): Promise<void> {
  const check = await attemptPin(ownerId, ownerPin);
  if (!check.ok) throw new Error('Code proprietaire incorrect.');
  assertPinFormat(newPin, 'Le nouveau code');
  await db.profile.update({
    where: { id: targetId },
    data: { pinHash: hashPin(newPin), failedPinAttempts: 0, lockedUntil: null },
  });
}

export async function markOnboarded(profileId: string): Promise<void> {
  await db.profile.update({ where: { id: profileId }, data: { onboarded: true } });
}

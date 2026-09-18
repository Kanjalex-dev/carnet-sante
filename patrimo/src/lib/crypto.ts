/**
 * Chiffrement symetrique des donnees sensibles au repos (IBAN, credentials des
 * connecteurs). AES-256-GCM : confidentialite + authentification, un IV aleatoire
 * par message.
 *
 * Format stocke : `v1.<iv base64url>.<tag base64url>.<chiffre base64url>`
 * Le prefixe de version permettra de faire tourner la cle un jour sans casser
 * les enregistrements existants.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { env } from './env';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, env.encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decrypt(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Charge chiffree illisible ou de version inconnue.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    ALGO,
    env.encryptionKey,
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Chiffre un objet JSON (credentials de connecteur, etat de session). */
export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

// --- Hachage du code PIN ---------------------------------------------------
//
// scrypt plutot que bcrypt : disponible dans la stdlib Node, pas de dependance
// native a compiler dans l'image Docker. Parametres calibres pour ~100 ms.

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(pin.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString(
    'base64url',
  )}$${derived.toString('base64url')}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const derived = scryptSync(pin.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  // Comparaison a temps constant : evite de fuiter la reponse par le timing.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

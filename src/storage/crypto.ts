/**
 * Chiffrement au repos.
 *
 * Modèle : coffre. L'ensemble des données de l'enfant est sérialisé, chiffré,
 * puis écrit comme un seul enregistrement ; les photographies sont chiffrées
 * une par une, à part, parce qu'elles sont volumineuses.
 *
 * Ce modèle évite qu'une donnée de santé se retrouve en clair dans un index
 * IndexedDB. Il ne passe pas à l'échelle sur des milliers d'enregistrements —
 * ce n'est pas l'usage ici (un enfant, quelques dizaines d'événements).
 *
 * La phrase secrète n'est jamais persistée. Perdue, les données sont
 * irrécupérables : c'est le prix d'un chiffrement qui protège réellement.
 */

const PBKDF2_ITERATIONS = 310_000
const SALT_BYTES = 16
const IV_BYTES = 12

export interface KdfParams {
  iterations: number
  salt: number[]
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function newKdfParams(): KdfParams {
  return { iterations: PBKDF2_ITERATIONS, salt: Array.from(randomBytes(SALT_BYTES)) }
}

export async function deriveKey(passphrase: string, params: KdfParams): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(params.salt),
      iterations: params.iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface Sealed {
  iv: number[]
  data: number[]
}

export async function seal(key: CryptoKey, bytes: Uint8Array): Promise<Sealed> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const iv = randomBytes(IV_BYTES)
  // Copie explicite : le type Uint8Array générique n'est pas un BufferSource
  // tant que son buffer peut être un SharedArrayBuffer.
  const source = bytes.slice() as Uint8Array<ArrayBuffer>
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, source)
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(data)) }
}

/** Lève si la clé est mauvaise ou le contenu altéré — AES-GCM est authentifié. */
export async function open(key: CryptoKey, sealed: Sealed): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(sealed.iv) },
    key,
    new Uint8Array(sealed.data),
  )
  return new Uint8Array(plain)
}

export async function sealJSON(key: CryptoKey, value: unknown): Promise<Sealed> {
  return seal(key, new TextEncoder().encode(JSON.stringify(value)))
}

export async function openJSON<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await open(key, sealed))) as T
}

/**
 * Chiffre l'identité de l'appareil : permet de vérifier une phrase secrète
 * sans stocker ni la phrase, ni son empreinte.
 */
export const CANARY = 'carnet-v1'

export async function makeCanary(key: CryptoKey): Promise<Sealed> {
  return sealJSON(key, CANARY)
}

export async function checkCanary(key: CryptoKey, sealed: Sealed): Promise<boolean> {
  try {
    return (await openJSON<string>(key, sealed)) === CANARY
  } catch {
    return false
  }
}

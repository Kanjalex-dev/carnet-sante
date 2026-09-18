/**
 * Acces centralise et valide aux variables d'environnement.
 *
 * On echoue au demarrage plutot qu'a la premiere requete : une cle de
 * chiffrement absente ou malformee doit se voir tout de suite, pas le jour ou
 * l'on essaie de dechiffrer des credentials.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Voir .env.example.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get sessionSecret() {
    const secret = required('SESSION_SECRET');
    if (secret.length < 32) {
      throw new Error(
        'SESSION_SECRET doit faire au moins 32 caracteres. Generer avec : openssl rand -base64 48',
      );
    }
    return secret;
  },
  get encryptionKey() {
    const raw = required('ENCRYPTION_KEY');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY doit etre 32 octets encodes en base64. Generer avec : openssl rand -base64 32',
      );
    }
    return key;
  },
  get sessionTtlHours() {
    return Number(optional('SESSION_TTL_HOURS', '720'));
  },
  get anthropicApiKey() {
    return optional('ANTHROPIC_API_KEY');
  },
  get anthropicModel() {
    return optional('ANTHROPIC_MODEL', 'claude-sonnet-4-5');
  },
  get aiAvailable() {
    return optional('ANTHROPIC_API_KEY') !== '';
  },
  get pytrPython() {
    return optional('PYTR_PYTHON');
  },
  get trPhone() {
    return optional('TR_PHONE');
  },
  get trPin() {
    return optional('TR_PIN');
  },
  get quotesProvider() {
    return optional('QUOTES_PROVIDER', 'stooq');
  },
  get appUrl() {
    return optional('APP_URL', 'http://localhost:3000');
  },
} as const;

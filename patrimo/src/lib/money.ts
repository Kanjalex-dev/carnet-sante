/**
 * Manipulation des montants.
 *
 * Regle du projet : on ne fait JAMAIS d'arithmetique en `number` sur des euros
 * destines a etre stockes. Les montants circulent en centimes (entiers) dans la
 * logique metier, et en `Decimal` cote base. Les `number` ne servent qu'a
 * l'affichage et aux graphiques.
 */

/** Convertit un montant en euros (string ou number) vers des centimes entiers. */
export function toCents(value: string | number): number {
  if (typeof value === 'number') return Math.round(value * 100);
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Montant illisible : "${value}"`);
  }
  return Math.round(parsed * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Parse un montant tel qu'ecrit dans un releve bancaire francais.
 * Gere : "1 234,56", "-1.234,56", "1234.56", "(123,45)", "123,45 €", "+45,00".
 * Renvoie des centimes, ou null si la chaine ne contient pas de montant.
 */
export function parseFrenchAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '') return null;

  // Parentheses comptables = negatif.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Retire devise, espaces (y compris insecables) et signe +.
  s = s.replace(/[€$£]|EUR|eur/g, '').replace(/[\s  ]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s === '') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // Les deux presents : le dernier est le separateur decimal.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Une virgule seule : decimale si 1 a 2 chiffres suivent, sinon separateur
    // de milliers ("1,234" = mille deux cent trente-quatre).
    const decimals = s.length - lastComma - 1;
    s = decimals <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals > 2) s = s.replace(/\./g, '');
  }

  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurCompact = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatEur(cents: number, compact = false): string {
  const value = cents / 100;
  return compact ? eurCompact.format(value) : eurFormatter.format(value);
}

/** Format court pour les axes de graphiques : 1,2 k€ / 15 k€ / 1,3 M€. */
export function formatEurShort(cents: number): string {
  const abs = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')} M€`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace('.', ',')} k€`;
  return `${sign}${Math.round(abs)} €`;
}

export function formatPercent(ratio: number, digits = 1): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}

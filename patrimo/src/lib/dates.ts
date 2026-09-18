/**
 * Aides sur les dates et sur la notion de "mois budgetaire".
 *
 * Un mois budgetaire n'est pas forcement un mois calendaire : certains vivent
 * "du 5 au 5" parce que leur salaire tombe le 5. `monthStartDay` dans les
 * reglages pilote ce decalage, et toutes les agregations passent par ici.
 */

export type MonthKey = string; // "2026-09"

export function toMonthKey(date: Date): MonthKey {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Cle de mois invalide : "${key}"`);
  }
  return { year: y, month: m };
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function currentMonthKey(startDay = 1, now = new Date()): MonthKey {
  if (startDay <= 1) return toMonthKey(now);
  // Avant le jour de bascule, on est encore dans le mois budgetaire precedent.
  const key = toMonthKey(now);
  return now.getUTCDate() < startDay ? addMonths(key, -1) : key;
}

/** Bornes [debut, fin[ du mois budgetaire, en UTC. */
export function monthRange(
  key: MonthKey,
  startDay = 1,
): { start: Date; end: Date } {
  const { year, month } = parseMonthKey(key);
  if (startDay <= 1) {
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }
  const start = new Date(Date.UTC(year, month - 1, startDay));
  const end = new Date(Date.UTC(year, month, startDay));
  return { start, end };
}

export function monthLabel(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  const label = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function monthLabelShort(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace('.', '');
}

/** Liste des N derniers mois, du plus ancien au plus recent, incluant `key`. */
export function lastMonths(key: MonthKey, count: number): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addMonths(key, -i));
  return out;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Date "nue" en UTC minuit : c'est ainsi que Postgres stocke nos colonnes DATE. */
export function dateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Parse une date de releve bancaire. Les banques francaises ecrivent en
 * JJ/MM/AAAA, mais les exports OFX et certains CSV sont en ISO ou AAAAMMJJ.
 * On refuse d'inventer : renvoie null si le format est inconnu.
 */
export function parseStatementDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();

  // ISO : 2026-09-02 (eventuellement suivi d'une heure)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  // JJ/MM/AAAA ou JJ-MM-AAAA ou JJ.MM.AAAA
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));

  // JJ/MM/AA — on suppose le siecle courant (les releves sont recents).
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (m) return new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1]));

  // AAAAMMJJ (format OFX)
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  return null;
}

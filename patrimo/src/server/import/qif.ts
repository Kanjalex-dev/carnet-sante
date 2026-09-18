/**
 * Parseur QIF (Quicken Interchange Format).
 *
 * Format ligne a ligne : un caractere de code en tete de ligne, puis la valeur.
 * Une operation se termine par une ligne "^".
 *
 *   D  date          T  montant       P  beneficiaire (payee)
 *   M  memo          L  categorie     ^  fin d'operation
 *
 * Le QIF est ambigu sur les dates (aucune indication du format) : on delegue a
 * `parseStatementDate`, et on signale les lignes illisibles plutot que de deviner.
 */

import { parseStatementDate } from '@/lib/dates';
import { parseFrenchAmount } from '@/lib/money';
import { decodeBuffer } from './csv';
import type { ParseResult, ParsedRow, ParseWarning } from './types';
import { ImportError } from './types';

export function parseQif(buffer: Buffer): ParseResult {
  const text = decodeBuffer(buffer);
  const lines = text.split(/\r?\n/);

  const rows: ParsedRow[] = [];
  const warnings: ParseWarning[] = [];

  let current: {
    date?: Date;
    amountCents?: number;
    payee?: string;
    memo?: string;
    startLine: number;
  } = { startLine: 1 };

  const flush = (lineNo: number) => {
    const hasContent =
      current.date !== undefined ||
      current.amountCents !== undefined ||
      current.payee !== undefined;
    if (!hasContent) {
      current = { startLine: lineNo + 1 };
      return;
    }
    if (current.date === undefined) {
      warnings.push({ line: current.startLine, message: 'Operation QIF sans date, ignoree.' });
    } else if (current.amountCents === undefined || current.amountCents === 0) {
      warnings.push({ line: current.startLine, message: 'Operation QIF sans montant, ignoree.' });
    } else {
      const rawLabel = [current.payee, current.memo].filter(Boolean).join(' ').trim();
      if (rawLabel === '') {
        warnings.push({ line: current.startLine, message: 'Operation QIF sans libelle, ignoree.' });
      } else {
        rows.push({ date: current.date, amountCents: current.amountCents, rawLabel });
      }
    }
    current = { startLine: lineNo + 1 };
  };

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.trim();
    if (line === '') return;
    // Les lignes "!Type:Bank" declarent le type de compte : on les ignore.
    if (line.startsWith('!')) return;

    if (line === '^') {
      flush(lineNo);
      return;
    }

    const code = line[0];
    const value = line.slice(1).trim();

    switch (code) {
      case 'D': {
        const date = parseStatementDate(value.replace(/'/g, '/'));
        if (!date) {
          warnings.push({ line: lineNo, message: `Date QIF illisible : "${value}"` });
        } else {
          current.date = date;
        }
        break;
      }
      case 'T':
      case 'U': {
        const cents = parseFrenchAmount(value);
        if (cents === null) {
          warnings.push({ line: lineNo, message: `Montant QIF illisible : "${value}"` });
        } else if (current.amountCents === undefined) {
          current.amountCents = cents;
        }
        break;
      }
      case 'P':
        current.payee = value;
        break;
      case 'M':
        current.memo = value;
        break;
      default:
        // N (numero de cheque), L (categorie), C (pointage), S/E/$ (ventilation) :
        // non utilises pour l'instant.
        break;
    }
  });

  // Certains fichiers QIF n'ont pas de "^" final.
  flush(lines.length);

  if (rows.length === 0) {
    throw new ImportError('Aucune operation exploitable dans ce fichier QIF.');
  }

  return { rows, warnings, profile: 'QIF', format: 'QIF' };
}

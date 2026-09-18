/**
 * Parseur OFX (Open Financial Exchange), versions 1.x (SGML) et 2.x (XML).
 *
 * L'OFX 1.x n'est pas du XML : les balises ne sont pas fermees. On ne peut donc
 * pas utiliser un parseur XML generique. L'approche retenue — extraire les blocs
 * <STMTTRN> puis lire les champs par expression reguliere — fonctionne pour les
 * deux versions, parce que les noms de balises sont identiques.
 *
 * Interet de l'OFX par rapport au CSV : il porte un identifiant unique par
 * operation (FITID) fourni par la banque, ce qui rend la deduplication exacte
 * au lieu d'heuristique.
 */

import { parseStatementDate } from '@/lib/dates';
import { parseFrenchAmount } from '@/lib/money';
import { decodeBuffer } from './csv';
import type { ParseResult, ParsedRow, ParseWarning } from './types';
import { ImportError } from './types';

function tagValue(block: string, tag: string): string | null {
  // Forme XML : <TAG>valeur</TAG>  |  Forme SGML : <TAG>valeur (jusqu'a la balise suivante)
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const match = block.match(re);
  if (!match) return null;
  const value = match[1].trim();
  return value === '' ? null : value;
}

/**
 * Le montant OFX est cense etre en notation anglo-saxonne (point decimal), mais
 * des exports francais utilisent la virgule. `parseFrenchAmount` gere les deux.
 */
function parseOfxAmount(raw: string): number | null {
  return parseFrenchAmount(raw);
}

export function parseOfx(buffer: Buffer): ParseResult {
  const text = decodeBuffer(buffer);
  if (!/<OFX>/i.test(text)) {
    throw new ImportError("Ce fichier ne contient pas de bloc <OFX>.");
  }

  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (!blocks || blocks.length === 0) {
    throw new ImportError("Aucune operation (<STMTTRN>) trouvee dans le fichier OFX.");
  }

  const rows: ParsedRow[] = [];
  const warnings: ParseWarning[] = [];

  blocks.forEach((block, index) => {
    const line = index + 1;
    const rawDate = tagValue(block, 'DTPOSTED');
    const rawAmount = tagValue(block, 'TRNAMT');
    const name = tagValue(block, 'NAME');
    const memo = tagValue(block, 'MEMO');
    const fitid = tagValue(block, 'FITID');

    if (!rawDate) {
      warnings.push({ line, message: 'Operation sans date (DTPOSTED), ignoree.' });
      return;
    }
    const date = parseStatementDate(rawDate);
    if (!date) {
      warnings.push({ line, message: `Date OFX illisible : "${rawDate}"` });
      return;
    }

    if (!rawAmount) {
      warnings.push({ line, message: 'Operation sans montant (TRNAMT), ignoree.' });
      return;
    }
    const amountCents = parseOfxAmount(rawAmount);
    if (amountCents === null || amountCents === 0) {
      warnings.push({ line, message: `Montant OFX illisible : "${rawAmount}"` });
      return;
    }

    // NAME porte l'enseigne, MEMO le detail. On concatene sans dupliquer.
    const parts = [name, memo].filter(Boolean) as string[];
    const rawLabel =
      parts.length === 2 && parts[1].includes(parts[0])
        ? parts[1]
        : parts.join(' ').trim();

    if (rawLabel === '') {
      warnings.push({ line, message: 'Operation sans libelle, ignoree.' });
      return;
    }

    const valueDateRaw = tagValue(block, 'DTAVAIL');
    const valueDate = valueDateRaw
      ? parseStatementDate(valueDateRaw) ?? undefined
      : undefined;

    rows.push({
      date,
      valueDate,
      amountCents,
      rawLabel,
      externalId: fitid ?? undefined,
    });
  });

  if (rows.length === 0) {
    throw new ImportError('Aucune operation exploitable dans ce fichier OFX.');
  }

  // Solde declare, utile pour ancrer le previsionnel.
  let statedBalanceCents: number | undefined;
  let statedBalanceDate: Date | undefined;
  const ledger = text.match(/<LEDGERBAL>[\s\S]*?(?:<\/LEDGERBAL>|<\/STMTRS>)/i);
  if (ledger) {
    const bal = tagValue(ledger[0], 'BALAMT');
    const dt = tagValue(ledger[0], 'DTASOF');
    if (bal) {
      const cents = parseOfxAmount(bal);
      if (cents !== null) statedBalanceCents = cents;
    }
    if (dt) statedBalanceDate = parseStatementDate(dt) ?? undefined;
  }

  const version = /<\?xml/i.test(text) || /<OFX>[\s\S]*<\/OFX>/i.test(text)
    ? 'OFX 2.x (XML)'
    : 'OFX 1.x (SGML)';

  return {
    rows,
    warnings,
    profile: version,
    format: 'OFX',
    statedBalanceCents,
    statedBalanceDate,
  };
}

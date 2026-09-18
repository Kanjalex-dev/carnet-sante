import { describe, expect, it } from 'vitest';
import { parseFrenchAmount, formatEur } from '@/lib/money';
import { parseStatementDate, currentMonthKey, addMonths, monthRange } from '@/lib/dates';
import { recurringKey, cleanLabel, canonicalLabel } from '@/lib/normalize';
import { parseCsv, detectDelimiter, decodeBuffer } from '@/server/import/csv';
import { parseOfx } from '@/server/import/ofx';
import { parseQif } from '@/server/import/qif';
import { assignOrdinals, detectFormat } from '@/server/import/ingest';
import {
  inferFrequency,
  monthlyEquivalentCents,
  clusterAmounts,
  regularityOfIntervals,
} from '@/server/analysis/recurring';
import { mapBankCategory } from '@/server/categorize/bankMapping';
import { inferAssetClass } from '@/server/patrimoine/connectors/tradeRepublic';
import { defaultTargetAllocation, projectWealth } from '@/server/patrimoine/portfolio';

describe('parseFrenchAmount', () => {
  it('lit les formats francais courants', () => {
    expect(parseFrenchAmount('1 234,56')).toBe(123456);
    expect(parseFrenchAmount('-1 234,56')).toBe(-123456);
    expect(parseFrenchAmount('1.234,56')).toBe(123456);
    expect(parseFrenchAmount('12,5 €')).toBe(1250);
    expect(parseFrenchAmount('+45,00')).toBe(4500);
  });

  it('lit les formats anglo-saxons', () => {
    expect(parseFrenchAmount('45.90')).toBe(4590);
    expect(parseFrenchAmount('1,234.56')).toBe(123456);
  });

  it('traite les parentheses comptables comme un negatif', () => {
    expect(parseFrenchAmount('(123,45)')).toBe(-12345);
  });

  it('distingue virgule decimale et separateur de milliers', () => {
    // Trois chiffres apres la virgule : c'est un separateur de milliers.
    expect(parseFrenchAmount('1,234')).toBe(123400);
    // Deux chiffres : c'est une decimale.
    expect(parseFrenchAmount('1,23')).toBe(123);
  });

  it('renvoie null plutot que de deviner', () => {
    expect(parseFrenchAmount('')).toBeNull();
    expect(parseFrenchAmount('n/a')).toBeNull();
    expect(parseFrenchAmount('   ')).toBeNull();
  });

  it("n'introduit pas d'erreur de virgule flottante", () => {
    // 0.1 + 0.2 en euros donnerait 0.30000000000000004 : on travaille en centimes.
    const total = parseFrenchAmount('0,10')! + parseFrenchAmount('0,20')!;
    expect(total).toBe(30);
    expect(formatEur(total)).toContain('0,30');
  });
});

describe('parseStatementDate', () => {
  it('lit le format francais', () => {
    expect(parseStatementDate('02/09/2026')?.toISOString().slice(0, 10)).toBe(
      '2026-09-02',
    );
  });
  it('lit ISO et OFX', () => {
    expect(parseStatementDate('2026-09-02')?.toISOString().slice(0, 10)).toBe(
      '2026-09-02',
    );
    expect(parseStatementDate('20260902120000')?.toISOString().slice(0, 10)).toBe(
      '2026-09-02',
    );
  });
  it('refuse ce qu il ne comprend pas', () => {
    expect(parseStatementDate('hier')).toBeNull();
  });
});

describe('normalisation des libelles', () => {
  it('regroupe deux prelevements du meme abonnement', () => {
    const a = recurringKey('PRLV SEPA SPOTIFY AB ECH/240912 MANDAT XY82HD');
    const b = recurringKey('PRLV SEPA SPOTIFY AB ECH/241012 MANDAT XY82HD');
    expect(a).toBe(b);
    expect(a).toContain('SPOTIFY');
  });

  it('retire le numero de carte et la date', () => {
    expect(canonicalLabel('CARTE 4589 CARREFOUR MARKET LILLE 12/09')).toBe(
      'CARREFOUR MARKET LILLE',
    );
  });

  it('produit un libelle lisible', () => {
    expect(cleanLabel('CB SNCF CONNECT 14H32 05.09.26')).toBe('Sncf Connect');
  });

  it('ne vide pas un libelle deja propre', () => {
    expect(cleanLabel('Loyer appartement')).toBe('Loyer Appartement');
  });
});

describe('CSV', () => {
  it('detecte le point-virgule', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3\n')).toBe(',');
  });

  it('decode le Windows-1252', () => {
    // 0xE9 = "é" en Latin-1, sequence invalide en UTF-8.
    const buffer = Buffer.from([0x45, 0x6c, 0x65, 0x63, 0x74, 0x72, 0x69, 0x63, 0x69, 0x74, 0xe9]);
    expect(decodeBuffer(buffer)).toBe('Electricité');
  });

  it('lit un export a colonne unique signee', () => {
    const csv = [
      'Date operation;Libelle;Montant',
      '02/09/2026;CARTE 4589 CARREFOUR;-45,90',
      '03/09/2026;VIREMENT SEPA RECU SALAIRE;2 450,00',
    ].join('\n');
    const result = parseCsv(Buffer.from(csv, 'utf8'), 'export.csv');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].amountCents).toBe(-4590);
    expect(result.rows[1].amountCents).toBe(245000);
  });

  it('lit un export a colonnes debit/credit separees', () => {
    const csv = [
      'Date operation;Date valeur;Libelle operation;Debit euros;Credit euros',
      '02/09/2026;02/09/2026;PRLV EDF;45,90;',
      '05/09/2026;05/09/2026;VIR SALAIRE;;2450,00',
    ].join('\n');
    const result = parseCsv(Buffer.from(csv, 'utf8'), 'ca.csv');
    // Le debit doit ressortir negatif meme s'il est ecrit positif.
    expect(result.rows[0].amountCents).toBe(-4590);
    expect(result.rows[1].amountCents).toBe(245000);
  });

  it('signale les lignes illisibles sans faire echouer tout le fichier', () => {
    const csv = [
      'Date;Libelle;Montant',
      '02/09/2026;OK;-10,00',
      'pas une date;CASSE;-10,00',
      '04/09/2026;OK2;-12,00',
    ].join('\n');
    const result = parseCsv(Buffer.from(csv, 'utf8'), 'x.csv');
    expect(result.rows).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
  });

  it('rejette un fichier sans colonne de montant', () => {
    const csv = 'Date;Libelle\n02/09/2026;RIEN';
    expect(() => parseCsv(Buffer.from(csv, 'utf8'), 'x.csv')).toThrow(/montant/i);
  });
});

const OFX_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>EUR
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260902
<TRNAMT>-45.90
<FITID>2026090200001
<NAME>CARREFOUR MARKET
<MEMO>CARTE 4589 CARREFOUR MARKET LILLE
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260905
<TRNAMT>2450.00
<FITID>2026090500002
<NAME>SALAIRE
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>3204.10
<DTASOF>20260906
</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe('OFX', () => {
  it('lit les operations et le solde declare', () => {
    const result = parseOfx(Buffer.from(OFX_SAMPLE, 'utf8'));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].amountCents).toBe(-4590);
    expect(result.rows[0].externalId).toBe('2026090200001');
    expect(result.statedBalanceCents).toBe(320410);
    expect(result.statedBalanceDate?.toISOString().slice(0, 10)).toBe('2026-09-06');
  });

  it('refuse un fichier qui n est pas de l OFX', () => {
    expect(() => parseOfx(Buffer.from('bonjour', 'utf8'))).toThrow(/OFX/);
  });
});

describe('QIF', () => {
  it('lit les operations', () => {
    const qif = ['!Type:Bank', 'D02/09/2026', 'T-45,90', 'PCARREFOUR', 'MCARTE 4589', '^', 'D05/09/2026', 'T2450,00', 'PSALAIRE', '^'].join('\n');
    const result = parseQif(Buffer.from(qif, 'utf8'));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].amountCents).toBe(-4590);
    expect(result.rows[0].rawLabel).toContain('CARREFOUR');
  });

  it('lit la derniere operation meme sans marqueur de fin', () => {
    const qif = ['!Type:Bank', 'D02/09/2026', 'T-10,00', 'PTEST'].join('\n');
    expect(parseQif(Buffer.from(qif, 'utf8')).rows).toHaveLength(1);
  });
});

describe('detection de format', () => {
  it('reconnait l OFX par son contenu, pas seulement par l extension', () => {
    expect(detectFormat('releve.txt', Buffer.from(OFX_SAMPLE))).toBe('OFX');
    expect(detectFormat('releve.qif', Buffer.from('!Type:Bank'))).toBe('QIF');
    expect(detectFormat('releve.csv', Buffer.from('a;b'))).toBe('CSV');
  });
});

describe('deduplication', () => {
  const row = (label: string, amount: number, day: string) => ({
    date: new Date(`2026-09-${day}T00:00:00Z`),
    amountCents: amount,
    rawLabel: label,
  });

  it('distingue deux operations identiques du meme jour', () => {
    const rows = [
      row('CAFE', -350, '02'),
      row('CAFE', -350, '02'),
      row('CAFE', -350, '03'),
    ];
    expect(assignOrdinals(rows)).toEqual([0, 1, 0]);
  });

  it('produit les memes rangs pour le meme fichier reimporte', () => {
    const rows = [row('A', -100, '02'), row('A', -100, '02'), row('B', -200, '02')];
    expect(assignOrdinals(rows)).toEqual(assignOrdinals(rows));
  });
});

describe('recurrences', () => {
  it('deduit la frequence a partir de l intervalle median', () => {
    expect(inferFrequency(30).frequency).toBe('MONTHLY');
    expect(inferFrequency(7).frequency).toBe('WEEKLY');
    expect(inferFrequency(365).frequency).toBe('ANNUAL');
    expect(inferFrequency(43).frequency).toBe('IRREGULAR');
  });

  it('ramene toutes les frequences a un cout mensuel comparable', () => {
    expect(monthlyEquivalentCents(-1200, 'ANNUAL')).toBe(-100);
    expect(monthlyEquivalentCents(-1000, 'MONTHLY')).toBe(-1000);
    expect(monthlyEquivalentCents(-300, 'WEEKLY')).toBe(-1300);
  });
});

describe('mois budgetaire', () => {
  it('decale le mois quand le jour de debut n est pas le 1er', () => {
    // Le 3 septembre, avec un mois qui demarre le 5, on est encore en aout.
    expect(currentMonthKey(5, new Date('2026-09-03T12:00:00Z'))).toBe('2026-08');
    expect(currentMonthKey(5, new Date('2026-09-06T12:00:00Z'))).toBe('2026-09');
  });

  it('calcule les bornes decalees', () => {
    const { start, end } = monthRange('2026-09', 5);
    expect(start.toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(end.toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  it('passe correctement les bornes d annee', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('patrimoine', () => {
  it('reconnait un ETF a son nom', () => {
    expect(inferAssetClass('iShares Core MSCI World UCITS ETF')).toBe('ETF');
    expect(inferAssetClass('Air Liquide SA')).toBe('EQUITY');
    expect(inferAssetClass('Bitcoin')).toBe('CRYPTO');
  });

  it('fait monter la part actions avec le profil de risque', () => {
    const prudent = defaultTargetAllocation(2, 20);
    const offensif = defaultTargetAllocation(9, 20);
    const equityOf = (a: { assetClass: string; targetShare: number }[]) =>
      a.find((x) => x.assetClass === 'ETF')!.targetShare;
    expect(equityOf(offensif)).toBeGreaterThan(equityOf(prudent));
  });

  it('reduit la part actions quand l horizon est court', () => {
    const long = defaultTargetAllocation(8, 25);
    const court = defaultTargetAllocation(8, 2);
    const equityOf = (a: { assetClass: string; targetShare: number }[]) =>
      a.find((x) => x.assetClass === 'ETF')!.targetShare;
    expect(equityOf(court)).toBeLessThan(equityOf(long));
  });

  it('produit des allocations qui somment a 1', () => {
    for (const risk of [1, 5, 10]) {
      const total = defaultTargetAllocation(risk, 15).reduce(
        (s, a) => s + a.targetShare,
        0,
      );
      expect(total).toBeCloseTo(1, 1);
    }
  });

  it('projette un capital compose coherent', () => {
    const [pessimiste, median, optimiste] = projectWealth(1_000_000, 0, 10);
    expect(median.finalCents).toBeGreaterThan(pessimiste.finalCents);
    expect(optimiste.finalCents).toBeGreaterThan(median.finalCents);
    // 10 000 € a 5 % sur 10 ans ≈ 16 300 €.
    expect(median.finalCents).toBeGreaterThan(1_600_000);
    expect(median.finalCents).toBeLessThan(1_700_000);
  });

  it('prend en compte les versements mensuels', () => {
    const sansVersement = projectWealth(1_000_000, 0, 10)[1].finalCents;
    const avecVersement = projectWealth(1_000_000, 20_000, 10)[1].finalCents;
    expect(avecVersement).toBeGreaterThan(sansVersement);
  });
});

describe('paliers de montants', () => {
  it('regroupe un tarif inchange en un seul palier', () => {
    const clusters = clusterAmounts([-1199, -1199, -1199, -1199], 0.02);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(4);
  });

  it('reconnait deux paliers apres une hausse de tarif', () => {
    const amounts = [-1549, -1549, -1549, -1999, -1999, -1999];
    const clusters = clusterAmounts(amounts, 0.02);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.count === 3)).toBe(true);
  });

  it('ne fusionne pas un continuum de montants en paliers', () => {
    // Un panier de courses entre 48 et 79 € ne doit pas ressembler a un
    // abonnement dont le tarif aurait change deux fois.
    const amounts = Array.from({ length: 20 }, (_, i) => -(4800 + i * 160));
    const clusters = clusterAmounts(amounts, 0.02);
    expect(clusters.length).toBeGreaterThan(5);
  });

  it("ne laisse pas l'ancre deriver de proche en proche", () => {
    // Chaque valeur est a moins de 2 % de la precedente, mais l'ensemble
    // couvre bien plus de 2 %.
    const amounts = [-10000, -10150, -10300, -10450, -10600, -10750];
    const clusters = clusterAmounts(amounts, 0.02);
    expect(clusters.length).toBeGreaterThan(1);
  });
});

describe('BoursoBank (format verifie sur un export reel)', () => {
  // En-tete exact d'un export BoursoBank de septembre 2026. Le profil livre
  // initialement etait faux et l'import echouait : ce test le fige.
  const HEADER =
    'dateOp;dateVal;label;suggestedLabel;category;categoryParent;amount;comment;accountNum;accountLabel;accountbalance;mark';

  const build = (...lines: string[]) =>
    Buffer.from([HEADER, ...lines].join('\n'), 'utf8');

  it('reconnait le profil et lit les operations', () => {
    const result = parseCsv(
      build(
        '2026-08-31;2026-08-31;"CARTE 30/08/26 AMAZON PAYMENTS 2441535";Amazon;"Livres, CD/DVD";"Vie quotidienne";-14,99;;4810********8543;ULTIM;-136.49;Non',
      ),
      'export.csv',
    );
    expect(result.profile).toBe('BoursoBank');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].amountCents).toBe(-1499);
    expect(result.rows[0].rawLabel).toContain('AMAZON PAYMENTS');
  });

  it('separe les comptes melanges dans un meme fichier', () => {
    // Le compte courant et la carte a debit differe cohabitent dans l'export.
    // Les confondre compterait chaque depense deux fois.
    const result = parseCsv(
      build(
        '2026-08-31;2026-08-31;"CARTE 30/08/26 AMAZON";Amazon;"Livres";"Vie quotidienne";-14,99;;4810********8543;ULTIM;-136.49;Non',
        '2026-08-31;2026-08-31;"VIR SEPA AMPLI";"Vir Sepa";"Virements recus";"Virements recus";9,00;;00040640174;"BoursoBank - Perso";12688.18;Non',
      ),
      'export.csv',
    );
    expect(result.accounts).toHaveLength(2);
    expect(result.rows[0].accountLabel).toBe('ULTIM');
    expect(result.rows[1].accountLabel).toBe('BoursoBank - Perso');
  });

  it('lit le solde et la categorie fournis par la banque', () => {
    const result = parseCsv(
      build(
        '2026-08-31;2026-08-31;"VIR SEPA X";X;"Alimentation";"Vie quotidienne";-20,00;;00040640174;Compte;12688.18;Non',
      ),
      'export.csv',
    );
    expect(result.rows[0].balanceCents).toBe(1268818);
    expect(result.rows[0].bankCategory).toBe('Vie quotidienne > Alimentation');
  });
});

describe('correspondance des categories bancaires', () => {
  it('traduit une categorie BoursoBank vers la taxonomie interne', () => {
    expect(mapBankCategory('Vie quotidienne > Alimentation')).toBe(
      'Alimentation > Courses',
    );
    expect(mapBankCategory('Loisirs et sorties > Restaurants, bars, discothèques…')).toBe(
      'Alimentation > Restaurants',
    );
  });

  it('reconnait le prelevement de carte a debit differe comme mouvement interne', () => {
    expect(
      mapBankCategory(
        'Mouvements internes débiteurs > Prélèvements cartes débit différé et cartes crédit conso',
      ),
    ).toBe('Virements internes');
  });

  it('refuse de traduire une categorie trop vague', () => {
    // "Vie quotidienne > Vie quotidienne" ne dit rien : mieux vaut laisser la
    // ligne a classer que de la ranger arbitrairement.
    expect(mapBankCategory('Vie quotidienne > Vie quotidienne')).toBeNull();
    expect(mapBankCategory('Virements émis > Virements émis')).toBeNull();
    expect(mapBankCategory(undefined)).toBeNull();
  });
});

describe('regularite des intervalles', () => {
  it('resiste a une echeance doublee ou sautee', () => {
    // Mensuel avec un mois a deux prelevements. L'ancienne mesure (ecart-type
    // autour de la moyenne) rejetait cette serie ; sur un export reel elle
    // ecartait ainsi 47 series sur 73.
    expect(regularityOfIntervals([30, 2, 28, 30, 30])).toBeGreaterThanOrEqual(0.6);
    expect(regularityOfIntervals([30, 60, 30, 30, 31])).toBeGreaterThanOrEqual(0.6);
  });

  it('rejette des achats repetes a rythme erratique', () => {
    // Intervalles releves sur de vraies courses : rien de periodique.
    expect(regularityOfIntervals([1, 12, 9, 6, 71, 42, 61, 84])).toBeLessThan(0.55);
    expect(regularityOfIntervals([7, 21, 26, 51, 5, 39, 70, 41])).toBeLessThan(0.55);
  });
});

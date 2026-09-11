import { describe, expect, it } from 'vitest'
import productsData from '../data/products-fr.json'
import {
  dedupe, expandYear, findDate, findLot, findProduct, looksLikeHeader, normalise, parseLine,
  parseLines, type OcrLine, type ProductSpec, type Proposal,
} from './parse'

const products = (productsData as { products: ProductSpec[] }).products
const OPTS = { products, currentYear: 2026, birthDate: '2025-07-12', today: '2026-09-11' }
const line = (text: string, confidence = 0.9): OcrLine => ({ text, confidence })

describe('dates', () => {
  it('lit les formats rencontrés dans un carnet', () => {
    expect(findDate('12/09/2025 Infanrix', 2026)).toBe('2025-09-12')
    expect(findDate('12.09.2025', 2026)).toBe('2025-09-12')
    expect(findDate('12-09-2025', 2026)).toBe('2025-09-12')
    expect(findDate('le 5/3/2026 rappel', 2026)).toBe('2026-03-05')
  })

  it('lit le jour avant le mois, jamais l’inverse', () => {
    // 03/09 est le 3 septembre en France, pas le 9 mars.
    expect(findDate('03/09/2025', 2026)).toBe('2025-09-03')
  })

  it('complète un millésime à deux chiffres sans jamais partir dans le futur', () => {
    expect(expandYear(25, 2026)).toBe(2025)
    expect(expandYear(99, 2026)).toBe(1999)
    expect(expandYear(26, 2026)).toBe(2026)
    expect(findDate('12/09/25', 2026)).toBe('2025-09-12')
  })

  it('rejette une date impossible', () => {
    expect(findDate('32/09/2025', 2026)).toBeUndefined()
    expect(findDate('29/02/2025', 2026)).toBeUndefined()
    expect(findDate('29/02/2024', 2026)).toBe('2024-02-29')
  })

  it('ne renvoie rien quand il n’y a pas de date', () => {
    expect(findDate('Infanrix Hexa lot A21CB', 2026)).toBeUndefined()
  })
})

describe('produits', () => {
  it('reconnaît malgré la casse, les accents et les espaces', () => {
    expect(findProduct('INFANRIX HEXA', products)?.name).toBe('Infanrix Hexa')
    expect(findProduct('infanrixhexa', products)?.name).toBe('Infanrix Hexa')
    expect(findProduct('  Prévenar 13 ', products)?.name).toBe('Prevenar 13')
  })

  it('préfère le nom le plus précis', () => {
    const p = findProduct('Infanrix Hexa 0,5 ml', products)
    expect(p?.name).toBe('Infanrix Hexa')
    expect(p?.valences).toEqual(['DTP', 'Coq', 'Hib', 'HepB'])
  })

  it('déduit les valences d’un hexavalent', () => {
    expect(findProduct('Vaxelis', products)?.valences).toHaveLength(4)
  })

  it('ne devine rien sur un produit inconnu', () => {
    expect(findProduct('Vaccin machin 42', products)).toBeUndefined()
  })

  it('normalise correctement', () => {
    expect(normalise('M-M-RvaxPro')).toBe('mmrvaxpro')
    expect(normalise('Prévenar 13')).toBe('prevenar13')
  })
})

describe('numéros de lot', () => {
  it('repère un lot alphanumérique', () => {
    expect(findLot('12/09/2025 Infanrix Hexa A21CB447A')).toBe('A21CB447A')
    expect(findLot('lot NL4826')).toBe('NL4826')
  })

  it('ne confond jamais une date avec un lot', () => {
    expect(findLot('12/09/2025')).toBeUndefined()
    expect(findLot('05.03.26')).toBeUndefined()
  })

  it('ignore les mots sans chiffre et les nombres seuls', () => {
    expect(findLot('Infanrix Hexa')).toBeUndefined()
    expect(findLot('123456')).toBeUndefined()
  })
})

describe('analyse d’une ligne', () => {
  it('produit une proposition complète', () => {
    const p = parseLine(line('12/09/2025 Infanrix Hexa A21CB447A'), OPTS)!
    expect(p.date).toBe('2025-09-12')
    expect(p.productName).toBe('Infanrix Hexa')
    expect(p.lotNumber).toBe('A21CB447A')
    expect(p.valences).toEqual(['DTP', 'Coq', 'Hib', 'HepB'])
    expect(p.warnings).toEqual([])
    expect(p.confidence).toBeGreaterThan(0.85)
  })

  it('écarte une ligne sans date ni produit', () => {
    expect(parseLine(line('Vaccinations'), OPTS)).toBeNull()
    expect(parseLine(line('—————'), OPTS)).toBeNull()
  })

  it('signale et dégrade la confiance quand la date manque', () => {
    const p = parseLine(line('Infanrix Hexa A21CB447A', 0.9), OPTS)!
    expect(p.date).toBeUndefined()
    expect(p.warnings).toContain('Date non lue')
    expect(p.confidence).toBeLessThan(0.6)
  })

  it('signale une date antérieure à la naissance', () => {
    const p = parseLine(line('12/09/2020 Priorix', 0.95), OPTS)!
    expect(p.warnings).toContain('Date antérieure à la naissance')
    expect(p.confidence).toBeLessThan(0.5)
  })

  it('signale une date dans le futur', () => {
    const p = parseLine(line('12/09/2030 Priorix', 0.95), OPTS)!
    expect(p.warnings).toContain('Date dans le futur')
  })

  it('conserve la ligne brute pour que l’utilisateur puisse comparer à la photo', () => {
    expect(parseLine(line('  12/09/2025  Bexsero  '), OPTS)!.rawLine).toBe('12/09/2025  Bexsero')
  })
})

describe('en-têtes du carnet', () => {
  it('ne propose jamais la date de naissance comme une vaccination', () => {
    expect(looksLikeHeader('Date de naissance : 12/07/2025')).toBe(true)
    expect(parseLine(line('Date de naissance : 12/07/2025', 0.9), OPTS)).toBeNull()
  })

  it('écarte les autres en-têtes de tableau', () => {
    for (const h of ["Nom de l'enfant", 'CARNET DE SANTÉ', 'N° de lot', 'SIGNATURE']) {
      expect(looksLikeHeader(h)).toBe(true)
    }
  })

  it('ne confond pas une ligne de vaccination avec un en-tête', () => {
    expect(looksLikeHeader('12/09/2025 Infanrix Hexa A21CB447A')).toBe(false)
  })
})

describe('lecture d’une page entière', () => {
  it('extrait les injections et ignore les en-têtes', () => {
    const page = [
      line('CARNET DE SANTÉ - VACCINATIONS', 0.95),
      line('Date    Vaccin    N° de lot', 0.9),
      line('Date de naissance : 12/07/2025', 0.9),
      line('12/09/2025  Infanrix Hexa  A21CB447A', 0.93),
      line('12/09/2025  Prevenar 13  NL4826', 0.91),
      line('14/11/2025  Bexsero', 0.62),
      line('~~~~~~', 0.3),
    ]
    const out = parseLines(page, OPTS)
    expect(out).toHaveLength(3)
    expect(out.map((p) => p.productName)).toEqual(['Infanrix Hexa', 'Prevenar 13', 'Bexsero'])
    expect(out[0].date).toBe('2025-09-12')
    expect(out[2].confidence).toBeLessThan(out[0].confidence)
  })

  it('trie par date', () => {
    const out = parseLines([
      line('14/11/2025 Bexsero'), line('12/09/2025 Priorix'),
    ], OPTS)
    expect(out.map((p) => p.date)).toEqual(['2025-09-12', '2025-11-14'])
  })
})

describe('doublons', () => {
  const base: Proposal = {
    date: '2025-09-12', productName: 'Infanrix Hexa', valences: ['DTP'],
    confidence: 0.6, rawLine: 'a', warnings: [],
  }

  it('fusionne deux lectures de la même injection en gardant la meilleure', () => {
    const out = dedupe([base, { ...base, confidence: 0.9, rawLine: 'b' }])
    expect(out).toHaveLength(1)
    expect(out[0].confidence).toBe(0.9)
    expect(out[0].rawLine).toBe('b')
  })

  it('récupère le lot de la lecture la moins sûre s’il manquait', () => {
    const out = dedupe([
      { ...base, confidence: 0.9 },
      { ...base, confidence: 0.5, lotNumber: 'A21CB447A' },
    ])
    expect(out[0].lotNumber).toBe('A21CB447A')
  })

  it('ne fusionne pas deux injections de dates différentes', () => {
    expect(dedupe([base, { ...base, date: '2025-11-14' }])).toHaveLength(2)
  })
})

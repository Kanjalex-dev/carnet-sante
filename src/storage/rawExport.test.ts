import { describe, expect, it } from 'vitest'
import {
  UTF8_BOM, csvField, csvRows, exportFilename, growthCsv, rawJson, vaccinationsCsv,
} from './rawExport'
import type { Vault } from './repository'
import type { Child } from '../domain/types'

const stamp = '2025-01-01T00:00:00.000Z'

const children: Child[] = [{
  id: 'c1', firstName: 'Léa', birthDate: '2024-02-10', sex: 'F', scheduleId: 'fr-2025',
  createdAt: stamp, updatedAt: stamp,
}]

const vault: Vault = {
  version: 1,
  children,
  vaccinations: [
    {
      id: 'v2', childId: 'c1', valences: ['ROR'], date: '2025-02-10', source: 'manual',
      productName: 'Priorix, susp. inj.', verifiedByUser: true, attachmentIds: [],
      createdAt: stamp, updatedAt: stamp,
    },
    {
      id: 'v1', childId: 'c1', valences: ['DTP', 'Coqueluche'], date: '2024-04-10',
      doseNumber: 1, lotNumber: 'A"B', source: 'ocr-local', verifiedByUser: false,
      attachmentIds: [], createdAt: stamp, updatedAt: stamp,
    },
    {
      id: 'v3', childId: 'c1', valences: ['BCG'], date: '2024-03-01', source: 'manual',
      verifiedByUser: true, attachmentIds: [], deletedAt: stamp,
      createdAt: stamp, updatedAt: stamp,
    },
  ],
  growth: [{
    id: 'g1', childId: 'c1', date: '2024-06-10', weightKg: 7.2, heightCm: 65,
    source: 'manual', verifiedByUser: true, createdAt: stamp, updatedAt: stamp,
  }],
}

describe('échappement CSV', () => {
  it('laisse un champ simple tel quel', () => {
    expect(csvField('Priorix')).toBe('Priorix')
    expect(csvField(7.2)).toBe('7.2')
    expect(csvField(undefined)).toBe('')
  })

  it('protège une virgule, sinon la colonne se décale', () => {
    expect(csvField('Infanrix Hexa, susp. inj.')).toBe('"Infanrix Hexa, susp. inj."')
  })

  it('double les guillemets, comme le veut la RFC 4180', () => {
    expect(csvField('lot A"B')).toBe('"lot A""B"')
  })

  it('protège un saut de ligne dans une note', () => {
    expect(csvField('ligne 1\nligne 2')).toBe('"ligne 1\nligne 2"')
  })

  it('sépare les lignes par CRLF, ce qu’attend Excel', () => {
    expect(csvRows([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d')
  })
})

describe('export des vaccinations', () => {
  it('commence par le BOM, sans quoi Excel abîme les accents', () => {
    expect(vaccinationsCsv(vault, children).startsWith(UTF8_BOM)).toBe(true)
  })

  it('remplace l’identifiant de l’enfant par son prénom', () => {
    expect(vaccinationsCsv(vault, children)).toContain('Léa')
    expect(vaccinationsCsv(vault, children)).not.toContain('c1,')
  })

  it('trie par date plutôt que par ordre de saisie', () => {
    const lines = vaccinationsCsv(vault, children).split('\r\n')
    expect(lines[1]).toContain('2024-04-10')
    expect(lines[2]).toContain('2025-02-10')
  })

  it('omet les lignes supprimées', () => {
    expect(vaccinationsCsv(vault, children)).not.toContain('BCG')
  })

  it('dit si la ligne a été confirmée à la main ou lue par OCR', () => {
    const csv = vaccinationsCsv(vault, children)
    expect(csv).toContain('ocr-local,non')
    expect(csv).toContain('manual,oui')
  })

  it('joint les valences d’un même acte sur une seule cellule', () => {
    expect(vaccinationsCsv(vault, children)).toContain('DTP + Coqueluche')
  })
})

describe('export de la croissance', () => {
  it('laisse vides les mesures non renseignées plutôt que d’écrire zéro', () => {
    const line = growthCsv(vault, children).split('\r\n')[1]
    // poids et taille renseignés, périmètre crânien absent
    expect(line).toBe('Léa,2024-06-10,7.2,65,,manual,oui')
  })
})

describe('export JSON', () => {
  it('conserve les lignes supprimées, avec leur date de suppression', () => {
    const parsed = JSON.parse(rawJson(vault)) as { vaccinations: { id: string; deletedAt?: string }[] }
    const deleted = parsed.vaccinations.find((v) => v.id === 'v3')
    expect(deleted?.deletedAt).toBe(stamp)
  })

  it('se déclare comme un export de Carnet', () => {
    const parsed = JSON.parse(rawJson(vault)) as { format: string; version: number }
    expect(parsed.format).toBe('carnet-export')
    expect(parsed.version).toBe(1)
  })
})

describe('nom de fichier', () => {
  it('porte la date et l’extension, pas le prénom de l’enfant', () => {
    const name = exportFilename('vaccinations', 'csv', new Date('2026-03-14T10:00:00Z'))
    expect(name).toBe('carnet-vaccinations-2026-03-14.csv')
  })
})

import type { Child, GrowthMeasure, VaccinationEvent } from '../domain/types'
import type { Vault } from './repository'

/**
 * Export des données brutes, en clair.
 *
 * C'est la porte de sortie : si demain l'application disparaît, change de
 * modèle ou cesse de plaire, les données doivent partir vers un tableur ou
 * une autre application sans rien demander à personne. Un carnet qu'on ne
 * peut pas emporter n'appartient pas vraiment à celui qui le tient.
 *
 * Ces fichiers ne sont PAS chiffrés, contrairement à la sauvegarde : ils sont
 * faits pour être ouverts par autre chose que Carnet. L'interface le dit avant
 * de les produire.
 */

/* --------------------------------------------------------------------- CSV */

/**
 * Échappement RFC 4180 : guillemets doublés, champ entre guillemets dès qu'il
 * contient une virgule, un guillemet ou un saut de ligne. Un nom de produit
 * comme « Infanrix Hexa, susp. inj. » casse un CSV naïf.
 */
export function csvField(value: unknown): string {
  if (value === undefined || value === null) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvRows(rows: unknown[][]): string {
  // CRLF : c'est ce qu'attend Excel, et c'est ce que dit la RFC.
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n')
}

/**
 * Le BOM UTF-8 n'est pas une coquetterie : sans lui, Excel sous Windows lit
 * « Léa » comme « LÃ©a ». Le premier export d'un carnet français sans BOM
 * revient toujours en bug.
 */
export const UTF8_BOM = '﻿'

/* ----------------------------------------------------------------- tableaux */

const yesNo = (b: boolean): string => (b ? 'oui' : 'non')

export function vaccinationsCsv(vault: Vault, children: Child[]): string {
  const name = new Map(children.map((c) => [c.id, c.firstName]))
  const rows: unknown[][] = [[
    'enfant', 'date', 'valences', 'dose', 'produit', 'lot',
    'praticien', 'lieu', 'origine', 'confirmé', 'notes',
  ]]
  for (const v of vault.vaccinations.filter((e) => !e.deletedAt).sort(byDate)) {
    rows.push([
      name.get(v.childId) ?? v.childId,
      v.date,
      v.valences.join(' + '),
      v.doseNumber ?? '',
      v.productName ?? '',
      v.lotNumber ?? '',
      v.practitioner ?? '',
      v.place ?? '',
      v.source,
      yesNo(v.verifiedByUser),
      v.notes ?? '',
    ])
  }
  return UTF8_BOM + csvRows(rows)
}

export function growthCsv(vault: Vault, children: Child[]): string {
  const name = new Map(children.map((c) => [c.id, c.firstName]))
  const rows: unknown[][] = [[
    'enfant', 'date', 'poids_kg', 'taille_cm', 'perimetre_cranien_cm', 'origine', 'confirmé',
  ]]
  for (const m of vault.growth.filter((g) => !g.deletedAt).sort(byDate)) {
    rows.push([
      name.get(m.childId) ?? m.childId,
      m.date,
      m.weightKg ?? '',
      m.heightCm ?? '',
      m.headCircumferenceCm ?? '',
      m.source,
      yesNo(m.verifiedByUser),
    ])
  }
  return UTF8_BOM + csvRows(rows)
}

function byDate(a: { date: string }, b: { date: string }): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
}

/* -------------------------------------------------------------------- JSON */

export interface RawExport {
  format: 'carnet-export'
  version: 1
  exportedAt: string
  children: Child[]
  vaccinations: VaccinationEvent[]
  growth: GrowthMeasure[]
}

/**
 * Le JSON conserve les lignes supprimées, avec leur `deletedAt`. C'est
 * volontaire : cet export sert aussi à comprendre ce qui s'est passé, et une
 * suppression fait partie de l'histoire du carnet. Les CSV, eux, sont faits
 * pour être lus tels quels et ne montrent que ce qui est vrai aujourd'hui.
 */
export function rawJson(vault: Vault, now = new Date()): string {
  const payload: RawExport = {
    format: 'carnet-export',
    version: 1,
    exportedAt: now.toISOString(),
    children: vault.children,
    vaccinations: vault.vaccinations,
    growth: vault.growth,
  }
  return JSON.stringify(payload, null, 2)
}

export function exportFilename(kind: 'vaccinations' | 'croissance' | 'carnet', ext: 'csv' | 'json', now = new Date()): string {
  return `carnet-${kind}-${now.toISOString().slice(0, 10)}.${ext}`
}

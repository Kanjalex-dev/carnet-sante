import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, ageInMonths, daysBetween, isISODate, today, toISODate,
} from './dates'

describe('dates civiles', () => {
  it('valide le format et rejette les dates impossibles', () => {
    expect(isISODate('2025-07-12')).toBe(true)
    expect(isISODate('2025-02-29')).toBe(false)
    expect(isISODate('2024-02-29')).toBe(true)
    expect(isISODate('2025-13-01')).toBe(false)
    expect(isISODate('12/07/2025')).toBe(false)
  })

  it('compte les jours sans dériver sur les années bissextiles', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1)
    expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365)
  })

  it('borne au dernier jour du mois plutôt que de déborder', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28')
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2025-08-31', 1)).toBe('2025-09-30')
  })

  it('calcule un âge en mois révolus', () => {
    expect(ageInMonths('2025-07-12', '2026-09-10')).toBe(13)
    expect(ageInMonths('2025-07-12', '2026-09-12')).toBe(14)
    expect(ageInMonths('2025-07-12', '2025-07-11')).toBe(-1)
  })

  it('ajoute des jours sans passer par un fuseau horaire', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('date du jour — indépendance au fuseau', () => {
  // Le piège : new Date(iso).toISOString() décale d'un jour à l'ouest de UTC.
  // `today` lit les composantes locales, jamais UTC.
  for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    it(`renvoie la date locale en ${tz}`, () => {
      const original = process.env.TZ
      process.env.TZ = tz
      const now = new Date('2026-09-10T23:30:00')
      expect(today(now)).toBe(toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate()))
      expect(today(now)).toBe('2026-09-10')
      process.env.TZ = original
    })
  }
})

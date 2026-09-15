import { describe, expect, it } from 'vitest'
import {
  NotATransferFileError, UnsupportedVersionError, WrongPassphraseError,
  exportTransfer, readTransfer, transferFilename,
} from './transfer'
import type { MergeVault } from '../domain/merge'

const vault: MergeVault = {
  children: [{
    id: 'c1', firstName: 'Léa', birthDate: '2024-02-10', sex: 'F', scheduleId: 'fr-2025',
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
  }],
  vaccinations: [{
    id: 'v1', childId: 'c1', valences: ['DTP'], date: '2024-04-10', source: 'manual',
    verifiedByUser: true, attachmentIds: ['a1'],
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
  }],
  growth: [],
}

describe('fichier d’échange', () => {
  it('fait un aller-retour sans perte', async () => {
    const back = await readTransfer(await exportTransfer(vault, 'phrase de transfert'), 'phrase de transfert')
    expect(back.children[0].firstName).toBe('Léa')
    expect(back.vaccinations[0].date).toBe('2024-04-10')
  })

  it('ne transporte pas les pièces jointes', async () => {
    const back = await readTransfer(await exportTransfer(vault, 'p'), 'p')
    expect(back.vaccinations[0].attachmentIds).toEqual([])
  })

  it('ne laisse rien de lisible en clair dans le fichier', async () => {
    const text = await exportTransfer(vault, 'p')
    expect(text).not.toContain('Léa')
    expect(text).not.toContain('2024-04-10')
  })

  it('refuse une phrase erronée', async () => {
    const text = await exportTransfer(vault, 'bonne phrase')
    await expect(readTransfer(text, 'mauvaise phrase')).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('refuse un fichier altéré', async () => {
    const file = JSON.parse(await exportTransfer(vault, 'p'))
    file.sealed.data = file.sealed.data.slice(0, -4) + 'AAAA'
    await expect(readTransfer(JSON.stringify(file), 'p')).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('refuse un fichier qui n’en est pas un', async () => {
    await expect(readTransfer('bonjour', 'p')).rejects.toBeInstanceOf(NotATransferFileError)
    await expect(readTransfer('{"format":"autre"}', 'p')).rejects.toBeInstanceOf(NotATransferFileError)
  })

  it('refuse un format plus récent que celui qu’il sait lire', async () => {
    const file = JSON.parse(await exportTransfer(vault, 'p'))
    file.version = 99
    await expect(readTransfer(JSON.stringify(file), 'p')).rejects.toBeInstanceOf(UnsupportedVersionError)
  })

  it('nomme le fichier sans le prénom de l’enfant', () => {
    expect(transferFilename(new Date('2026-09-15T10:00:00Z'))).toBe('carnet-2026-09-15.carnet')
  })
})

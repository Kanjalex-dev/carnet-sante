import { describe, expect, it } from 'vitest'
import {
  type BackupPayload, NotABackupFileError, UnsupportedVersionError, WrongPassphraseError,
  backupFilename, exportBackup, fromBase64, peekBackup, readBackup, toBase64,
} from './backup'

const payload: BackupPayload = {
  vault: {
    version: 1,
    children: [{
      id: 'c1', firstName: 'Léa', birthDate: '2024-02-10', sex: 'F', scheduleId: 'fr-2025',
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    }],
    vaccinations: [{
      id: 'v1', childId: 'c1', valences: ['DTP'], date: '2024-04-10', source: 'manual',
      verifiedByUser: true, attachmentIds: ['a1'],
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    }],
    growth: [{
      id: 'g1', childId: 'c1', date: '2024-06-10', weightKg: 7.2, source: 'manual',
      verifiedByUser: true,
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    }],
  },
  attachments: [{
    meta: {
      id: 'a1', childId: 'c1', mimeType: 'image/jpeg', width: 800, height: 600,
      bytes: 4, capturedAt: '2025-01-01T00:00:00.000Z',
    },
    bytesBase64: toBase64(new Uint8Array([1, 2, 250, 255])),
  }],
}

describe('base64', () => {
  it('fait un aller-retour sur des octets quelconques', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255])
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes))
  })

  it('encode une photo volumineuse sans déborder la pile d’arguments', () => {
    // 2 Mo : au-delà de la tranche de 0x8000, là où fromCharCode(...bytes)
    // lèverait un RangeError.
    const big = new Uint8Array(2 * 1024 * 1024)
    for (let i = 0; i < big.length; i += 1) big[i] = i % 256
    const back = fromBase64(toBase64(big))
    expect(back.length).toBe(big.length)
    expect(back[0]).toBe(0)
    expect(back[big.length - 1]).toBe(big[big.length - 1])
  })
})

describe('sauvegarde', () => {
  it('fait un aller-retour sans perte', async () => {
    const back = await readBackup(await exportBackup(payload, 'ma phrase'), 'ma phrase')
    expect(back.vault.children[0].firstName).toBe('Léa')
    expect(back.vault.vaccinations[0].date).toBe('2024-04-10')
    expect(back.vault.growth[0].weightKg).toBe(7.2)
  })

  it('embarque les photographies, contrairement au fichier d’échange', async () => {
    const back = await readBackup(await exportBackup(payload, 'p'), 'p')
    expect(back.attachments).toHaveLength(1)
    expect(back.attachments[0].meta.id).toBe('a1')
    expect(Array.from(fromBase64(back.attachments[0].bytesBase64))).toEqual([1, 2, 250, 255])
  })

  it('conserve le lien entre une vaccination et sa pièce jointe', async () => {
    const back = await readBackup(await exportBackup(payload, 'p'), 'p')
    expect(back.vault.vaccinations[0].attachmentIds).toEqual(['a1'])
    expect(back.attachments.map((a) => a.meta.id)).toContain('a1')
  })

  it('refuse une phrase erronée plutôt que de rendre des données abîmées', async () => {
    const text = await exportBackup(payload, 'la bonne')
    await expect(readBackup(text, 'la mauvaise')).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('refuse un fichier qui n’est pas une sauvegarde', async () => {
    await expect(readBackup('{"format":"autre chose"}', 'p')).rejects.toBeInstanceOf(NotABackupFileError)
    await expect(readBackup('pas du json', 'p')).rejects.toBeInstanceOf(NotABackupFileError)
  })

  it('refuse un fichier d’échange co-parent, qui n’a pas les photos', async () => {
    // Les deux formats se ressemblent : confondre les deux restaurerait un
    // carnet amputé de ses preuves sans le dire.
    const transferLike = JSON.stringify({ format: 'carnet-transfer', version: 1, kdf: {}, sealed: {} })
    await expect(readBackup(transferLike, 'p')).rejects.toBeInstanceOf(NotABackupFileError)
  })

  it('refuse une version plus récente que celle qu’elle sait lire', async () => {
    const text = await exportBackup(payload, 'p')
    const future = JSON.stringify({ ...JSON.parse(text), version: 99 })
    await expect(readBackup(future, 'p')).rejects.toBeInstanceOf(UnsupportedVersionError)
  })

  it('annonce le contenu sans demander la phrase', async () => {
    const file = peekBackup(await exportBackup(payload, 'p'))
    expect(file.summary).toEqual({ children: 1, vaccinations: 1, growth: 1, attachments: 1 })
  })

  it('ne met pas le prénom de l’enfant dans le nom du fichier', () => {
    const name = backupFilename(new Date('2026-03-14T10:00:00Z'))
    expect(name).toBe('carnet-sauvegarde-2026-03-14.carnetbak')
    expect(name.toLowerCase()).not.toContain('lea')
  })
})

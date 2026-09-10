import { describe, expect, it } from 'vitest'
import {
  checkCanary, deriveKey, makeCanary, newKdfParams, open, openJSON, seal, sealJSON,
} from './crypto'

// globalThis.crypto est la WebCrypto de Node : même API que le navigateur.
describe('dérivation de clé', () => {
  it('utilise au moins 310 000 itérations', () => {
    expect(newKdfParams().iterations).toBeGreaterThanOrEqual(310_000)
  })

  it('tire un sel aléatoire de 16 octets, différent à chaque fois', () => {
    const a = newKdfParams(), b = newKdfParams()
    expect(a.salt).toHaveLength(16)
    expect(a.salt).not.toEqual(b.salt)
  })
})

describe('scellement', () => {
  it('fait l’aller-retour sur des données de santé', async () => {
    const params = newKdfParams()
    const key = await deriveKey('phrase secrète correcte', params)
    const payload = { vaccinations: [{ valences: ['ROR'], date: '2026-07-20' }] }
    const sealed = await sealJSON(key, payload)
    expect(await openJSON(key, sealed)).toEqual(payload)
  })

  it('ne laisse rien de lisible dans le chiffré', async () => {
    const key = await deriveKey('phrase', newKdfParams())
    const sealed = await sealJSON(key, { valences: ['Méningocoque B'] })
    const text = new TextDecoder().decode(new Uint8Array(sealed.data))
    expect(text).not.toContain('Méningocoque')
    expect(text).not.toContain('valences')
  })

  it('utilise un vecteur d’initialisation différent à chaque scellement', async () => {
    const key = await deriveKey('phrase', newKdfParams())
    const a = await sealJSON(key, { x: 1 })
    const b = await sealJSON(key, { x: 1 })
    expect(a.iv).not.toEqual(b.iv)
    expect(a.data).not.toEqual(b.data)
  })

  it('refuse une mauvaise phrase secrète', async () => {
    const params = newKdfParams()
    const good = await deriveKey('bonne phrase', params)
    const bad = await deriveKey('mauvaise phrase', params)
    const sealed = await sealJSON(good, { secret: true })
    await expect(openJSON(bad, sealed)).rejects.toThrow()
  })

  it('détecte une altération du chiffré', async () => {
    const key = await deriveKey('phrase', newKdfParams())
    const sealed = await seal(key, new TextEncoder().encode('intact'))
    sealed.data[3] = sealed.data[3] ^ 0xff
    await expect(open(key, sealed)).rejects.toThrow()
  })
})

describe('témoin de phrase secrète', () => {
  it('valide la bonne phrase et rejette les autres, sans stocker d’empreinte', async () => {
    const params = newKdfParams()
    const key = await deriveKey('la bonne', params)
    const canary = await makeCanary(key)
    expect(await checkCanary(key, canary)).toBe(true)
    expect(await checkCanary(await deriveKey('une autre', params), canary)).toBe(false)
  })
})

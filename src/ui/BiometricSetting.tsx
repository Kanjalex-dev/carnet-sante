import { useEffect, useState } from 'react'
import {
  biometryAvailability, disableBiometricUnlock, enableBiometricUnlock,
  isBiometricUnlockEnabled,
} from '../native/biometrics'
import { unlock } from '../storage/repository'
import { Button } from './atoms'
import { PassphraseDialog } from './Share'

/**
 * Le raccourci biométrique, proposé seulement si l'appareil le permet ET si
 * le coffre est chiffré : sans chiffrement, il n'y a rien à déverrouiller et
 * la proposition ne ferait que suggérer une protection inexistante.
 *
 * L'activation redemande la phrase. C'est volontaire : l'écran des réglages
 * s'ouvre sur un coffre déjà déverrouillé, et confier au trousseau une phrase
 * qu'on n'a pas revérifiée fabriquerait un raccourci qui échoue plus tard,
 * au pire moment.
 */
export function BiometricSetting({ encrypted }: { encrypted: boolean }) {
  const [label, setLabel] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    void (async () => {
      const info = await biometryAvailability()
      if (!info.available) { setLabel(null); return }
      setLabel(info.label)
      setEnabled(await isBiometricUnlockEnabled())
    })()
  }, [])

  if (!label || !encrypted) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
        Déverrouillage
      </h2>
      <div className="border-line bg-surface flex flex-col gap-3 rounded-[12px] border p-4">
        <p className="text-ink-muted m-0 text-[12.5px] leading-snug text-pretty">
          {enabled
            ? `${label} ouvre ce carnet sans ressaisir la phrase. Votre phrase est gardée par le trousseau de l’appareil, pas par Carnet — elle reste indispensable et vaut mieux être notée ailleurs.`
            : `${label} peut ouvrir ce carnet sans ressaisir la phrase à chaque fois. Elle sera confiée au trousseau de l’appareil, protégé par le matériel, et restituée seulement après une authentification réussie.`}
        </p>
        <Button variant="secondary"
          onClick={async () => {
            if (enabled) { await disableBiometricUnlock(); setEnabled(false) } else { setAsking(true) }
          }}>
          {enabled ? `Désactiver ${label}` : `Activer ${label}`}
        </Button>
      </div>

      {asking && (
        <PassphraseDialog
          title={`Activer ${label}`}
          intro="Saisissez la phrase secrète de ce carnet. Elle est vérifiée avant d’être confiée au trousseau."
          cta="Activer"
          onCancel={() => setAsking(false)}
          onSubmit={async (p) => {
            if (!(await unlock(p))) return 'Phrase incorrecte.'
            await enableBiometricUnlock(p)
            setEnabled(true)
            setAsking(false)
            return null
          }}
        />
      )}
    </section>
  )
}

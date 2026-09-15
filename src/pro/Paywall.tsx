import { useState } from 'react'
import { PurchaseCancelledError, PurchaseUnavailableError, purchasePro } from './purchases'
import { Button } from '../ui/atoms'

/**
 * Une seule porte, un seul texte, réutilisée partout où une fonction Pro est
 * verrouillée. L'achat est unique et vaut pour toujours : pas de mensualité,
 * pas de renouvellement à surveiller.
 */
const FEATURES = [
  'Partage du récapitulatif par e-mail, SMS ou vers l’app du médecin ou de l’école',
  'Courbes de croissance (poids, taille, périmètre crânien)',
  'Fusion du carnet avec l’autre parent',
]

export function Paywall({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buy = async () => {
    setBusy(true); setError(null)
    try {
      await purchasePro()
      onUnlocked()
    } catch (e) {
      setError(
        e instanceof PurchaseCancelledError ? null
        : e instanceof PurchaseUnavailableError ? e.message
        : "L'achat n'a pas pu être finalisé. Réessayez.",
      )
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35" role="dialog"
      aria-modal="true" aria-label="Débloquer Carnet Pro">
      <div className="bg-paper w-full max-w-[440px] rounded-t-2xl px-5 pt-5 pb-7">
        <h2 className="font-display m-0 text-[22px] leading-tight font-medium tracking-tight">
          Carnet Pro
        </h2>
        <p className="text-ink-muted mt-1 mb-4 text-[13px] leading-snug text-pretty">
          Un seul achat, à vie. Le suivi vaccinal reste gratuit, quoi qu'il arrive.
        </p>

        <ul className="border-line bg-surface m-0 mb-5 flex list-none flex-col gap-2.5 rounded-[12px] border p-4">
          {FEATURES.map((f) => (
            <li key={f} className="text-ink-strong flex items-start gap-2 text-[13.5px] leading-snug text-pretty">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1E7351" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        {error && <p className="text-late mt-0 mb-4 text-[13px] font-medium text-pretty">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Plus tard</Button>
          <div className="flex-1">
            <Button full disabled={busy} onClick={() => { void buy() }}>
              {busy ? 'Un instant…' : 'Débloquer — 4,99 €'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

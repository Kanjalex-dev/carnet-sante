import { useEffect, useState, type ReactNode } from 'react'
import { isPro } from './purchases'
import { Paywall } from './Paywall'
import { Button } from '../ui/atoms'

/**
 * Un seul composant pour verrouiller une fonction derrière l'achat Pro.
 * Tant que le statut n'est pas connu (lecture asynchrone), on n'affiche rien
 * plutôt qu'un flash du contenu verrouillé.
 */
export function ProGate({ title, description, children }: {
  title: string
  description: string
  children: ReactNode
}) {
  const [pro, setPro] = useState<boolean | null>(null)
  const [showPaywall, setShowPaywall] = useState(false)

  useEffect(() => { void isPro().then(setPro) }, [])

  if (pro === null) return null
  if (pro) return <>{children}</>

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
      <span className="border-line bg-surface flex h-14 w-14 items-center justify-center rounded-full border" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#275C94" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      </span>
      <div className="max-w-[280px]">
        <h1 className="font-display m-0 text-[20px] leading-tight font-medium tracking-tight">{title}</h1>
        <p className="text-ink-muted mt-1.5 mb-0 text-[13.5px] leading-snug text-pretty">{description}</p>
      </div>
      <Button onClick={() => setShowPaywall(true)}>Débloquer Carnet Pro — 4,99 €</Button>
      {showPaywall && (
        <Paywall onClose={() => setShowPaywall(false)} onUnlocked={() => setPro(true)} />
      )}
    </main>
  )
}

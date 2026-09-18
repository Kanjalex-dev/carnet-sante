import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Un seul geste pour tout ce qui n'est pas évident : on appuie, une fiche
 * s'ouvre en bas de l'écran.
 *
 * Pourquoi pas une infobulle au survol : sur un téléphone, le survol n'existe
 * pas. Et une application grand public de santé ne peut pas supposer qu'un
 * parent sache ce que « Hib » ou « 8 / 8 » veulent dire.
 */

export interface Explanation {
  title: string
  /** Sous-titre court : le terme technique, quand il y en a un. */
  eyebrow?: string
  body: string
  /** Points complémentaires, une ligne chacun. */
  details?: string[]
  /** Renvoi vers le professionnel de santé, quand le sujet le demande. */
  medicalNote?: boolean
}

type Open = (e: Explanation) => void

const ExplainContext = createContext<Open | null>(null)

export function ExplainProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Explanation | null>(null)
  const open = useCallback((e: Explanation) => setCurrent(e), [])

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCurrent(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current])

  return (
    <ExplainContext.Provider value={open}>
      {children}
      {current && <InfoSheet explanation={current} onClose={() => setCurrent(null)} />}
    </ExplainContext.Provider>
  )
}

export function useExplain(): Open {
  const open = useContext(ExplainContext)
  // Sans fournisseur, l'explication est simplement indisponible : le reste de
  // l'interface continue de fonctionner.
  return open ?? (() => {})
}

function InfoSheet({ explanation, onClose }: { explanation: Explanation; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true"
      aria-label={explanation.title}>
      <button aria-label="Fermer" onClick={onClose} className="absolute inset-0 block bg-black/40" />
      <div className="bg-paper relative w-full max-w-[440px] rounded-t-2xl px-5 pt-4 pb-7 shadow-[0_-8px_30px_rgba(22,32,43,0.18)]">
        <div className="bg-line-strong mx-auto mb-4 h-1 w-10 rounded-full" aria-hidden="true" />

        {explanation.eyebrow && (
          <p className="text-ink-faint m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
            {explanation.eyebrow}
          </p>
        )}
        <h2 className="font-display m-0 mt-1 text-[22px] leading-tight font-medium tracking-tight text-balance">
          {explanation.title}
        </h2>

        <p className="text-ink-strong mt-3 mb-0 text-[15px] leading-normal text-pretty">
          {explanation.body}
        </p>

        {explanation.details && explanation.details.length > 0 && (
          <ul className="border-line bg-surface mt-4 mb-0 flex list-none flex-col gap-2 rounded-[12px] border p-3.5">
            {explanation.details.map((d) => (
              <li key={d} className="text-ink-strong text-[13.5px] leading-snug text-pretty">{d}</li>
            ))}
          </ul>
        )}

        {explanation.medicalNote && (
          <p className="text-ink-muted mt-3 mb-0 text-[12.5px] leading-snug text-pretty">
            Cette information est donnée à titre indicatif. Pour toute question sur la vaccination
            de votre enfant, parlez-en à votre médecin.
          </p>
        )}

        <button onClick={onClose}
          className="border-line-strong bg-surface text-ink-strong mt-5 flex min-h-11 w-full items-center justify-center rounded-[8px] border text-[14px] font-semibold">
          Fermer
        </button>
      </div>
    </div>
  )
}

/**
 * Le déclencheur, identique pour un nom de vaccin et pour un chiffre :
 * texte souligné en pointillés, suivi d'un point d'interrogation discret.
 */
export function Explainable({
  explanation, className = '', children, ariaLabel, hitArea = 'extend',
}: {
  explanation: Explanation
  className?: string
  children: ReactNode
  ariaLabel?: string
  /**
   * `extend` agrandit la zone tactile à 44 px sans toucher au dessin, par un
   * pseudo-élément : le texte garde sa taille, le doigt trouve sa cible.
   *
   * `none` s'impose dans une liste dense — une pastille de valence fait 32 px
   * et ses voisines sont à 8 px : une zone de 44 px empiéterait sur la ligne
   * du dessus et ferait ouvrir la mauvaise explication. Là, c'est au parent
   * porteur (la pastille) de fournir la surface.
   */
  hitArea?: 'extend' | 'none'
}) {
  const open = useExplain()
  const hit = hitArea === 'extend'
    ? "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']"
    : ''
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); open(explanation) }}
      aria-label={ariaLabel ?? `${explanation.title} — voir l'explication`}
      // Un seul signal d'affordance dans toute l'application : le point
      // d'interrogation. Pas de soulignement ici, pas de survol ailleurs.
      className={`inline-flex items-center gap-1 text-left ${hit} ${className}`}
    >
      {children}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" className="shrink-0 opacity-55" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" strokeWidth="1.8" />
        <path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.4" />
        <path d="M12 16.6v.01" />
      </svg>
    </button>
  )
}

import type { ReactNode } from 'react'
import type { DoseState } from '../domain/types'

/* Icônes — tracées, jamais d'emoji. */
const stroke = { fill: 'none', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function IconCheck({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...stroke} aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
}
export function IconAlert({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...stroke} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16.5v.01" /></svg>
}
export function IconClock({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...stroke} aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
}
export function IconShield({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...stroke} aria-hidden="true"><path d="M12 3 4.5 6.3v5.1c0 4.4 3.1 8.5 7.5 9.6 4.4-1.1 7.5-5.2 7.5-9.6V6.3L12 3Z" /></svg>
}
export function IconMinus({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...stroke} aria-hidden="true"><path d="M5 12h14" /></svg>
}

/**
 * Le statut ne repose JAMAIS sur la couleur seule :
 * couleur + icône + libellé texte, systématiquement.
 */
const STATE_STYLE: Record<DoseState, { fg: string; bg: string; border: string; label: string }> = {
  'not-recorded': {
    fg: 'text-ink-muted', bg: 'bg-paper-sunken', border: 'border-line', label: 'Non inscrit',
  },
  done: { fg: 'text-ok', bg: 'bg-ok-bg', border: 'border-ok-border', label: 'Inscrit' },
}

const HEX: Record<DoseState, string> = {
  'not-recorded': '#5E6E7E', done: '#1E7351',
}

export function StatusPill({ state, children }: { state: DoseState; children?: ReactNode }) {
  const s = STATE_STYLE[state]
  const Icon = state === 'done' ? IconCheck : IconMinus
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border ${s.bg} ${s.border} px-2.5 py-1`}>
      <Icon size={13} color={HEX[state]} />
      <span className={`text-[11px] font-bold ${s.fg}`}>{children ?? s.label}</span>
    </span>
  )
}

export function Button({ children, onClick, variant = 'primary', type = 'button', full = false, disabled = false }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary'
  type?: 'button' | 'submit'; full?: boolean; disabled?: boolean
}) {
  const base = `${full ? 'flex w-full' : 'inline-flex'} min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-[14px] font-semibold disabled:opacity-45`
  const style = variant === 'primary'
    ? 'bg-blue-500 text-white'
    : 'border border-line-strong bg-surface text-ink-strong'
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${style}`}>{children}</button>
}

/**
 * Mention permanente. Elle dit ce que l'application est — un outil
 * d'archivage — et ce qu'elle n'est pas. Elle n'est pas un paravent : le
 * produit est construit pour que cette phrase soit exacte. Voir
 * domain/status.ts et domain/catchup.ts.
 */
export function LegalNotice() {
  return (
    <p className="bg-paper-sunken border-line text-ink-muted m-0 border-t px-5 py-2.5 text-[10.5px] leading-snug">
      Outil personnel d'archivage. Carnet ne calcule rien pour votre enfant et ne recommande
      aucune date. Ne remplace ni le carnet de santé officiel ni l'avis d'un professionnel
      de santé.
    </p>
  )
}

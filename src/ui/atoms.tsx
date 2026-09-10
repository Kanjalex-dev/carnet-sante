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
  late: { fg: 'text-late', bg: 'bg-late-bg', border: 'border-late-border', label: 'En retard' },
  due: { fg: 'text-due', bg: 'bg-due-bg', border: 'border-due-border', label: 'À faire' },
  upcoming: { fg: 'text-ink-muted', bg: 'bg-paper-sunken', border: 'border-line', label: 'À venir' },
  done: { fg: 'text-ok', bg: 'bg-ok-bg', border: 'border-ok-border', label: 'Fait' },
  'not-applicable': { fg: 'text-ink-muted', bg: 'bg-paper-sunken', border: 'border-line', label: 'Sans objet' },
}

const HEX: Record<DoseState, string> = {
  late: '#BC4626', due: '#96631A', upcoming: '#6B6270', done: '#2F7A57', 'not-applicable': '#6B6270',
}

export function StatusPill({ state, children }: { state: DoseState; children?: ReactNode }) {
  const s = STATE_STYLE[state]
  const Icon = state === 'late' ? IconAlert : state === 'due' || state === 'upcoming' ? IconClock
    : state === 'done' ? IconCheck : IconMinus
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

export function LegalNotice() {
  return (
    <p className="bg-paper-sunken border-line text-ink-muted m-0 border-t px-5 py-2.5 text-[10.5px] leading-snug">
      Outil de suivi personnel. Ne remplace ni le carnet de santé officiel ni l'avis d'un
      professionnel de santé.
    </p>
  )
}

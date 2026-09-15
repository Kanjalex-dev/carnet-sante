import { useState } from 'react'
import type { Child } from '../domain/types'
import { isPro } from '../pro/purchases'
import { Paywall } from '../pro/Paywall'
import { AddChild } from './AddChild'
import { frDate } from './format'

/**
 * Le premier enfant est toujours gratuit. Le second (et les suivants) sont la
 * fonctionnalité Pro : la limite se voit au moment d'ajouter, pas en
 * retirant quelque chose à qui n'a qu'un seul enfant.
 */
export function ChildSwitcher({ children, activeId, onSwitch, onCreate }: {
  children: Child[]
  activeId: string
  onSwitch: (id: string) => void
  onCreate: (v: { firstName: string; birthDate: string; sex: 'F' | 'M' }) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)

  const requestAdd = async () => {
    if (children.length >= 1 && !(await isPro())) { setShowPaywall(true); return }
    setAdding(true)
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
        Enfants suivis
      </h2>
      <div className="border-line bg-surface divide-line-soft flex flex-col divide-y rounded-[12px] border">
        {children.map((c) => (
          <button key={c.id} onClick={() => onSwitch(c.id)} aria-pressed={c.id === activeId}
            className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-3 text-left">
            <span className="min-w-0">
              <span className="text-ink block text-[14px] font-semibold">{c.firstName}</span>
              <span className="text-ink-faint block text-[11.5px]">{frDate(c.birthDate)}</span>
            </span>
            {c.id === activeId && (
              <span className="text-blue-700 bg-blue-100 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold">
                Affiché
              </span>
            )}
          </button>
        ))}
        <button onClick={() => { void requestAdd() }}
          className="text-blue-700 flex min-h-11 items-center gap-2 px-3.5 py-3 text-[14px] font-semibold">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Ajouter un enfant
        </button>
      </div>

      {adding && (
        <AddChild onCancel={() => setAdding(false)}
          onCreate={async (v) => { setAdding(false); await onCreate(v) }} />
      )}
      {showPaywall && (
        <Paywall onClose={() => setShowPaywall(false)}
          onUnlocked={() => { setShowPaywall(false); setAdding(true) }} />
      )}
    </section>
  )
}

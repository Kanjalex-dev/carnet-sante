import { useState } from 'react'
import { isISODate, today } from '../domain/dates'
import { Button } from './atoms'

/**
 * Ajout d'un second enfant (et suivants). Distincte de l'onboarding en plein
 * écran : ici l'app existe déjà, c'est une boîte de dialogue par-dessus.
 */
export function AddChild({ onCancel, onCreate }: {
  onCancel: () => void
  onCreate: (v: { firstName: string; birthDate: string; sex: 'F' | 'M' }) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [sex, setSex] = useState<'F' | 'M'>('F')

  const validDate = isISODate(birthDate) && birthDate <= today()
  const ready = firstName.trim().length > 0 && validDate

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35" role="dialog"
      aria-modal="true" aria-label="Ajouter un enfant">
      <form className="bg-paper w-full max-w-[440px] rounded-t-2xl px-5 pt-5 pb-7"
        onSubmit={(e) => { e.preventDefault(); if (ready) onCreate({ firstName: firstName.trim(), birthDate, sex }) }}>
        <h2 className="font-display m-0 text-[22px] leading-tight font-medium tracking-tight">
          Ajouter un enfant
        </h2>
        <p className="text-ink-muted mt-1 mb-5 text-[13px] text-pretty">
          Son carnet est indépendant : vaccins, croissance et rappels lui sont propres.
        </p>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Prénom</span>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off"
              className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Date de naissance</span>
            <input type="date" value={birthDate} max={today()} onChange={(e) => setBirthDate(e.target.value)}
              className="border-line-strong bg-surface tnum min-h-11 rounded-[8px] border px-3 text-[16px]" />
          </label>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="text-ink-muted p-0 text-[11px] font-bold tracking-[0.09em] uppercase">Sexe</legend>
            <div className="flex gap-2">
              {(['F', 'M'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSex(s)} aria-pressed={sex === s}
                  className={`min-h-11 flex-1 rounded-[8px] border text-[15px] font-semibold ${
                    sex === s ? 'border-blue-500 bg-blue-100 text-blue-700' : 'border-line-strong bg-surface text-ink-strong'}`}>
                  {s === 'F' ? 'Fille' : 'Garçon'}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {birthDate !== '' && !validDate && (
          <p className="text-late mt-4 mb-0 text-[13px] font-medium">Indiquez une date de naissance valide, passée.</p>
        )}

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <div className="flex-1"><Button type="submit" full disabled={!ready}>Ajouter</Button></div>
        </div>
      </form>
    </div>
  )
}

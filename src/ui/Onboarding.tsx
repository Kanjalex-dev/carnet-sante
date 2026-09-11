import { useState } from 'react'
import { isISODate, today } from '../domain/dates'
import { Button } from './atoms'

export function Onboarding({ onCreate }: {
  onCreate: (v: { firstName: string; birthDate: string; sex: 'F' | 'M' }) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [sex, setSex] = useState<'F' | 'M'>('F')

  const validDate = isISODate(birthDate) && birthDate <= today()
  const ready = firstName.trim().length > 0 && validDate

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <div className="h-9 w-9 rounded-full" style={{ background: 'linear-gradient(140deg,#275C94 0%,#C46B8B 100%)' }} />
        <h1 className="font-display m-0 text-[30px] leading-tight font-medium tracking-tight">Carnet</h1>
        <p className="text-ink-muted m-0 text-[15px]">
          Le suivi vaccinal de votre enfant, de la naissance à l'âge adulte. Les données restent
          sur cet appareil.
        </p>
      </header>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => { e.preventDefault(); if (ready) onCreate({ firstName: firstName.trim(), birthDate, sex }) }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Prénom</span>
          <input
            value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off"
            className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Date de naissance</span>
          <input
            type="date" value={birthDate} max={today()} onChange={(e) => setBirthDate(e.target.value)}
            className="border-line-strong bg-surface tnum min-h-11 rounded-[8px] border px-3 text-[16px]"
          />
          <span className="text-ink-muted text-[12px]">
            Elle détermine quelles vaccinations sont obligatoires pour votre enfant.
          </span>
        </label>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="text-ink-muted p-0 text-[11px] font-bold tracking-[0.09em] uppercase">Sexe</legend>
          <span className="text-ink-muted text-[12px]">Nécessaire aux courbes de croissance de référence.</span>
          <div className="flex gap-2">
            {(['F', 'M'] as const).map((s) => (
              <button
                key={s} type="button" onClick={() => setSex(s)} aria-pressed={sex === s}
                className={`min-h-11 flex-1 rounded-[8px] border text-[15px] font-semibold ${
                  sex === s ? 'border-blue-500 bg-blue-100 text-blue-700' : 'border-line-strong bg-surface text-ink-strong'
                }`}
              >
                {s === 'F' ? 'Fille' : 'Garçon'}
              </button>
            ))}
          </div>
        </fieldset>

        {birthDate !== '' && !validDate && (
          <p className="text-late m-0 text-[13px] font-medium">Indiquez une date de naissance valide, passée.</p>
        )}

        <Button type="submit">Créer le carnet</Button>
      </form>
    </main>
  )
}

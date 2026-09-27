import { useMemo, useState } from 'react'
import { isISODate, today as todayFn } from '../domain/dates'
import { TRAVEL_VACCINES, travelRecords } from '../domain/travel'
import type { Child, VaccinationEvent } from '../domain/types'
import { Button, LegalNotice } from './atoms'
import { frDate as humanDate } from './format'
import { SCREEN_NOTICES } from './legal'

export interface TravelEntry {
  code: string
  date: string
  destination?: string
}

/**
 * Carnet de voyage — enregistrement seul.
 *
 * L'ecran ne propose jamais de vaccin en fonction du pays. La destination
 * est saisie apres le vaccin, volontairement : elle etiquette un
 * enregistrement deja fait, elle ne le declenche pas. Inverser les deux
 * champs suffirait a suggerer une recommandation.
 */
export function Travel({ child, events, onRecord, onRemove }: {
  child: Child
  events: VaccinationEvent[]
  onRecord: (entry: TravelEntry) => void
  onRemove: (eventId: string) => void
}) {
  const [code, setCode] = useState(TRAVEL_VACCINES[0].code)
  const [date, setDate] = useState('')
  const [destination, setDestination] = useState('')

  const records = useMemo(() => travelRecords(events), [events])
  const chosen = TRAVEL_VACCINES.find((v) => v.code === code)
  const ready = isISODate(date) && date <= todayFn()

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
      <main className="flex flex-1 flex-col gap-5 px-5 pt-4 pb-6">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display m-0 text-[27px] leading-[1.16] font-normal tracking-tight text-pretty">
            Les vaccins de voyage de {child.firstName}.
          </h1>
          <p className="text-ink-strong m-0 text-[13.5px] leading-snug text-pretty">
            {SCREEN_NOTICES.travel}
          </p>
        </header>

        <section className="border-line bg-surface flex flex-col gap-4 rounded-[12px] border p-4">
          <h2 className="font-display m-0 text-[17px] font-normal">Inscrire un vaccin de voyage</h2>

          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Vaccin</span>
            <select value={code} onChange={(e) => setCode(e.target.value)}
              className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]">
              {TRAVEL_VACCINES.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
            </select>
            {chosen && (
              <span className="text-ink-muted text-[12.5px] leading-snug text-pretty">{chosen.protects}</span>
            )}
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">
              Date de l’injection
            </span>
            <input type="date" value={date} max={todayFn()} onChange={(e) => setDate(e.target.value)}
              className="border-line-strong bg-surface tnum min-h-11 rounded-[8px] border px-3 text-[16px]" />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">
              Séjour <span className="font-medium normal-case tracking-normal">(facultatif)</span>
            </span>
            <input value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="Sénégal, été 2024" autoComplete="off"
              className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]" />
            <span className="text-ink-muted text-[12px] leading-snug text-pretty">
              Une étiquette pour vous y retrouver. Carnet ne s’en sert pas : la liste des vaccins
              ci-dessus est la même quelle que soit la destination.
            </span>
          </label>

          <Button disabled={!ready}
            onClick={() => {
              onRecord({ code, date, destination: destination.trim() || undefined })
              setDate(''); setDestination('')
            }}>
            Inscrire au carnet
          </Button>
        </section>

        <p className="text-ink-faint m-0 text-[11.5px] leading-snug text-pretty">
          Cette liste de sept vaccins est fixe et choisie par l’éditeur. Elle ne reproduit aucune
          recommandation officielle et ne dépend d’aucune destination. Les vaccins de voyage qui
          vous concernent se déterminent en consultation.
        </p>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
            Déjà inscrits
          </h2>
          {records.length === 0
            ? (
              <p className="border-line bg-surface-soft text-ink-strong m-0 rounded-[12px] border border-dashed px-4 py-5 text-[13.5px] leading-snug text-pretty">
                Aucun vaccin de voyage inscrit. Ceux que vous ajoutez ici apparaissent dans le
                carnet de {child.firstName} et dans son export.
              </p>
            )
            : records.map((r) => (
              <article key={`${r.eventId}-${r.code}`}
                className="border-line bg-surface flex items-center gap-3 rounded-[12px] border px-3.5 py-3">
                <div className="flex min-w-0 flex-grow flex-col">
                  <span className="text-[14.5px] font-semibold">{r.label}</span>
                  <span className="text-ink-muted tnum text-[12.5px]">
                    {humanDate(r.date)}{r.destination ? ` · ${r.destination}` : ''}
                  </span>
                </div>
                <button onClick={() => onRemove(r.eventId)}
                  className="border-line-strong text-ink-strong min-h-11 shrink-0 rounded-[8px] border px-3 text-[13px] font-semibold">
                  Retirer
                </button>
              </article>
            ))}
        </section>
      </main>
      <LegalNotice />
    </div>
  )
}

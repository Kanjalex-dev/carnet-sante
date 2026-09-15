import { useMemo, useState } from 'react'
import { isISODate, today } from '../domain/dates'
import {
  type Indicator, INDICATORS, plotMeasures, positionLabel, valueOf,
} from '../domain/growthChart'
import type { Child, GrowthMeasure } from '../domain/types'
import { Button } from './atoms'
import { Explainable } from './Explain'
import { growthExplanation, percentileExplanation } from './explanations'
import { GrowthChart } from './GrowthChart'
import { frDate, humanAge } from './format'
import { ageInMonths } from '../domain/dates'

export interface MeasureInput {
  date: string
  weightKg?: number
  heightCm?: number
  headCircumferenceCm?: number
}

export function Growth({ child, measures, onAdd, onDelete }: {
  child: Child
  measures: GrowthMeasure[]
  onAdd: (m: MeasureInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [indicator, setIndicator] = useState<Indicator>('weight')
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const spec = INDICATORS.find((i) => i.key === indicator)!
  const { points, outOfRange } = useMemo(
    () => plotMeasures(measures, child.birthDate, indicator, child.sex),
    [measures, child.birthDate, child.sex, indicator],
  )
  const current = points.find((p) => p.id === selected) ?? points[points.length - 1]
  const visible = useMemo(
    () => measures.filter((m) => !m.deletedAt && valueOf(m, indicator) !== undefined)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [measures, indicator],
  )

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display m-0 text-[26px] leading-tight font-medium tracking-tight">
            Croissance
          </h1>
          <Explainable explanation={growthExplanation()} className="text-ink-muted mt-0.5 text-[13px]">
            <span>Référence OMS, 0 à 5 ans</span>
          </Explainable>
        </div>
        <Button variant="secondary" onClick={() => setAdding(true)}>Ajouter</Button>
      </header>

      {/* Un indicateur à la fois : trois échelles sur un même axe ne se lisent pas. */}
      <div role="tablist" aria-label="Indicateur" className="border-line bg-surface flex gap-1 rounded-[10px] border p-1">
        {INDICATORS.map((i) => (
          <button key={i.key} role="tab" aria-selected={i.key === indicator}
            onClick={() => { setIndicator(i.key); setSelected(null) }}
            className={`min-h-9 flex-1 rounded-[7px] px-2 text-[12.5px] font-semibold ${
              i.key === indicator ? 'bg-blue-500 text-white' : 'text-ink-muted'}`}>
            {i.key === 'head' ? 'Pér. crânien' : i.short}
          </button>
        ))}
      </div>

      <section className="border-line bg-surface flex flex-col gap-3 rounded-[12px] border p-3.5">
        {points.length === 0 ? (
          <p className="text-ink-muted m-0 py-6 text-center text-[13.5px] text-pretty">
            Aucune mesure de {spec.label.toLowerCase()} placée pour l’instant.
            Ajoutez-en une depuis le bouton ci-dessus.
          </p>
        ) : (
          <>
            <GrowthChart indicator={indicator} sex={child.sex} unit={spec.unit} points={points}
              selectedId={current?.id ?? null} onSelect={setSelected} />
            {current && (
              <div className="border-line-soft bg-surface-soft flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-[9px] border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-ink m-0 text-[15px] font-semibold">
                    <span className="tnum">{current.value}</span> {spec.unit}
                    <span className="text-ink-muted font-normal"> · {frDate(current.date)}</span>
                  </p>
                  <p className="text-ink-faint m-0 text-[11.5px]">
                    {humanAge(ageInMonths(child.birthDate, current.date))}
                    {!current.verified && ' · non vérifié'}
                  </p>
                </div>
                <Explainable explanation={percentileExplanation(current.percentile, spec.label)}
                  className="text-blue-700 shrink-0 text-[12.5px] font-semibold">
                  <span>{positionLabel(current.percentile)}</span>
                </Explainable>
              </div>
            )}
          </>
        )}
        {outOfRange > 0 && (
          <p className="text-ink-muted m-0 text-[12px] leading-snug text-pretty">
            {outOfRange === 1 ? 'Une mesure est conservée' : `${outOfRange} mesures sont conservées`} mais
            non tracée{outOfRange > 1 ? 's' : ''} : la référence OMS s’arrête à 5 ans.
          </p>
        )}
      </section>

      {visible.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
            Mesures saisies
          </h2>
          <ul className="border-line bg-surface m-0 flex list-none flex-col rounded-[12px] border p-0">
            {visible.map((m, i) => (
              <li key={m.id} className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${i > 0 ? 'border-line-soft border-t' : ''}`}>
                <div className="min-w-0">
                  <p className="text-ink m-0 text-[14px]">
                    <span className="tnum font-semibold">{valueOf(m, indicator)}</span> {spec.unit}
                  </p>
                  <p className="text-ink-faint m-0 text-[11.5px]">
                    {frDate(m.date)} · {humanAge(ageInMonths(child.birthDate, m.date))}
                  </p>
                </div>
                <DeleteMeasure onConfirm={() => onDelete(m.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {adding && (
        <MeasureForm childBirth={child.birthDate} onCancel={() => setAdding(false)}
          onSave={async (v) => { await onAdd(v); setAdding(false) }} />
      )}
    </main>
  )
}

/**
 * Suppression en deux temps : une mesure effacée par mégarde ne se retrouve
 * pas. Le premier appui ne fait qu'ouvrir la confirmation.
 */
function DeleteMeasure({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <button onClick={() => setArmed(true)} aria-label="Supprimer cette mesure"
        className="text-ink-faint min-h-11 shrink-0 px-2 text-[12px]">
        Supprimer
      </button>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button onClick={() => setArmed(false)} className="text-ink-muted min-h-11 px-2 text-[12px]">
        Annuler
      </button>
      <button onClick={() => { void onConfirm() }}
        className="text-late min-h-11 px-2 text-[12px] font-bold">
        Confirmer
      </button>
    </span>
  )
}

/* ------------------------------------------------------------------ saisie */

function MeasureForm({ childBirth, onCancel, onSave }: {
  childBirth: string
  onCancel: () => void
  onSave: (v: MeasureInput) => Promise<void>
}) {
  const [date, setDate] = useState(today())
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [head, setHead] = useState('')

  const num = (s: string): number | undefined => {
    const v = Number(s.replace(',', '.'))
    return s.trim() === '' || Number.isNaN(v) || v <= 0 ? undefined : v
  }
  const values = { weightKg: num(weight), heightCm: num(height), headCircumferenceCm: num(head) }
  const hasOne = Object.values(values).some((v) => v !== undefined)
  const dateOk = isISODate(date) && date <= today() && date >= childBirth
  const valid = hasOne && dateOk

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35" role="dialog"
      aria-modal="true" aria-label="Ajouter une mesure">
      <div className="bg-paper w-full max-w-[440px] rounded-t-2xl px-5 pt-5 pb-7">
        <h2 className="font-display m-0 text-[22px] leading-tight font-medium tracking-tight">
          Nouvelle mesure
        </h2>
        <p className="text-ink-muted mt-1 mb-5 text-[13px] text-pretty">
          Renseignez ce que vous avez relevé : un seul champ suffit.
        </p>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Date de la mesure</span>
            <input type="date" value={date} max={today()} min={childBirth}
              onChange={(e) => setDate(e.target.value)}
              className="border-line-strong bg-surface tnum min-h-11 rounded-[8px] border px-3 text-[16px]" />
          </label>
          <div className="flex gap-2">
            <Field label="Poids (kg)" value={weight} onChange={setWeight} placeholder="8,4" />
            <Field label="Taille (cm)" value={height} onChange={setHeight} placeholder="72" />
          </div>
          <Field label="Périmètre crânien (cm)" value={head} onChange={setHead} placeholder="45,5" />
        </div>

        {!dateOk && (
          <p className="text-late mt-4 mb-0 text-[13px] font-medium text-pretty">
            Indiquez une date située entre la naissance et aujourd’hui.
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <div className="flex-1">
            <Button full disabled={!valid} onClick={() => { void onSave({ date, ...values }) }}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <label className="flex flex-1 flex-col gap-2">
      <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">{label}</span>
      <input inputMode="decimal" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="border-line-strong bg-surface tnum min-h-11 w-full rounded-[8px] border px-3 text-[16px]" />
    </label>
  )
}

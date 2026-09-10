import { useState } from 'react'
import { isISODate, today } from '../domain/dates'
import type { DoseGroup } from '../domain/status'
import { Button } from './atoms'

export interface DoseEntryValue {
  date: string
  productName?: string
  lotNumber?: string
}

/**
 * Un toggle n'enregistre JAMAIS une dose sans date : il ouvre cette saisie.
 */
export function DoseEntry({ dose, onCancel, onSave }: {
  dose: DoseGroup
  onCancel: () => void
  onSave: (v: DoseEntryValue) => void
}) {
  const [date, setDate] = useState(today())
  const [productName, setProductName] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const valid = isISODate(date) && date <= today()

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35" role="dialog" aria-modal="true"
      aria-label={`Enregistrer le rendez-vous ${dose.label}`}>
      <div className="bg-paper w-full max-w-[440px] rounded-t-2xl px-5 pt-5 pb-7">
        <h2 className="font-display m-0 text-[22px] leading-tight font-medium tracking-tight">
          Rendez-vous {dose.label}
        </h2>
        <p className="text-ink-muted mt-1 mb-5 text-[13px]">
          {dose.doses.map((d) => d.shortLabel).join(', ')}
        </p>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Date de l'injection</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)}
              className="border-line-strong bg-surface tnum min-h-11 rounded-[8px] border px-3 text-[16px]" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Produit <span className="font-normal normal-case">(facultatif)</span></span>
            <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Infanrix Hexa"
              className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Numéro de lot <span className="font-normal normal-case">(facultatif)</span></span>
            <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="A21CB447A"
              className="border-line-strong bg-surface tnum min-h-11 rounded-[8px] border px-3 text-[16px]" />
            <span className="text-ink-muted text-[12px]">Utile si un lot fait l'objet d'un rappel.</span>
          </label>
        </div>

        {!valid && <p className="text-late mt-4 mb-0 text-[13px] font-medium">Indiquez une date valide, qui ne soit pas dans le futur.</p>}

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <div className="flex-1">
            <Button
              full
              disabled={!valid}
              onClick={() => onSave({ date, productName: productName || undefined, lotNumber: lotNumber || undefined })}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { Child, Schedule, VaccinationEvent } from '../domain/types'
import {
  type AttachmentMeta, attachToVaccination, listAttachments, mutate, newId, softDeleteVaccination,
  stamp, updateVaccination,
} from '../storage/repository'
import { OcrReview } from './OcrReview'
import { buildRecap, type RecapOptions } from '../storage/pdf'
import { Button, LegalNotice } from './atoms'
import { PhotoSection } from './Photos'
import type { Explanation } from './Explain'
import { frDate as humanDate } from './format'
import { Explainable } from './Explain'
import { buildLabelIndex, buildValenceIndex, verifiedExplanation } from './explanations'


export function Record({ child, schedule, events, onChange }: {
  child: Child
  schedule: Schedule
  events: VaccinationEvent[]
  onChange: () => Promise<void>
}) {
  const [exporting, setExporting] = useState(false)
  const [photoKey, setPhotoKey] = useState(0)
  const [reading, setReading] = useState<AttachmentMeta | null>(null)
  const explanations = useMemo(() => buildValenceIndex(schedule), [schedule])
  const labels = useMemo(() => buildLabelIndex(schedule), [schedule])

  const live = useMemo(
    () => events.filter((e) => !e.deletedAt).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [events],
  )
  const unverified = live.filter((e) => !e.verifiedByUser).length

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
      <header className="flex flex-col gap-1 px-5 pt-4 pb-3">
        <h1 className="font-display m-0 text-[26px] leading-tight font-medium tracking-tight text-balance">
          Le carnet de {child.firstName}
        </h1>
        <p className="text-ink-muted m-0 text-[13px]">
          {live.length === 0
            ? 'Aucune vaccination enregistrée pour le moment.'
            : `${live.length} vaccination${live.length > 1 ? 's' : ''} enregistrée${live.length > 1 ? 's' : ''}`}
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-5 pb-6">
        <section className="flex flex-col gap-2.5">
          <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
            Vaccinations enregistrées
          </h2>
          {live.length === 0 ? (
            <p className="border-line bg-surface text-ink-muted m-0 rounded-[12px] border px-3.5 py-4 text-[13px] leading-snug text-pretty">
              Les doses que vous marquez comme faites depuis l'onglet Statut apparaîtront ici, et
              pourront être corrigées.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {live.map((e) => (
                <EventRow key={e.id} event={e} explanations={explanations} labels={labels}
                  onVerify={async () => { await updateVaccination(e.id, { verifiedByUser: true }); await onChange() }}
                  onDelete={async () => { await softDeleteVaccination(e.id); await onChange() }} />
              ))}
            </ul>
          )}
        </section>

        <PhotoSection childId={child.id} refreshKey={photoKey} onRead={setReading} />

        <section className="border-line bg-surface flex flex-col gap-3 rounded-[12px] border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-[15px] font-semibold">Transmettre le récapitulatif</h2>
            <p className="text-ink-muted m-0 text-[12.5px] leading-snug text-pretty">
              Un PDF reprenant les vaccinations, les pages photographiées en preuve, et un
              cartouche à faire signer par un professionnel de santé.
            </p>
          </div>
          {unverified > 0 && (
            <p className="border-due-border bg-due-bg text-ink-strong m-0 rounded-[8px] border px-3 py-2 text-[12.5px]">
              {unverified} ligne{unverified > 1 ? 's' : ''} non vérifiée{unverified > 1 ? 's' : ''} —
              elle{unverified > 1 ? 's' : ''} apparaîtra{unverified > 1 ? 'ont' : ''} distinctement dans le document.
            </p>
          )}
          <Button full disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              await exportRecap(child, schedule, events, {
                includePhotos: true, includeSignature: true, includeLots: true,
              })
            } finally { setExporting(false); setPhotoKey((k) => k + 1) }
          }}>
            {exporting ? 'Génération…' : 'Générer le PDF'}
          </Button>
          <p className="text-ink-muted m-0 text-[11.5px] leading-snug text-pretty">
            Ce document ne fait foi qu'une fois signé. Il contient des données de santé : ne le
            transmettez qu'à un destinataire de confiance.
          </p>
        </section>
      </main>

      <LegalNotice />

      {reading && (
        <OcrReview
          meta={reading}
          birthDate={child.birthDate}
          onCancel={() => setReading(null)}
          onConfirm={async (lines) => {
            for (const l of lines) {
              const id = newId()
              await mutate((v) => {
                v.vaccinations.push({
                  id,
                  childId: child.id,
                  valences: l.valences,
                  date: l.date,
                  productName: l.productName,
                  lotNumber: l.lotNumber,
                  source: 'ocr-local',
                  verifiedByUser: l.verified,
                  attachmentIds: [],
                  createdAt: stamp(),
                  updatedAt: stamp(),
                })
              })
              // La photo d'origine reste attachée : c'est la pièce justificative.
              await attachToVaccination(id, reading.id)
            }
            setReading(null)
            await onChange()
          }}
        />
      )}
    </div>
  )
}

function EventRow({ event, onDelete, onVerify, explanations, labels }: {
  event: VaccinationEvent
  onDelete: () => void
  onVerify: () => void
  explanations: Map<string, Explanation>
  labels: Map<string, string>
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="border-line bg-surface rounded-[12px] border p-3.5"
      style={{ borderLeft: `3px solid ${event.verifiedByUser ? '#1E7351' : '#A87F1F'}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[15px] font-semibold tracking-tight">{humanDate(event.date)}</span>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {event.valences.map((code) => {
              const explanation = explanations.get(code)
              const name = labels.get(code) ?? code
              return (
                <li key={code}
                  className="border-line bg-paper-sunken text-ink-strong rounded-full border px-2 py-0.5 text-[11.5px]">
                  {explanation
                    ? <Explainable explanation={explanation}>{name}</Explainable>
                    : name}
                </li>
              )
            })}
          </ul>
          {(event.productName || event.lotNumber) && (
            <span className="text-ink-faint truncate text-[12px]">
              {event.productName}{event.productName && event.lotNumber ? ' · lot ' : ''}{event.lotNumber}
            </span>
          )}
        </div>
        <Explainable
          explanation={verifiedExplanation()}
          className={`shrink-0 text-[11px] font-bold ${event.verifiedByUser ? 'text-ok' : 'text-due'}`}
        >
          {event.verifiedByUser ? 'Vérifié' : 'Non vérifié'}
        </Explainable>
      </div>
      <div className="bg-line-soft my-2.5 h-px" />
      {confirming ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-strong text-[12.5px]">Retirer cette vaccination ?</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirming(false)}
              className="text-ink-muted min-h-11 px-2 text-[13px] font-semibold">Annuler</button>
            <button onClick={onDelete}
              className="bg-late min-h-11 rounded-[8px] px-3.5 text-[13px] font-semibold text-white">Retirer</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => setConfirming(true)}
            className="text-ink-muted min-h-11 text-[12.5px] font-medium underline">
            Corriger ou retirer
          </button>
          {!event.verifiedByUser && (
            <button onClick={onVerify}
              className="border-ok-border bg-ok-bg text-ok inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[12.5px] font-semibold">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E7351" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Marquer vérifié
            </button>
          )}
        </div>
      )}
    </li>
  )
}

async function exportRecap(
  child: Child, schedule: Schedule, events: VaccinationEvent[], options: RecapOptions,
) {
  const attachments = options.includePhotos ? await listAttachments(child.id) : []
  const bytes = await buildRecap(child, schedule, events, attachments, options)
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `recapitulatif-vaccinal-${child.firstName.toLowerCase()}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

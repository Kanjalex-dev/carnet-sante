import { useEffect, useState } from 'react'
import productsData from '../data/products-fr.json'
import scheduleData from '../data/schedules/fr-2025.json'
import { parseLines, type ProductSpec, type Proposal } from '../domain/parse'
import { isISODate, today as todayFn } from '../domain/dates'
import type { Schedule } from '../domain/types'
import { type AttachmentMeta, readAttachment } from '../storage/repository'
import { OcrUnavailableError, preprocess, recognise, releaseOcr } from '../storage/ocr'
import { toObjectURL } from '../storage/image'
import { Button } from './atoms'
import { frDate } from './format'
import { Explainable } from './Explain'
import { buildLabelIndex, buildValenceIndex, confidenceExplanation } from './explanations'

const PRODUCTS = (productsData as { products: ProductSpec[] }).products
const SCHEDULE = scheduleData as Schedule
const VALENCE_EXPLANATIONS = buildValenceIndex(SCHEDULE)
const VALENCE_LABELS = buildLabelIndex(SCHEDULE)

export interface AcceptedLine {
  date: string
  productName?: string
  lotNumber?: string
  valences: string[]
  /** Vrai seulement si la ligne a été confirmée une par une, photo sous les yeux. */
  verified: boolean
}

type Phase = 'working' | 'ready' | 'empty' | 'error'

export function OcrReview({ meta, birthDate, onCancel, onConfirm }: {
  meta: AttachmentMeta
  birthDate: string
  onCancel: () => void
  onConfirm: (lines: AcceptedLine[]) => Promise<void>
}) {
  const [phase, setPhase] = useState<Phase>('working')
  const [step, setStep] = useState('Préparation')
  const [ratio, setRatio] = useState(0)
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    let alive = true
    let objectUrl: string | null = null
    void (async () => {
      try {
        const bytes = await readAttachment(meta.id)
        if (!bytes || !alive) return
        objectUrl = toObjectURL(bytes, meta.mimeType)
        setUrl(objectUrl)

        const prepared = await preprocess(bytes, meta.mimeType)
        if (!alive) return
        const lines = await recognise(prepared, 'image/png', (s, r) => {
          if (!alive) return
          setStep(s)
          setRatio(r)
        })
        if (!alive) return
        const proposals = parseLines(lines, {
          products: PRODUCTS,
          currentYear: Number(todayFn().slice(0, 4)),
          birthDate,
          today: todayFn(),
        })
        setRows(proposals.map(toRow))
        setPhase(proposals.length === 0 ? 'empty' : 'ready')
      } catch (e) {
        if (!alive) return
        console.error('Lecture de la page', e)
        setMessage(
          e instanceof OcrUnavailableError
            ? e.message
            : "La lecture a échoué. Vous pouvez saisir les vaccins à la main.",
        )
        setPhase('error')
      }
    })()
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      void releaseOcr()
    }
  }, [meta.id, meta.mimeType, birthDate])

  const accepted = rows.filter((r) => r.accepted && isISODate(r.date))

  return (
    <div className="bg-paper fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true"
      aria-label="Vérifier la lecture de la page">
      <header className="border-line bg-paper flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <button onClick={onCancel} className="text-ink min-h-11 shrink-0 px-1 text-[14px] font-semibold">
          Annuler
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold tracking-tight">Vérifier la lecture</span>
          <span className="text-ink-muted truncate text-[12px]">Lecture locale · rien n'a été envoyé</span>
        </div>
      </header>

      {/* Volet 1 — la photo, toujours visible, agrandissable */}
      <button onClick={() => setZoom(true)}
        className="relative block h-[34vh] w-full shrink-0 bg-[#101C27]"
        aria-label="Agrandir la page du carnet">
        {url && <img src={url} alt="Page du carnet" className="h-full w-full object-contain" />}
        <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /><path d="M11 8v6" /><path d="M8 11h6" />
          </svg>
          Agrandir
        </span>
      </button>

      {zoom && url && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true"
          aria-label="Page du carnet agrandie">
          <div className="flex shrink-0 justify-end px-4 py-3">
            <button onClick={() => setZoom(false)} className="min-h-11 px-2 text-[14px] font-semibold text-white">
              Fermer
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <img src={url} alt="Page du carnet, taille réelle" className="mx-auto max-w-none"
              style={{ width: '200%' }} />
          </div>
          <p className="m-0 px-4 py-3 text-center text-[12px] text-white/70">
            Faites glisser pour parcourir la page.
          </p>
        </div>
      )}

      {/* Volet 2 — les propositions */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {phase === 'working' && <Working step={step} ratio={ratio} />}

        {phase === 'error' && (
          <p className="border-late-border bg-late-bg text-ink-strong m-0 rounded-[12px] border px-3.5 py-3 text-[13.5px] leading-snug text-pretty">
            {message}
          </p>
        )}

        {phase === 'empty' && (
          <div className="border-line-strong bg-surface-soft flex flex-col gap-2 rounded-[12px] border border-dashed px-4 py-6">
            <p className="m-0 text-center text-[14px] font-semibold">Aucune ligne exploitable</p>
            <p className="text-ink-muted m-0 text-center text-[12.5px] leading-snug text-pretty">
              Sur de l'écriture manuscrite, la lecture locale échoue souvent. Cadrez au plus près
              du tableau, à plat et bien éclairé — ou saisissez les vaccins à la main.
            </p>
          </div>
        )}

        {phase === 'ready' && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
                {rows.length} ligne{rows.length > 1 ? 's' : ''} détectée{rows.length > 1 ? 's' : ''}
              </h2>
              <button
                onClick={() => setRows((rs) => rs.map((r) => ({ ...r, accepted: true, verified: false })))}
                className="text-blue-500 min-h-11 text-[12.5px] font-semibold">
                Tout accepter
              </button>
            </div>

            {rows.map((row, i) => (
              <ProposalCard key={i} row={row}
                onChange={(patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))} />
            ))}

            <p className="text-ink-muted m-0 text-[12px] leading-snug text-pretty">
              « Tout accepter » enregistre les lignes sans les marquer vérifiées : elles resteront
              signalées comme telles, y compris dans le récapitulatif.
            </p>
          </>
        )}
      </div>

      <footer className="border-line bg-paper flex shrink-0 flex-col gap-2 border-t px-4 py-3">
        <p className="text-ink-muted m-0 text-[11.5px] leading-snug text-pretty">
          Rien n'est enregistré tant que vous n'avez pas validé.
        </p>
        <Button full disabled={accepted.length === 0 || saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onConfirm(accepted.map((r) => ({
                date: r.date, productName: r.productName || undefined,
                lotNumber: r.lotNumber || undefined, valences: r.valences, verified: r.verified,
              })))
            } finally { setSaving(false) }
          }}>
          {accepted.length === 0
            ? 'Aucune ligne validée'
            : `Enregistrer ${accepted.length} vaccination${accepted.length > 1 ? 's' : ''}`}
        </Button>
      </footer>
    </div>
  )
}

function Working({ step, ratio }: { step: string; ratio: number }) {
  return (
    <div className="border-line bg-surface flex flex-col gap-2.5 rounded-[12px] border px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold">{step}…</span>
        <span className="text-ink-muted tnum text-[12px]">{Math.round(ratio * 100)} %</span>
      </div>
      <div className="bg-line h-1.5 overflow-hidden rounded-full">
        <div className="bg-blue-500 h-full rounded-full transition-[width]"
          style={{ width: `${Math.max(4, ratio * 100)}%` }} />
      </div>
      <p className="text-ink-muted m-0 text-[12px] leading-snug text-pretty">
        Le moteur de lecture se télécharge une seule fois, puis reste disponible hors ligne.
      </p>
    </div>
  )
}

interface Row {
  date: string
  productName: string
  lotNumber: string
  valences: string[]
  confidence: number
  rawLine: string
  warnings: string[]
  accepted: boolean
  verified: boolean
}

function toRow(p: Proposal): Row {
  return {
    date: p.date ?? '',
    productName: p.productName ?? '',
    lotNumber: p.lotNumber ?? '',
    valences: p.valences,
    confidence: p.confidence,
    rawLine: p.rawLine,
    warnings: p.warnings,
    accepted: false,
    verified: false,
  }
}

function ProposalCard({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  const [open, setOpen] = useState(false)
  const pct = Math.round(row.confidence * 100)
  const tone = pct >= 80 ? 'ok' : pct >= 55 ? 'due' : 'late'
  const chip = {
    ok: 'text-ok bg-ok-bg border-ok-border',
    due: 'text-due bg-due-bg border-due-border',
    late: 'text-late bg-late-bg border-late-border',
  }[tone]
  const rail = { ok: '#1E7351', due: '#A87F1F', late: '#B23D1F' }[tone]
  const valid = isISODate(row.date)

  return (
    <article className="border-line bg-surface rounded-[12px] border p-3.5"
      style={{ borderLeft: `3px solid ${rail}` }}>
      <div className="flex items-start gap-3">
        <button
          aria-pressed={row.accepted}
          aria-label={row.accepted ? 'Ligne acceptée' : 'Accepter cette ligne'}
          onClick={() => onChange({ accepted: !row.accepted, verified: !row.accepted })}
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border ${
            row.accepted ? 'bg-ok border-ok' : 'bg-surface-soft border-line-strong'
          }`}>
          {row.accepted && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 text-[14.5px] leading-snug font-semibold">
              {row.productName || 'Produit inconnu'}
            </span>
            <Explainable
              explanation={confidenceExplanation(pct)}
              ariaLabel={`Indice de confiance ${pct} % — voir l'explication`}
              className={`tnum shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold no-underline ${chip}`}
            >
              {pct} %
            </Explainable>
          </div>
          <span className="text-ink-strong tnum text-[13px] font-medium">
            {row.date ? frDate(row.date) : 'Date à saisir'}
          </span>
          {row.valences.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {row.valences.map((code) => {
                const explanation = VALENCE_EXPLANATIONS.get(code)
                const name = VALENCE_LABELS.get(code) ?? code
                return (
                  <li key={code}
                    className="border-line bg-paper-sunken text-ink-strong rounded-full border text-[11.5px]">
                    {explanation
                      ? (
                        <Explainable explanation={explanation} hitArea="none"
                          className="flex min-h-8 items-center px-2.5">
                          {name}
                        </Explainable>
                      )
                      : <span className="flex min-h-8 items-center px-2.5">{name}</span>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <span className="text-ink-muted text-[12px] leading-snug">Vaccins à préciser</span>
          )}
          {row.lotNumber && (
            <span className="text-ink-muted tnum text-[12px] leading-snug">Lot {row.lotNumber}</span>
          )}
          {row.warnings.length > 0 && (
            <span className="text-due mt-0.5 text-[12px] leading-snug font-medium">
              {row.warnings.join(' · ')}
            </span>
          )}
        </div>
      </div>

      <div className="bg-line-soft my-2.5 h-px" />

      {!open ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-faint min-w-0 flex-1 truncate text-[11.5px] italic">
            « {row.rawLine} »
          </span>
          <button onClick={() => setOpen(true)}
            className="text-ink-muted min-h-11 shrink-0 text-[12.5px] font-medium underline">
            Corriger
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Date</span>
            <input type="date" value={row.date} max={todayFn()} min={'1900-01-01'}
              onChange={(e) => onChange({ date: e.target.value, verified: true })}
              className="border-line-strong bg-surface tnum min-h-11 w-full rounded-[8px] border px-3 text-[16px]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Produit</span>
            <input list="carnet-produits" value={row.productName}
              onChange={(e) => {
                const match = PRODUCTS.find((p) => p.name === e.target.value)
                onChange({
                  productName: e.target.value, verified: true,
                  valences: match ? match.valences : row.valences,
                })
              }}
              className="border-line-strong bg-surface min-h-11 w-full rounded-[8px] border px-3 text-[16px]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">N° de lot</span>
            <input value={row.lotNumber} onChange={(e) => onChange({ lotNumber: e.target.value, verified: true })}
              className="border-line-strong bg-surface tnum min-h-11 w-full rounded-[8px] border px-3 text-[16px]" />
          </label>
          {!valid && <p className="text-late m-0 text-[12.5px] font-medium">Une date valide est nécessaire pour enregistrer cette ligne.</p>}
          <button onClick={() => setOpen(false)}
            className="text-ink-muted min-h-11 self-start text-[12.5px] font-medium underline">
            Replier
          </button>
        </div>
      )}

      <datalist id="carnet-produits">
        {PRODUCTS.map((p) => <option key={p.name} value={p.name} />)}
      </datalist>
    </article>
  )
}


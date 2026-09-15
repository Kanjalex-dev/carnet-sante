import { useEffect, useRef, useState } from 'react'
import {
  type AttachmentMeta, deleteAttachment, listAttachments, newId, putAttachment, readAttachment,
} from '../storage/repository'
import { ImageTooLargeError, NotAnImageError, formatBytes, processImage, toObjectURL } from '../storage/image'
import { Button } from './atoms'
import { frStamp } from './format'



export function PhotoSection({ childId, refreshKey = 0, onRead }: {
  childId: string
  refreshKey?: number
  onRead?: (meta: AttachmentMeta) => void
}) {
  const [items, setItems] = useState<AttachmentMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<AttachmentMeta | null>(null)

  const refresh = async () => setItems(await listAttachments(childId))
  useEffect(() => { void refresh() }, [childId, refreshKey])

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true); setError(null)
    try {
      for (const file of Array.from(files)) {
        const img = await processImage(file)
        await putAttachment({
          id: newId(), childId, mimeType: img.mimeType,
          width: img.width, height: img.height, bytes: img.bytes.length,
          capturedAt: new Date().toISOString(),
        }, img.bytes)
      }
      await refresh()
    } catch (e) {
      console.error('Traitement de la photo', e)
      setError(
        e instanceof NotAnImageError ? "Ce fichier n'est pas une image."
        : e instanceof ImageTooLargeError ? 'Fichier trop volumineux (25 Mo maximum).'
        : "Cette photo n'a pas pu être lue. Réessayez, ou choisissez un autre fichier.",
      )
    } finally { setBusy(false) }
  }

  const total = items.reduce((s, a) => s + a.bytes, 0)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
          Pages photographiées
        </h2>
        {items.length > 0 && (
          <span className="text-ink-faint text-[11.5px]">
            {items.length} · {formatBytes(total)}
          </span>
        )}
      </div>

      <AddPhoto onFiles={add} busy={busy} />

      {error && (
        <p className="border-late-border bg-late-bg text-late m-0 rounded-[12px] border px-3.5 py-2.5 text-[13px] font-medium">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="border-line-strong bg-surface-soft flex flex-col items-center gap-2 rounded-[12px] border border-dashed px-4 py-7">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8496A5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" /><path d="M8 8h7" /><path d="M8 12h5" />
          </svg>
          <p className="m-0 text-center text-[13.5px] font-semibold">Aucune page enregistrée</p>
          <p className="text-ink-muted m-0 max-w-[280px] text-center text-[12.5px] leading-snug text-pretty">
            Photographiez les pages de vaccination : ce sont elles qui font preuve, jointes au récapitulatif.
          </p>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0">
          {items.map((a) => <Thumb key={a.id} meta={a} onOpen={() => setOpen(a)} />)}
        </ul>
      )}

      <p className="text-ink-muted m-0 text-[12px] leading-snug text-pretty">
        Les métadonnées de prise de vue — dont la localisation GPS — sont supprimées à
        l'enregistrement. Rien n'est envoyé.
      </p>

      {open && (
        <Viewer
          meta={open}
          onClose={() => setOpen(null)}
          onRead={onRead ? () => { const m = open; setOpen(null); onRead(m) } : undefined}
          onDelete={async () => { await deleteAttachment(open.id); setOpen(null); await refresh() }}
        />
      )}
    </section>
  )
}

function AddPhoto({ onFiles, busy }: { onFiles: (f: FileList | null) => void; busy: boolean }) {
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  return (
    <div className="flex gap-2.5">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      <input ref={library} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      <div className="flex-1">
        <Button full onClick={() => camera.current?.click()} disabled={busy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 4h-5L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-3l-2.5-3Z" /><circle cx="12" cy="13" r="3.5" />
          </svg>
          {busy ? 'Traitement…' : 'Photographier'}
        </Button>
      </div>
      <div className="flex-1">
        <Button full variant="secondary" onClick={() => library.current?.click()} disabled={busy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#33414F" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" /><path d="m4 16 4.5-4.5 3 3L16 10l4 4" /><circle cx="9" cy="9" r="1.4" />
          </svg>
          Importer
        </Button>
      </div>
    </div>
  )
}

function useImageURL(id: string, mimeType: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoked: string | null = null
    let alive = true
    void (async () => {
      const bytes = await readAttachment(id)
      if (!bytes || !alive) return
      revoked = toObjectURL(bytes, mimeType)
      setUrl(revoked)
    })()
    return () => { alive = false; if (revoked) URL.revokeObjectURL(revoked) }
  }, [id, mimeType])
  return url
}

function Thumb({ meta, onOpen }: { meta: AttachmentMeta; onOpen: () => void }) {
  const url = useImageURL(meta.id, meta.mimeType)
  return (
    <li>
      <button onClick={onOpen}
        className="border-line bg-surface block w-full overflow-hidden rounded-[12px] border p-0 text-left">
        <span className="bg-paper-sunken block aspect-[3/4] w-full">
          {url && <img src={url} alt="Page du carnet" className="h-full w-full object-cover" />}
        </span>
        <span className="text-ink-muted block truncate px-2 py-1.5 text-[11px]">
          {frStamp(meta.capturedAt)}
        </span>
      </button>
    </li>
  )
}

function Viewer({ meta, onClose, onDelete, onRead }: {
  meta: AttachmentMeta; onClose: () => void; onDelete: () => void; onRead?: () => void
}) {
  const url = useImageURL(meta.id, meta.mimeType)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label="Page du carnet">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button onClick={onClose} className="min-h-11 shrink-0 px-2 text-[14px] font-semibold text-white">Fermer</button>
        <span className="shrink-0 text-[12px] text-white/70">
          {meta.width}×{meta.height} · {formatBytes(meta.bytes)}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center px-3">
        {url && <img src={url} alt="Page du carnet, taille réelle" className="max-h-full max-w-full object-contain" />}
      </div>
      <div className="flex flex-col gap-2 px-4 py-4">
        {onRead && !confirming && (
          <button onClick={onRead}
            className="bg-blue-500 flex min-h-12 items-center justify-center gap-2 rounded-[8px] text-[14.5px] font-semibold text-white">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7V5a1 1 0 0 1 1-1h2" /><path d="M17 4h2a1 1 0 0 1 1 1v2" />
              <path d="M20 17v2a1 1 0 0 1-1 1h-2" /><path d="M7 20H5a1 1 0 0 1-1-1v-2" />
              <path d="M7 12h10" />
            </svg>
            Lire cette page
          </button>
        )}
        {confirming ? (
          <>
            <p className="m-0 text-center text-[13px] text-white">
              Supprimer définitivement cette page ? Elle n'est stockée nulle part ailleurs.
            </p>
            <div className="flex gap-2">
              <div className="flex-1"><Button full variant="secondary" onClick={() => setConfirming(false)}>Annuler</Button></div>
              <button onClick={onDelete}
                className="bg-late min-h-11 flex-1 rounded-[8px] text-[14px] font-semibold text-white">
                Supprimer
              </button>
            </div>
          </>
        ) : (
          <button onClick={() => setConfirming(true)}
            className="min-h-11 text-[14px] font-semibold text-white/80">
            Supprimer cette page
          </button>
        )}
      </div>
    </div>
  )
}


/**
 * Sélecteur de page : sert à rattacher une photo déjà enregistrée à une
 * vaccination. Une photo peut justifier plusieurs injections d'un même
 * rendez-vous, donc on ne la déplace pas — on l'associe.
 */
export function PhotoPicker({ childId, attachedIds, onPick, onCancel }: {
  childId: string
  attachedIds: string[]
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const [items, setItems] = useState<AttachmentMeta[]>([])
  useEffect(() => { void listAttachments(childId).then(setItems) }, [childId])

  const available = items.filter((a) => !attachedIds.includes(a.id))

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true"
      aria-label="Choisir une page du carnet">
      <button aria-label="Fermer" onClick={onCancel} className="absolute inset-0 block bg-black/40" />
      <div className="bg-paper relative max-h-[80vh] w-full max-w-[440px] overflow-y-auto rounded-t-2xl px-5 pt-4 pb-7">
        <div className="bg-line-strong mx-auto mb-4 h-1 w-10 rounded-full" aria-hidden="true" />
        <h2 className="font-display m-0 text-[20px] leading-tight font-medium tracking-tight">
          Joindre une page du carnet
        </h2>
        <p className="text-ink-muted mt-1 mb-4 text-[13px] leading-snug text-pretty">
          Choisissez la page où cette vaccination est inscrite. Elle servira de preuve dans le
          récapitulatif.
        </p>

        {available.length === 0 ? (
          <p className="border-line bg-surface text-ink-muted m-0 rounded-[12px] border px-3.5 py-4 text-[13px] leading-snug text-pretty">
            {items.length === 0
              ? "Aucune page enregistrée. Photographiez d'abord le carnet depuis l'onglet Carnet."
              : 'Toutes les pages enregistrées sont déjà jointes à cette vaccination.'}
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0">
            {available.map((a) => <Thumb key={a.id} meta={a} onOpen={() => onPick(a.id)} />)}
          </ul>
        )}

        <button onClick={onCancel}
          className="border-line-strong bg-surface text-ink-strong mt-5 flex min-h-11 w-full items-center justify-center rounded-[8px] border text-[14px] font-semibold">
          Annuler
        </button>
      </div>
    </div>
  )
}

/** Vignettes des pages jointes à une vaccination, en petit format. */
export function AttachedThumbs({ ids, onRemove }: { ids: string[]; onRemove?: (id: string) => void }) {
  const [metas, setMetas] = useState<AttachmentMeta[]>([])
  useEffect(() => {
    let alive = true
    void (async () => {
      const all: AttachmentMeta[] = []
      for (const id of ids) {
        const bytes = await readAttachment(id)
        if (bytes) all.push({ id } as AttachmentMeta)
      }
      if (alive) setMetas(all)
    })()
    return () => { alive = false }
  }, [ids.join(',')])

  if (metas.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {metas.map((m) => <MiniThumb key={m.id} id={m.id} onRemove={onRemove} />)}
    </ul>
  )
}

function MiniThumb({ id, onRemove }: { id: string; onRemove?: (id: string) => void }) {
  const url = useImageURL(id, 'image/jpeg')
  return (
    <li className="relative">
      <span className="border-line bg-paper-sunken block h-14 w-11 overflow-hidden rounded-[6px] border">
        {url && <img src={url} alt="Page jointe" className="h-full w-full object-cover" />}
      </span>
      {onRemove && (
        <button onClick={() => onRemove(id)} aria-label="Détacher cette page"
          className="border-line bg-surface text-ink-muted absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-[13px] leading-none">
          ×
        </button>
      )}
    </li>
  )
}

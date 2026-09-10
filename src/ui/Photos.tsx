import { useEffect, useRef, useState } from 'react'
import {
  type AttachmentMeta, deleteAttachment, listAttachments, newId, putAttachment, readAttachment,
} from '../storage/repository'
import { ImageTooLargeError, NotAnImageError, formatBytes, processImage, toObjectURL } from '../storage/image'
import { Button, LegalNotice } from './atoms'

const FR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

export function Photos({ childId, childName }: { childId: string; childName: string }) {
  const [items, setItems] = useState<AttachmentMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<AttachmentMeta | null>(null)

  const refresh = async () => setItems(await listAttachments(childId))
  useEffect(() => { void refresh() }, [childId])

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
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">
      <header className="flex flex-col gap-1 px-5 pt-4 pb-3">
        <h1 className="font-display m-0 text-[26px] leading-tight font-medium tracking-tight">
          Le carnet de {childName}
        </h1>
        <p className="text-ink-muted m-0 text-[13px]">
          {items.length === 0
            ? 'Photographiez les pages de vaccination : elles servent de preuve.'
            : `${items.length} page${items.length > 1 ? 's' : ''} · ${formatBytes(total)} sur cet appareil`}
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-5 pb-6">
        <AddPhoto onFiles={add} busy={busy} />

        {error && (
          <p className="border-late-border bg-late-bg text-late m-0 rounded-[12px] border px-3.5 py-2.5 text-[13px] font-medium">
            {error}
          </p>
        )}

        {items.length === 0 ? (
          <div className="border-line-strong bg-surface-soft flex flex-col items-center gap-2 rounded-[12px] border border-dashed px-4 py-8">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A79EAD" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" /><path d="M8 8h7" /><path d="M8 12h5" />
            </svg>
            <p className="m-0 text-center text-[14px] font-semibold">Aucune page enregistrée</p>
            <p className="text-ink-muted m-0 max-w-[280px] text-center text-[12.5px] leading-snug text-pretty">
              Les photos restent sur cet appareil. Elles ne sont ni envoyées, ni analysées.
            </p>
          </div>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
            {items.map((a) => <Thumb key={a.id} meta={a} onOpen={() => setOpen(a)} />)}
          </ul>
        )}

        <p className="text-ink-muted m-0 text-[12px] leading-snug text-pretty">
          Les métadonnées de prise de vue — dont la localisation GPS — sont supprimées
          à l'enregistrement.
        </p>
      </main>

      <LegalNotice />

      {open && (
        <Viewer
          meta={open}
          onClose={() => setOpen(null)}
          onDelete={async () => { await deleteAttachment(open.id); setOpen(null); await refresh() }}
        />
      )}
    </div>
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#443E49" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        <span className="text-ink-muted block px-2.5 py-2 text-[11.5px]">
          {FR.format(new Date(meta.capturedAt))} · {formatBytes(meta.bytes)}
        </span>
      </button>
    </li>
  )
}

function Viewer({ meta, onClose, onDelete }: {
  meta: AttachmentMeta; onClose: () => void; onDelete: () => void
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
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onClose} className="min-h-11 px-2 text-[14px] font-semibold text-white">Fermer</button>
        <span className="text-[12px] text-white/70">
          {meta.width}×{meta.height} · {formatBytes(meta.bytes)}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center px-3">
        {url && <img src={url} alt="Page du carnet, taille réelle" className="max-h-full max-w-full object-contain" />}
      </div>
      <div className="flex flex-col gap-2 px-4 py-4">
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

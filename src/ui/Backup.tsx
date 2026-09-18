import { useRef, useState } from 'react'
import {
  type BackupFile, type BackupPayload,
  NotABackupFileError, UnsupportedVersionError, WrongPassphraseError,
  backupFilename, exportBackup, peekBackup, readBackup,
} from '../storage/backup'
import { collectBackup, readVault, restoreBackup } from '../storage/repository'
import {
  exportFilename, growthCsv, rawJson, vaccinationsCsv,
} from '../storage/rawExport'
import { Button } from './atoms'
import { PassphraseDialog, download } from './Share'

/**
 * Sauvegarde et restauration.
 *
 * Le carnet vit sur un seul appareil, sans serveur : c'est ce qui protège les
 * données, et c'est aussi ce qui les met en danger. Un téléphone perdu emporte
 * dix-huit ans de suivi. Cette section est donc gratuite et le restera : la
 * perte de données est un défaut du produit, pas une fonctionnalité à vendre.
 *
 * La restauration REMPLACE tout. Elle passe par une confirmation qui annonce
 * ce que contient le fichier ET ce qui va disparaître, avant d'écrire.
 */

type Phase =
  | { step: 'idle' }
  | { step: 'export' }
  | { step: 'passphrase'; text: string; file: BackupFile }
  | { step: 'confirm'; payload: BackupPayload; file: BackupFile }
  | { step: 'done'; message: string }

function frStamp(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function countLine(f: BackupFile): string {
  const s = f.summary
  const parts = [
    `${s.children} enfant${s.children > 1 ? 's' : ''}`,
    `${s.vaccinations} vaccination${s.vaccinations > 1 ? 's' : ''}`,
    `${s.growth} mesure${s.growth > 1 ? 's' : ''}`,
  ]
  if (s.attachments > 0) parts.push(`${s.attachments} page${s.attachments > 1 ? 's' : ''} photographiée${s.attachments > 1 ? 's' : ''}`)
  return parts.join(', ')
}

export function BackupSection({ onRestored }: { onRestored: () => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
        Sauvegarde
      </h2>
      <div className="border-line bg-surface flex flex-col gap-3 rounded-[12px] border p-4">
        <p className="text-ink-muted m-0 text-[12.5px] leading-snug text-pretty">
          Ce carnet n’existe que sur cet appareil. Une sauvegarde chiffrée, rangée dans vos
          fichiers ou votre cloud, est la seule chose qui le retrouvera si vous changez ou
          perdez votre téléphone. Elle contient tout, pages photographiées comprises.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setError(null); setPhase({ step: 'export' }) }}>
            Sauvegarder
          </Button>
          <Button variant="secondary" onClick={() => { setError(null); fileInput.current?.click() }}>
            Restaurer
          </Button>
        </div>
        {phase.step === 'done' && (
          <p className="text-ok m-0 text-[13px] font-semibold text-pretty">{phase.message}</p>
        )}
        {error && <p className="text-late m-0 text-[13px] font-medium text-pretty">{error}</p>}

        <input ref={fileInput} type="file" accept=".carnetbak,application/json" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const text = await f.text()
            try {
              setPhase({ step: 'passphrase', text, file: peekBackup(text) })
            } catch (err) {
              setError(
                err instanceof UnsupportedVersionError
                  ? 'Cette sauvegarde vient d’une version plus récente de l’application.'
                  : 'Ce fichier n’est pas une sauvegarde de Carnet. Un fichier de partage co-parent ne contient pas les photos et ne peut pas servir de sauvegarde.',
              )
            }
          }} />
      </div>

      {phase.step === 'export' && (
        <PassphraseDialog
          title="Sauvegarder le carnet"
          intro="Choisissez une phrase. Elle seule ouvrira cette sauvegarde : notez-la ailleurs que sur ce téléphone, sinon la sauvegarde ne servira à rien le jour où vous en aurez besoin."
          cta="Enregistrer le fichier"
          onCancel={() => setPhase({ step: 'idle' })}
          onSubmit={async (p) => {
            const payload = await collectBackup()
            download(await exportBackup(payload, p), backupFilename())
            setPhase({
              step: 'done',
              message: `Sauvegarde enregistrée — ${payload.vault.vaccinations.length} vaccinations, ${payload.attachments.length} page(s) photographiée(s).`,
            })
            return null
          }}
        />
      )}

      {phase.step === 'passphrase' && (
        <PassphraseDialog
          title="Ouvrir la sauvegarde"
          intro={`Sauvegarde du ${frStamp(phase.file.exportedAt)} : ${countLine(phase.file)}. Saisissez la phrase choisie au moment de l’enregistrer.`}
          cta="Ouvrir"
          onCancel={() => setPhase({ step: 'idle' })}
          onSubmit={async (p) => {
            try {
              const payload = await readBackup(phase.text, p)
              setPhase({ step: 'confirm', payload, file: phase.file })
              return null
            } catch (err) {
              if (err instanceof WrongPassphraseError) {
                return 'Phrase incorrecte, ou fichier abîmé.'
              }
              if (err instanceof NotABackupFileError) return 'Ce fichier n’est pas une sauvegarde.'
              throw err
            }
          }}
        />
      )}

      <RawExportRow />

      {phase.step === 'confirm' && (
        <ReplaceDialog
          file={phase.file}
          onCancel={() => setPhase({ step: 'idle' })}
          onConfirm={async () => {
            await restoreBackup(phase.payload)
            await onRestored()
            setPhase({ step: 'done', message: 'Carnet restauré depuis la sauvegarde.' })
          }}
        />
      )}
    </section>
  )
}

/**
 * La confirmation dit ce qui arrive, pas « êtes-vous sûr ». Une restauration
 * écrase le carnet présent sur l'appareil : si c'est le mauvais fichier, on
 * ne le rattrape pas.
 */
function ReplaceDialog({ file, onCancel, onConfirm }: {
  file: BackupFile
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35" role="dialog"
      aria-modal="true" aria-label="Remplacer le carnet de cet appareil">
      <div className="bg-paper w-full max-w-[440px] rounded-t-2xl px-5 pt-5 pb-7">
        <h2 className="font-display m-0 text-[22px] leading-tight font-medium tracking-tight">
          Remplacer le carnet de cet appareil
        </h2>
        <p className="text-ink-muted mt-1 mb-4 text-[13px] leading-snug text-pretty">
          La sauvegarde du {frStamp(file.exportedAt)} contient {countLine(file)}.
        </p>
        <div className="border-late-border bg-late-bg rounded-[10px] border p-3">
          <p className="text-late m-0 text-[13px] leading-snug font-medium text-pretty">
            Tout ce que contient ce téléphone aujourd’hui sera effacé et remplacé. Cette
            opération ne peut pas être annulée.
          </p>
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <div className="flex-1">
            <Button full disabled={busy}
              onClick={async () => {
                setBusy(true)
                try { await onConfirm() } finally { setBusy(false) }
              }}>
              {busy ? 'Restauration…' : 'Remplacer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Sortie des données brutes, en clair. Placée sous la sauvegarde parce
 * qu'elle en est le contraire exact : la sauvegarde est chiffrée et faite
 * pour revenir dans Carnet, ceci est lisible et fait pour en partir.
 *
 * L'avertissement est au-dessus des boutons, pas en dessous : après le
 * téléchargement, il ne sert plus à rien.
 */
function RawExportRow() {
  const [busy, setBusy] = useState(false)

  const emit = async (kind: 'vaccinations' | 'croissance' | 'carnet') => {
    setBusy(true)
    try {
      const v = await readVault()
      if (kind === 'vaccinations') {
        download(vaccinationsCsv(v, v.children), exportFilename('vaccinations', 'csv'))
      } else if (kind === 'croissance') {
        download(growthCsv(v, v.children), exportFilename('croissance', 'csv'))
      } else {
        download(rawJson(v), exportFilename('carnet', 'json'))
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="border-line bg-surface mt-3 flex flex-col gap-3 rounded-[12px] border p-4">
      <h3 className="text-ink m-0 text-[14px] font-semibold">Emporter les données</h3>
      <p className="text-ink-muted m-0 text-[12.5px] leading-snug text-pretty">
        Un tableur ou une autre application peuvent lire ces fichiers directement. Ils ne sont
        donc pas chiffrés : ne les laissez pas traîner dans un dossier partagé.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => { void emit('vaccinations') }}>
          Vaccinations (CSV)
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => { void emit('croissance') }}>
          Croissance (CSV)
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => { void emit('carnet') }}>
          Tout (JSON)
        </Button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Button } from './atoms'

/** Écran de déverrouillage : la phrase secrète n'est jamais stockée. */
export function Unlock({ onUnlock, onWipe }: {
  onUnlock: (passphrase: string) => Promise<boolean>
  onWipe: () => Promise<void>
}) {
  const [passphrase, setPassphrase] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lost, setLost] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState('')

  const submit = async () => {
    setBusy(true); setFailed(false)
    const ok = await onUnlock(passphrase)
    if (!ok) { setFailed(true); setPassphrase('') }
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col gap-2">
        <div className="h-9 w-9 rounded-full" style={{ background: 'linear-gradient(140deg,#275C94 0%,#C46B8B 100%)' }} />
        <h1 className="font-display m-0 text-[28px] leading-tight font-medium tracking-tight">Carnet verrouillé</h1>
        <p className="text-ink-muted m-0 text-[15px] text-pretty">
          Saisissez la phrase secrète pour déchiffrer les données de cet appareil.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <label className="flex flex-col gap-2">
          <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Phrase secrète</span>
          <input type="password" value={passphrase} autoFocus autoComplete="current-password"
            onChange={(e) => setPassphrase(e.target.value)}
            className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]" />
        </label>
        {failed && (
          <p className="text-late m-0 text-[13px] font-medium">
            Phrase incorrecte. Aucune tentative n'est enregistrée, mais sans elle les données
            restent illisibles.
          </p>
        )}
        <Button type="submit" full disabled={busy || passphrase.length === 0}>
          {busy ? 'Déchiffrement…' : 'Déverrouiller'}
        </Button>
      </form>

      {!lost ? (
        <button onClick={() => setLost(true)} className="text-ink-muted min-h-11 text-[13px] font-medium underline">
          Phrase secrète perdue ?
        </button>
      ) : (
        <div className="border-late-border bg-late-bg flex flex-col gap-3 rounded-[12px] border p-4">
          <p className="text-ink-strong m-0 text-[13.5px] leading-snug text-pretty">
            Elle n'est stockée nulle part et ne peut pas être retrouvée. Les données de cet
            appareil sont définitivement illisibles. La seule issue est de tout effacer et de
            repartir du carnet papier.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-ink-muted text-[12px]">
              Saisissez <strong className="text-ink">EFFACER</strong> pour confirmer.
            </span>
            <input value={confirmWipe} onChange={(e) => setConfirmWipe(e.target.value)}
              className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]" />
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setLost(false); setConfirmWipe('') }}>Annuler</Button>
            <button disabled={confirmWipe !== 'EFFACER'} onClick={() => void onWipe()}
              className="bg-late min-h-11 flex-1 rounded-[8px] text-[14px] font-semibold text-white disabled:opacity-45">
              Tout effacer
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

/** Activation du chiffrement — irréversible sans la phrase. */
export function SetupEncryption({ onEnable, onCancel }: {
  onEnable: (passphrase: string) => Promise<void>
  onCancel: () => void
}) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)

  const tooShort = a.length > 0 && a.length < 10
  const mismatch = b.length > 0 && a !== b
  const ready = a.length >= 10 && a === b && understood

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-6 px-5 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[26px] leading-tight font-medium tracking-tight">
          Chiffrer les données
        </h1>
        <p className="text-ink-muted m-0 text-[14.5px] leading-normal text-pretty">
          Les vaccinations et les photographies seront chiffrées sur cet appareil. Sans la
          phrase secrète, personne ne pourra les lire — <strong className="text-ink">vous non plus</strong>.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        setBusy(true)
        void onEnable(a).finally(() => setBusy(false))
      }}>
        <label className="flex flex-col gap-2">
          <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Phrase secrète</span>
          <input type="password" value={a} autoComplete="new-password" onChange={(e) => setA(e.target.value)}
            className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]" />
          <span className="text-ink-muted text-[12px]">
            10 caractères minimum. Une phrase entière vaut mieux qu'un mot compliqué.
          </span>
        </label>
        {tooShort && <p className="text-late m-0 text-[13px] font-medium">Trop courte : 10 caractères minimum.</p>}

        <label className="flex flex-col gap-2">
          <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">Confirmation</span>
          <input type="password" value={b} autoComplete="new-password" onChange={(e) => setB(e.target.value)}
            className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]" />
        </label>
        {mismatch && <p className="text-late m-0 text-[13px] font-medium">Les deux saisies diffèrent.</p>}

        <label className="border-due-border bg-due-bg flex items-start gap-3 rounded-[12px] border p-3.5">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="text-ink-strong text-[13px] leading-snug text-pretty">
            J'ai compris que la phrase secrète n'est stockée nulle part et qu'elle ne peut pas être
            réinitialisée. Si je la perds, les données de cet appareil sont définitivement perdues.
          </span>
        </label>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <div className="flex-1">
            <Button type="submit" full disabled={!ready || busy}>
              {busy ? 'Chiffrement…' : 'Chiffrer maintenant'}
            </Button>
          </div>
        </div>
      </form>
    </main>
  )
}

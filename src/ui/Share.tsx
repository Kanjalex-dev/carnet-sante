import { useRef, useState } from 'react'
import {
  type Choice, type MergePlan, applyMerge, buildPlan, defaultChoices, linkChildren,
  summarisePlan,
} from '../domain/merge'
import type { MergeVault } from '../domain/merge'
import type { Schedule } from '../domain/types'
import {
  NotATransferFileError, UnsupportedVersionError, WrongPassphraseError,
  exportTransfer, readTransfer, transferFilename,
} from '../storage/transfer'
import { mutate, readVault, stamp } from '../storage/repository'
import { buildLabelIndex } from './explanations'
import { frDate } from './format'
import { Button } from './atoms'

/**
 * Partage entre co-parents.
 *
 * Le parti pris : pas de serveur, donc pas de synchronisation continue. Un
 * fichier chiffré part d'un appareil et arrive sur l'autre, où la personne
 * voit exactement ce qui va changer avant que quoi que ce soit ne soit écrit.
 * Le carnet d'un enfant n'est pas un document qu'on écrase à distance.
 */

type Phase =
  | { step: 'idle' }
  | { step: 'export' }
  | { step: 'import' }
  | { step: 'review'; remote: MergeVault; plan: MergePlan; choices: Record<string, Choice> }
  | { step: 'done'; summary: string }

export function ShareSection({ schedule, onMerged }: {
  schedule: Schedule
  onMerged: () => Promise<void>
}) {
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<string | null>(null)

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
        Partage co-parent
      </h2>
      <div className="border-line bg-surface flex flex-col gap-3 rounded-[12px] border p-4">
        <p className="text-ink-muted m-0 text-[12.5px] leading-snug text-pretty">
          Transmettez le carnet à l’autre parent sous forme de fichier chiffré. À la réception,
          vous verrez ligne par ligne ce qui serait ajouté ou modifié, et rien ne sera écrit sans
          votre accord. Les pages photographiées ne sont pas incluses.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPhase({ step: 'export' })}>Exporter</Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>Importer</Button>
        </div>
        {phase.step === 'done' && (
          <p className="text-ok m-0 text-[13px] font-semibold">{phase.summary}</p>
        )}
        <input ref={fileInput} type="file" accept=".carnet,application/json" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setPending(await f.text())
            setPhase({ step: 'import' })
          }} />
      </div>

      {phase.step === 'export' && (
        <PassphraseDialog
          title="Exporter le carnet"
          intro="Choisissez une phrase pour ce fichier. Transmettez-la à l’autre parent par un autre canal que le fichier lui-même : un message vocal, de vive voix."
          cta="Exporter le fichier"
          onCancel={() => setPhase({ step: 'idle' })}
          onSubmit={async (p) => {
            const v = await readVault()
            const text = await exportTransfer(v, p)
            download(text, transferFilename())
            setPhase({ step: 'done', summary: 'Fichier chiffré exporté.' })
            return null
          }}
        />
      )}

      {phase.step === 'import' && pending && (
        <PassphraseDialog
          title="Ouvrir le fichier reçu"
          intro="Saisissez la phrase que l’autre parent vous a communiquée."
          cta="Ouvrir"
          onCancel={() => { setPending(null); setPhase({ step: 'idle' }) }}
          onSubmit={async (p) => {
            try {
              const remote = await readTransfer(pending, p)
              const local = await readVault()
              const links = linkChildren(local.children.filter((c) => !c.deletedAt), remote.children)
              const plan = buildPlan(local, remote, links, buildLabelIndex(schedule), frDate)
              setPhase({ step: 'review', remote, plan, choices: defaultChoices(plan) })
              return null
            } catch (err) {
              return err instanceof WrongPassphraseError
                ? 'Phrase incorrecte, ou fichier abîmé pendant le transfert.'
                : err instanceof UnsupportedVersionError
                  ? 'Ce fichier a été créé par une version plus récente de l’application.'
                  : err instanceof NotATransferFileError
                    ? 'Ce fichier n’est pas un export de carnet.'
                    : 'Ce fichier n’a pas pu être ouvert.'
            }
          }}
        />
      )}

      {phase.step === 'review' && (
        <Review
          plan={phase.plan} choices={phase.choices}
          onChoose={(key, c) => setPhase({ ...phase, choices: { ...phase.choices, [key]: c } })}
          onCancel={() => { setPending(null); setPhase({ step: 'idle' }) }}
          onApply={async () => {
            const s = summarisePlan(phase.plan, phase.choices)
            await mutate((v) => {
              const merged = applyMerge(v, phase.remote, phase.plan, phase.choices, stamp())
              v.children = merged.children
              v.vaccinations = merged.vaccinations
              v.growth = merged.growth
            })
            setPending(null)
            setPhase({
              step: 'done',
              summary: `Fusion effectuée : ${s.additions} ajout${s.additions > 1 ? 's' : ''}, ${s.updates} modification${s.updates > 1 ? 's' : ''}.`,
            })
            await onMerged()
          }}
        />
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ aperçu */

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  add: { label: 'Ajout', tone: 'text-ok bg-ok-bg border-ok-border' },
  update: { label: 'Modification', tone: 'text-blue-700 bg-blue-100 border-line-strong' },
  conflict: { label: 'Divergence', tone: 'text-due bg-due-bg border-due-border' },
  duplicate: { label: 'Doublon probable', tone: 'text-due bg-due-bg border-due-border' },
}

function Review({ plan, choices, onChoose, onCancel, onApply }: {
  plan: MergePlan
  choices: Record<string, Choice>
  onChoose: (key: string, c: Choice) => void
  onCancel: () => void
  onApply: () => Promise<void>
}) {
  const s = summarisePlan(plan, choices)
  const nothing = plan.items.length === 0

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35" role="dialog"
      aria-modal="true" aria-label="Aperçu de la fusion">
      <div className="bg-paper flex max-h-[88dvh] w-full max-w-[440px] flex-col rounded-t-2xl">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-display m-0 text-[22px] leading-tight font-medium tracking-tight">
            Ce qui va changer
          </h2>
          <p className="text-ink-muted mt-1 mb-0 text-[13px] text-pretty">
            {nothing
              ? 'Les deux carnets contiennent déjà la même chose. Rien à fusionner.'
              : `${s.additions} ajout${s.additions > 1 ? 's' : ''}, ${s.updates} modification${s.updates > 1 ? 's' : ''}, ${s.kept} ligne${s.kept > 1 ? 's' : ''} conservée${s.kept > 1 ? 's' : ''} telle${s.kept > 1 ? 's' : ''} quelle${s.kept > 1 ? 's' : ''}.`}
            {plan.unchanged > 0 && ` ${plan.unchanged} identique${plan.unchanged > 1 ? 's' : ''} des deux côtés.`}
          </p>
        </div>

        <ul className="m-0 flex list-none flex-col gap-2 overflow-y-auto px-5 pb-3">
          {plan.items.map((item) => {
            const c = choices[item.key] ?? item.defaultChoice
            const t = TYPE_LABEL[item.type]
            return (
              <li key={item.key} className="border-line bg-surface flex flex-col gap-2 rounded-[10px] border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-ink m-0 text-[13.5px] font-semibold text-pretty">{item.title}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${t.tone}`}>
                    {t.label}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {item.localSummary && (
                    <ChoiceRow label="Ce carnet" summary={item.localSummary}
                      active={c === 'local'} onClick={() => onChoose(item.key, 'local')} />
                  )}
                  <ChoiceRow label="Fichier reçu" summary={item.remoteSummary}
                    active={c === 'remote'} onClick={() => onChoose(item.key, 'remote')} />
                  {!item.localSummary && (
                    <ChoiceRow label="Ne pas ajouter" summary="La ligne reste absente de ce carnet."
                      active={c === 'local'} onClick={() => onChoose(item.key, 'local')} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="border-line bg-paper flex gap-2 border-t px-5 pt-3 pb-7">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <div className="flex-1">
            <Button full disabled={nothing} onClick={() => { void onApply() }}>
              Appliquer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChoiceRow({ label, summary, active, onClick }: {
  label: string; summary: string; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`flex w-full items-start gap-2 rounded-[8px] border px-2.5 py-2 text-left ${
        active ? 'border-blue-500 bg-blue-100' : 'border-line bg-surface-soft'}`}>
      <span aria-hidden="true"
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          active ? 'border-blue-500' : 'border-line-strong'}`}>
        {active && <span className="bg-blue-500 block h-2 w-2 rounded-full" />}
      </span>
      <span className="min-w-0">
        <span className="text-ink-muted block text-[10.5px] font-bold tracking-[0.08em] uppercase">{label}</span>
        <span className="text-ink-strong block text-[12.5px] leading-snug">{summary}</span>
      </span>
    </button>
  )
}

/* -------------------------------------------------------------- phrase */

export function PassphraseDialog({ title, intro, cta, onCancel, onSubmit }: {
  title: string
  intro: string
  cta: string
  onCancel: () => void
  onSubmit: (passphrase: string) => Promise<string | null>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35" role="dialog"
      aria-modal="true" aria-label={title}>
      <div className="bg-paper w-full max-w-[440px] rounded-t-2xl px-5 pt-5 pb-7">
        <h2 className="font-display m-0 text-[22px] leading-tight font-medium tracking-tight">{title}</h2>
        <p className="text-ink-muted mt-1 mb-5 text-[13px] leading-snug text-pretty">{intro}</p>
        <label className="flex flex-col gap-2">
          <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">
            Phrase du fichier
          </span>
          <input type="password" value={value} autoComplete="off"
            onChange={(e) => { setValue(e.target.value); setError(null) }}
            className="border-line-strong bg-surface min-h-11 rounded-[8px] border px-3 text-[16px]" />
        </label>
        {error && <p className="text-late mt-3 mb-0 text-[13px] font-medium text-pretty">{error}</p>}
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <div className="flex-1">
            <Button full disabled={value.length < 8 || busy}
              onClick={async () => {
                setBusy(true)
                setError(await onSubmit(value))
                setBusy(false)
              }}>
              {busy ? 'Un instant…' : cta}
            </Button>
          </div>
        </div>
        <p className="text-ink-faint mt-3 mb-0 text-[11.5px] leading-snug text-pretty">
          Huit caractères minimum. Cette phrase ne protège que ce fichier : elle est indépendante
          de celle qui verrouille l’application.
        </p>
      </div>
    </div>
  )
}

export function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

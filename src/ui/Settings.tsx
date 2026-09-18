import { useEffect, useState } from 'react'
import type { Child, Schedule } from '../domain/types'
import { type LockState, attachmentUsage } from '../storage/repository'
import { formatBytes } from '../storage/image'
import { frDate } from './format'
import { Button, LegalNotice } from './atoms'
import { ShareSection } from './Share'
import { BackupSection } from './Backup'
import { BiometricSetting } from './BiometricSetting'
import { ProGate } from '../pro/ProGate'

export function Settings({ child, schedule, lockState, onSetupEncryption, onLock, onMerged, childSwitcher }: {
  child: Child
  schedule: Schedule
  lockState: LockState
  onSetupEncryption: () => void
  onLock: () => void
  onMerged: () => Promise<void>
  childSwitcher?: React.ReactNode
}) {
  const [usage, setUsage] = useState({ count: 0, bytes: 0 })
  useEffect(() => { void attachmentUsage().then(setUsage) }, [])

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
      <header className="px-5 pt-4 pb-3">
        <h1 className="font-display m-0 text-[26px] leading-tight font-medium tracking-tight">Réglages</h1>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-5 pb-6">
        <Section title="Enfant">
          <Row label="Prénom" value={child.firstName} />
          <Row label="Naissance" value={frDate(child.birthDate)} />
          <Row label="Calendrier appliqué" value={schedule.id} mono />
        </Section>

        {childSwitcher}

        <Section title="Données de cet appareil">
          <Row
            label="Pages du carnet"
            value={usage.count === 0 ? 'Aucune' : `${usage.count} · ${formatBytes(usage.bytes)}`}
          />
          <Row
            label="Chiffrement"
            value={lockState === 'plain' ? 'Désactivé' : 'Actif'}
            tone={lockState === 'plain' ? 'warn' : 'ok'}
          />
        </Section>

        {lockState === 'plain' ? (
          <div className="border-due-border bg-due-bg flex flex-col gap-3 rounded-[12px] border p-4">
            <p className="text-ink-strong m-0 text-[13.5px] leading-snug text-pretty">
              Les vaccinations et les photographies sont actuellement lisibles par toute personne
              ayant accès à ce navigateur déverrouillé.
            </p>
            <Button full onClick={onSetupEncryption}>Chiffrer les données</Button>
          </div>
        ) : (
          <div className="border-ok-border bg-ok-bg flex flex-col gap-3 rounded-[12px] border p-4">
            <p className="text-ink-strong m-0 text-[13.5px] leading-snug text-pretty">
              Les données sont chiffrées au repos. La phrase secrète n'est stockée nulle part et
              n'est pas réinitialisable.
            </p>
            <Button full variant="secondary" onClick={onLock}>Verrouiller maintenant</Button>
          </div>
        )}

        <BiometricSetting encrypted={lockState !== 'plain'} />

        <BackupSection onRestored={onMerged} />

        <ProGate title="Partage co-parent"
          description="Fusionnez le carnet avec celui tenu par l'autre parent, avec un aperçu ligne par ligne avant tout enregistrement.">
          <ShareSection schedule={schedule} onMerged={onMerged} />
        </ProGate>

        <Section title="Source des données">
          <p className="text-ink-muted m-0 px-3.5 py-3 text-[12.5px] leading-snug text-pretty">
            {schedule.source}, publié le {frDate(schedule.publishedAt)}, vérifié le {frDate(schedule.checkedAt)}.
            {schedule.warning && (
              <><br /><span className="text-due font-medium">{schedule.warning}</span></>
            )}
          </p>
        </Section>
      </main>

      <LegalNotice />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">{title}</h2>
      <div className="border-line bg-surface divide-line-soft flex flex-col divide-y rounded-[12px] border">
        {children}
      </div>
    </section>
  )
}

function Row({ label, value, mono, tone }: {
  label: string; value: string; mono?: boolean; tone?: 'ok' | 'warn'
}) {
  const color = tone === 'warn' ? 'text-due' : tone === 'ok' ? 'text-ok' : 'text-ink'
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <span className="text-ink-muted shrink-0 text-[13.5px]">{label}</span>
      <span className={`min-w-0 truncate text-right text-[14px] font-semibold ${color} ${mono ? 'tnum' : ''}`}>
        {value}
      </span>
    </div>
  )
}

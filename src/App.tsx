import { useCallback, useEffect, useState } from 'react'
import scheduleData from './data/schedules/fr-2025.json'
import type { Child, Schedule } from './domain/types'
import type { DoseGroup } from './domain/status'
import {
  type LockState, enableEncryption, lock, lockState as readLockState, mutate, newId,
  readVault, stamp, unlock, wipeAll,
} from './storage/repository'
import { Onboarding } from './ui/Onboarding'
import { Status } from './ui/Status'
import { Record } from './ui/Record'
import { Growth, type MeasureInput } from './ui/Growth'
import { Settings } from './ui/Settings'
import { Nav, type Tab } from './ui/Nav'
import { ExplainProvider } from './ui/Explain'
import { SetupEncryption, Unlock } from './ui/Vault'
import type { DoseEntryValue } from './ui/DoseEntry'
import type { GrowthMeasure, VaccinationEvent } from './domain/types'
import { computeStatus, upcomingDoses } from './domain/status'
import { today } from './domain/dates'
import { syncReminders } from './native/reminders'

const schedule = scheduleData as Schedule

export default function App() {
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<LockState>('plain')
  const [child, setChild] = useState<Child | null>(null)
  const [events, setEvents] = useState<VaccinationEvent[]>([])
  const [measures, setMeasures] = useState<GrowthMeasure[]>([])
  const [tab, setTab] = useState<Tab>('status')
  const [settingUp, setSettingUp] = useState(false)

  const load = useCallback(async () => {
    const s = await readLockState()
    setState(s)
    if (s === 'locked') { setChild(null); setEvents([]); setMeasures([]); setReady(true); return }
    const v = await readVault()
    const first = v.children.find((c) => !c.deletedAt) ?? null
    setChild(first)
    setEvents(first ? v.vaccinations.filter((e) => e.childId === first.id) : [])
    setMeasures(first ? v.growth.filter((m) => m.childId === first.id) : [])
    setReady(true)
  }, [])

  useEffect(() => { void load() }, [load])

  // Reprogrammé à chaque changement de données : nouvelle dose enregistrée,
  // rendez-vous marqué fait, enfant fusionné depuis l'autre parent. Sans
  // effet hors de l'app iOS — voir native/reminders.ts.
  useEffect(() => {
    if (!child) return
    const statuses = computeStatus(schedule, child.birthDate, events, today())
    void syncReminders(upcomingDoses(statuses, today(), 366), today())
  }, [child, events])

  if (!ready) return null

  if (state === 'locked') {
    return (
      <Unlock
        onUnlock={async (p) => { const ok = await unlock(p); if (ok) await load(); return ok }}
        onWipe={async () => { await wipeAll(); await load() }}
      />
    )
  }

  if (!child) {
    return (
      <Onboarding onCreate={async (input) => {
        const created: Child = {
          ...input, id: newId(), scheduleId: schedule.id, createdAt: stamp(), updatedAt: stamp(),
        }
        await mutate((v) => { v.children.push(created) })
        await load()
      }} />
    )
  }

  if (settingUp) {
    return (
      <SetupEncryption
        onCancel={() => setSettingUp(false)}
        onEnable={async (p) => { await enableEncryption(p); setSettingUp(false); await load() }}
      />
    )
  }

  const record = async (group: DoseGroup, value: DoseEntryValue) => {
    const event: VaccinationEvent = {
      id: newId(),
      childId: child.id,
      valences: group.doses.map((d) => d.valenceCode),
      doseNumber: group.doses[0]?.doseNumber,
      date: value.date,
      productName: value.productName,
      lotNumber: value.lotNumber,
      source: 'manual',
      verifiedByUser: true,
      attachmentIds: [],
      createdAt: stamp(),
      updatedAt: stamp(),
    }
    await mutate((v) => { v.vaccinations.push(event) })
    await load()
  }

  const addMeasure = async (input: MeasureInput) => {
    const m: GrowthMeasure = {
      id: newId(),
      childId: child.id,
      date: input.date,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      headCircumferenceCm: input.headCircumferenceCm,
      source: 'manual',
      verifiedByUser: true,
      createdAt: stamp(),
      updatedAt: stamp(),
    }
    await mutate((v) => { v.growth.push(m) })
    await load()
  }

  const removeMeasure = async (id: string) => {
    await mutate((v) => {
      const m = v.growth.find((x) => x.id === id)
      if (m) { m.deletedAt = stamp(); m.updatedAt = stamp() }
    })
    await load()
  }

  return (
    <ExplainProvider>
    <div className="flex min-h-dvh flex-col">
      {/* Réserve la hauteur de la barre fixe : aucun contenu ne passe dessous. */}
      <div className="flex flex-1 flex-col pb-[76px]">
        {tab === 'status' && (
          <Status child={child} schedule={schedule} events={events} onRecord={record} />
        )}
        {tab === 'photos' && (
          <Record child={child} schedule={schedule} events={events} onChange={load} />
        )}
        {tab === 'growth' && (
          <Growth child={child} measures={measures} onAdd={addMeasure} onDelete={removeMeasure} />
        )}
        {tab === 'settings' && (
          <Settings
            child={child} schedule={schedule} lockState={state}
            onSetupEncryption={() => setSettingUp(true)}
            onLock={() => { lock(); void load() }}
            onMerged={load}
          />
        )}
      </div>
      <Nav tab={tab} onChange={setTab} />
    </div>
    </ExplainProvider>
  )
}

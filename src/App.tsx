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
import { Settings } from './ui/Settings'
import { Nav, type Tab } from './ui/Nav'
import { SetupEncryption, Unlock } from './ui/Vault'
import type { DoseEntryValue } from './ui/DoseEntry'
import type { VaccinationEvent } from './domain/types'

const schedule = scheduleData as Schedule

export default function App() {
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<LockState>('plain')
  const [child, setChild] = useState<Child | null>(null)
  const [events, setEvents] = useState<VaccinationEvent[]>([])
  const [tab, setTab] = useState<Tab>('status')
  const [settingUp, setSettingUp] = useState(false)

  const load = useCallback(async () => {
    const s = await readLockState()
    setState(s)
    if (s === 'locked') { setChild(null); setEvents([]); setReady(true); return }
    const v = await readVault()
    const first = v.children.find((c) => !c.deletedAt) ?? null
    setChild(first)
    setEvents(first ? v.vaccinations.filter((e) => e.childId === first.id) : [])
    setReady(true)
  }, [])

  useEffect(() => { void load() }, [load])

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

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1">
        {tab === 'status' && (
          <Status child={child} schedule={schedule} events={events} onRecord={record} />
        )}
        {tab === 'photos' && (
          <Record child={child} schedule={schedule} events={events} onChange={load} />
        )}
        {tab === 'settings' && (
          <Settings
            child={child} schedule={schedule} lockState={state}
            onSetupEncryption={() => setSettingUp(true)}
            onLock={() => { lock(); void load() }}
          />
        )}
      </div>
      <Nav tab={tab} onChange={setTab} />
    </div>
  )
}

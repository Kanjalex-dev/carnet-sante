import { useCallback, useEffect, useState } from 'react'
import scheduleData from './data/schedules/fr-2025.json'
import type { Child, Schedule } from './domain/types'
import type { DoseGroup } from './domain/status'
import {
  type LockState, enableEncryption, listReminders, lock, lockState as readLockState, mutate,
  newId, readVault, stamp, unlock, wipeAll,
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
import { today } from './domain/dates'
import { syncReminders } from './native/reminders'
import { maybeRequestReview } from './native/review'
import { ProGate } from './pro/ProGate'
import { ChildSwitcher } from './ui/ChildSwitcher'

const schedule = scheduleData as Schedule

export default function App() {
  const [ready, setReady] = useState(false)
  // Incrémenté quand le parent ajoute ou retire un rappel.
  const [reminderVersion, setReminderVersion] = useState(0)
  const [state, setState] = useState<LockState>('plain')
  const [allChildren, setAllChildren] = useState<Child[]>([])
  const [child, setChild] = useState<Child | null>(null)
  const [events, setEvents] = useState<VaccinationEvent[]>([])
  const [measures, setMeasures] = useState<GrowthMeasure[]>([])
  const [tab, setTab] = useState<Tab>('status')
  const [settingUp, setSettingUp] = useState(false)

  const load = useCallback(async () => {
    const s = await readLockState()
    setState(s)
    if (s === 'locked') {
      setAllChildren([]); setChild(null); setEvents([]); setMeasures([]); setReady(true)
      return
    }
    const v = await readVault()
    const active = v.children.filter((c) => !c.deletedAt)
    setAllChildren(active)
    // Le dernier enfant affiché est mémorisé localement — un confort par
    // appareil, jamais une donnée qui compte : s'il disparaît (perte du
    // navigateur privé, etc.), on retombe simplement sur le premier enfant.
    let storedId: string | null = null
    try { storedId = localStorage.getItem('carnet.activeChildId') } catch { /* indisponible : tant pis */ }
    const current = active.find((c) => c.id === storedId) ?? active[0] ?? null
    setChild(current)
    setEvents(current ? v.vaccinations.filter((e) => e.childId === current.id) : [])
    setMeasures(current ? v.growth.filter((m) => m.childId === current.id) : [])
    setReady(true)
  }, [])

  const switchChild = (id: string) => {
    try { localStorage.setItem('carnet.activeChildId', id) } catch { /* indisponible : tant pis */ }
    void load()
  }

  useEffect(() => { void load() }, [load])

  // Reprogrammé quand les rappels du parent changent. L'application ne crée
  // jamais de rappel d'elle-même : voir native/reminderPlan.ts.
  useEffect(() => {
    if (!child) return
    let cancelled = false
    void listReminders(child.id).then((rs) => {
      if (!cancelled) void syncReminders(rs, today())
    })
    return () => { cancelled = true }
  }, [child, reminderVersion])

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
        try { localStorage.setItem('carnet.activeChildId', created.id) } catch { /* indisponible : tant pis */ }
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
    const v = await mutate((vault) => { vault.vaccinations.push(event) })
    await load()
    void maybeRequestReview(v.vaccinations.filter((e) => e.childId === child.id).length)
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

  const addChild = async (input: { firstName: string; birthDate: string; sex: 'F' | 'M' }) => {
    const created: Child = {
      ...input, id: newId(), scheduleId: schedule.id, createdAt: stamp(), updatedAt: stamp(),
    }
    await mutate((v) => { v.children.push(created) })
    switchChild(created.id)
  }

  return (
    <ExplainProvider>
    <div className="flex min-h-dvh flex-col">
      {/* Réserve la hauteur de la barre fixe : aucun contenu ne passe dessous. */}
      <div className="flex flex-1 flex-col pb-[76px]">
        {tab === 'status' && (
          <Status onRemindersChange={() => setReminderVersion((n) => n + 1)} child={child} schedule={schedule} events={events} onRecord={record} />
        )}
        {tab === 'photos' && (
          <Record child={child} schedule={schedule} events={events} onChange={load} />
        )}
        {tab === 'growth' && (
          <ProGate title="Courbes de croissance"
            description="Suivez le poids, la taille et le périmètre crânien de votre enfant par rapport aux courbes de référence de l'OMS.">
            <Growth child={child} measures={measures} onAdd={addMeasure} onDelete={removeMeasure} />
          </ProGate>
        )}
        {tab === 'settings' && (
          <Settings
            child={child} schedule={schedule} lockState={state}
            onSetupEncryption={() => setSettingUp(true)}
            onLock={() => { lock(); void load() }}
            onMerged={load}
            childSwitcher={
              <ChildSwitcher children={allChildren} activeId={child.id} onSwitch={switchChild} onCreate={addChild} />
            }
          />
        )}
      </div>
      <Nav tab={tab} onChange={setTab} />
    </div>
    </ExplainProvider>
  )
}

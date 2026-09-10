import { useEffect, useState } from 'react'
import scheduleData from './data/schedules/fr-2025.json'
import type { Child, Schedule, VaccinationEvent } from './domain/types'
import type { DoseGroup } from './domain/status'
import { addChild, addVaccination, listChildren, listVaccinations } from './storage/db'
import { Onboarding } from './ui/Onboarding'
import { Status } from './ui/Status'
import type { DoseEntryValue } from './ui/DoseEntry'

const schedule = scheduleData as Schedule

export default function App() {
  const [ready, setReady] = useState(false)
  const [child, setChild] = useState<Child | null>(null)
  const [events, setEvents] = useState<VaccinationEvent[]>([])

  useEffect(() => {
    void (async () => {
      const children = await listChildren()
      if (children[0]) {
        setChild(children[0])
        setEvents(await listVaccinations(children[0].id))
      }
      setReady(true)
    })()
  }, [])

  if (!ready) return null

  if (!child) {
    return (
      <Onboarding
        onCreate={async (v) => {
          const created = await addChild({ ...v, scheduleId: schedule.id })
          setChild(created)
          setEvents([])
        }}
      />
    )
  }

  // Un rendez-vous = un événement portant toutes les valences injectées.
  const record = async (group: DoseGroup, value: DoseEntryValue) => {
    await addVaccination({
      childId: child.id,
      valences: group.doses.map((d) => d.valenceCode),
      doseNumber: group.doses[0]?.doseNumber,
      date: value.date,
      productName: value.productName,
      lotNumber: value.lotNumber,
      source: 'manual',
      verifiedByUser: true,
      attachmentIds: [],
    })
    setEvents(await listVaccinations(child.id))
  }

  return <Status child={child} schedule={schedule} events={events} onRecord={record} />
}

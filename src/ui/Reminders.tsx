import { useEffect, useState } from 'react'
import type { ParentReminder } from '../domain/types'
import { addReminder, deleteReminder, listReminders } from '../storage/repository'
import { today as todayFn } from '../domain/dates'
import { frDate } from './format'
import { Button } from './atoms'

/**
 * Rappels du parent.
 *
 * C'est le parent qui décide qu'il veut être rappelé, quand, et pour quoi.
 * L'application ne propose aucune date et ne déduit rien du calendrier
 * vaccinal : elle se contente de faire sonner le téléphone au moment choisi.
 * La distinction n'est pas cosmétique — un rappel calculé à partir de l'état
 * vaccinal d'un enfant serait une recommandation individualisée.
 */
export function Reminders({ childId, onChange }: {
  childId: string
  onChange: () => void
}) {
  const [items, setItems] = useState<ParentReminder[]>([])
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')

  const refresh = () => { void listReminders(childId).then(setItems) }
  useEffect(refresh, [childId])

  const save = async () => {
    if (!label.trim() || !date) return
    await addReminder({ childId, label: label.trim(), date })
    setLabel(''); setDate(''); setOpen(false)
    refresh(); onChange()
  }

  const remove = async (id: string) => {
    await deleteReminder(id)
    refresh(); onChange()
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
        Mes rappels
      </h2>

      {items.length === 0 && !open && (
        <p className="text-ink-muted m-0 text-[12.5px] leading-snug text-pretty">
          Aucun rappel. Vous pouvez en créer un pour la date de votre choix — par exemple
          après avoir pris rendez-vous chez le médecin.
        </p>
      )}

      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {items.map((r) => (
            <li key={r.id}
              className="border-line bg-surface flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5">
              <div className="flex min-w-0 flex-col">
                <span className="text-ink truncate text-[14px] font-semibold">{r.label}</span>
                <span className="text-ink-muted tnum text-[12px]">{frDate(r.date)}</span>
              </div>
              <button onClick={() => void remove(r.id)}
                aria-label={`Supprimer le rappel ${r.label}`}
                className="text-ink-muted inline-flex min-h-11 shrink-0 items-center px-2 text-[12.5px] font-semibold">
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="border-line bg-surface flex flex-col gap-2.5 rounded-[12px] border p-3.5">
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted text-[11.5px] font-semibold">Intitulé</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="Rendez-vous chez le médecin"
              className="border-line bg-paper-sunken min-h-11 rounded-[8px] border px-3 text-[14px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted text-[11.5px] font-semibold">Date</span>
            <input type="date" value={date} min={todayFn()}
              onChange={(e) => setDate(e.target.value)}
              className="border-line bg-paper-sunken min-h-11 rounded-[8px] border px-3 text-[14px]" />
          </label>
          <div className="flex gap-2">
            <Button onClick={() => void save()}>Créer le rappel</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>Ajouter un rappel</Button>
      )}
    </section>
  )
}

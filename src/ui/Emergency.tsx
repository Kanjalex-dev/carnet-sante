import { useEffect, useState } from 'react'
import type { Child, EmergencyCard, EmergencyContact } from '../domain/types'
import { newId, readEmergencyCard, saveEmergencyCard } from '../storage/repository'
import { Button } from './atoms'

/**
 * La fiche d'urgence.
 *
 * Elle existe pour un moment précis : quelqu'un d'autre que le parent tient
 * l'enfant et doit répondre vite. Elle se lit donc en grand, sans dépliage,
 * sans onglet, et fonctionne hors ligne comme le reste de l'application.
 *
 * Ce qu'elle ne fait pas : interpréter. Les allergies et les traitements sont
 * du texte saisi par le parent, rendu tel quel. Aucune posologie n'est
 * calculée, aucun conseil n'est produit — ce serait un autre produit, soumis
 * à d'autres obligations.
 */

const EMPTY_LINE = '—'

export function Emergency({ child, onClose }: { child: Child; onClose: () => void }) {
  const [card, setCard] = useState<EmergencyCard | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    void readEmergencyCard(child.id).then(setCard)
  }, [child.id])

  if (!card) return null

  const empty = !card.bloodGroup && !card.allergies && !card.treatments
    && !card.history && !card.doctorName && card.contacts.length === 0

  if (editing) {
    return (
      <EmergencyForm
        card={card}
        childName={child.firstName}
        onCancel={() => setEditing(false)}
        onSave={async (next) => {
          await saveEmergencyCard(next)
          setCard(await readEmergencyCard(child.id))
          setEditing(false)
        }}
      />
    )
  }

  return (
    <div className="bg-paper fixed inset-0 z-[80] overflow-y-auto" role="dialog" aria-modal="true"
      aria-label={`Fiche d’urgence de ${child.firstName}`}>
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-5 pt-5 pb-10">

        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display m-0 text-[26px] leading-tight font-medium tracking-tight">
              En cas d’urgence
            </h1>
            <p className="text-ink-muted mt-0.5 mb-0 text-[13px]">{child.firstName}</p>
          </div>
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
        </header>

        {/* Les numéros publics viennent en premier et ne dépendent de rien :
            une fiche vide est exactement le cas où l'on en a besoin. */}
        <PublicNumbers />

        {empty ? (
          <div className="border-line bg-surface flex flex-col gap-3 rounded-[12px] border p-4">
            <p className="text-ink-muted m-0 text-[13.5px] leading-snug text-pretty">
              Cette fiche est vide. Renseignée, elle permet à la personne qui garde
              {' '}{child.firstName} de répondre aux questions qu’on lui posera.
            </p>
            <Button full onClick={() => setEditing(true)}>Remplir la fiche</Button>
          </div>
        ) : (
          <>
            {/* Ce qui bloque un geste vient en premier, en grand. */}
            <Field label="Allergies" value={card.allergies} tone="alert" big />
            <Field label="Traitements en cours" value={card.treatments} big />
            <Field label="Groupe sanguin" value={card.bloodGroup} big />
            <Field label="Antécédents" value={card.history} />

            <section className="flex flex-col gap-2">
              <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
                Qui appeler
              </h2>
              <div className="border-line bg-surface flex flex-col rounded-[12px] border">
                {card.contacts.map((c, i) => (
                  <a key={c.id} href={`tel:${c.phone.replace(/\s/g, '')}`}
                    className={`flex min-h-11 items-center justify-between gap-3 px-3.5 py-3 ${
                      i > 0 ? 'border-line-soft border-t' : ''}`}>
                    <span className="min-w-0">
                      <span className="text-ink block text-[15px] font-semibold">{c.name}</span>
                      {c.relation && <span className="text-ink-faint block text-[11.5px]">{c.relation}</span>}
                    </span>
                    <span className="text-blue-700 tnum shrink-0 text-[15px] font-semibold">{c.phone}</span>
                  </a>
                ))}
                {card.doctorName && (
                  <div className={`flex min-h-11 items-center justify-between gap-3 px-3.5 py-3 ${
                    card.contacts.length > 0 ? 'border-line-soft border-t' : ''}`}>
                    <span className="min-w-0">
                      <span className="text-ink block text-[15px] font-semibold">{card.doctorName}</span>
                      <span className="text-ink-faint block text-[11.5px]">Médecin</span>
                    </span>
                    {card.doctorPhone && (
                      <a href={`tel:${card.doctorPhone.replace(/\s/g, '')}`}
                        className="text-blue-700 tnum shrink-0 text-[15px] font-semibold">
                        {card.doctorPhone}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>

            <Button variant="secondary" full onClick={() => setEditing(true)}>Modifier la fiche</Button>
          </>
        )}

        <p className="text-ink-muted m-0 text-[10.5px] leading-snug text-pretty">
          Informations saisies par le parent et affichées telles quelles. Elles ne remplacent
          ni une ordonnance ni l’avis d’un professionnel de santé.
        </p>
      </div>
    </div>
  )
}

/**
 * Le 15 et le 112 ne sont pas des données : ils ne changent pas, ils ne se
 * saisissent pas, et ils doivent être là même sur une fiche que personne n'a
 * pris le temps de remplir.
 */
function PublicNumbers() {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
        Urgences
      </h2>
      <div className="border-line bg-surface flex flex-col rounded-[12px] border">
        <a href="tel:15" className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-3">
          <span className="text-ink text-[15px] font-semibold">SAMU</span>
          <span className="text-late tnum shrink-0 text-[17px] font-bold">15</span>
        </a>
        <a href="tel:112" className="border-line-soft flex min-h-11 items-center justify-between gap-3 border-t px-3.5 py-3">
          <span className="text-ink text-[15px] font-semibold">Urgences européennes</span>
          <span className="text-late tnum shrink-0 text-[17px] font-bold">112</span>
        </a>
      </div>
    </section>
  )
}

function Field({ label, value, tone, big }: {
  label: string; value?: string; tone?: 'alert'; big?: boolean
}) {
  const alert = tone === 'alert' && !!value
  return (
    <section className={`rounded-[12px] border p-4 ${
      alert ? 'border-late-border bg-late-bg' : 'border-line bg-surface'}`}>
      <h2 className={`m-0 text-[11px] font-bold tracking-[0.09em] uppercase ${
        alert ? 'text-late' : 'text-ink-muted'}`}>
        {label}
      </h2>
      <p className={`m-0 mt-1.5 leading-snug text-pretty ${big ? 'text-[17px]' : 'text-[15px]'} ${
        value ? 'text-ink font-medium' : 'text-ink-faint'}`}>
        {value || EMPTY_LINE}
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ saisie */

function EmergencyForm({ card, childName, onCancel, onSave }: {
  card: EmergencyCard
  childName: string
  onCancel: () => void
  onSave: (c: EmergencyCard) => Promise<void>
}) {
  const [draft, setDraft] = useState<EmergencyCard>(card)
  const [busy, setBusy] = useState(false)

  const set = (patch: Partial<EmergencyCard>) => setDraft((d) => ({ ...d, ...patch }))

  const setContact = (id: string, patch: Partial<EmergencyContact>) =>
    setDraft((d) => ({
      ...d,
      contacts: d.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))

  return (
    <div className="bg-paper fixed inset-0 z-[80] overflow-y-auto" role="dialog" aria-modal="true"
      aria-label="Modifier la fiche d’urgence">
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-5 pt-5 pb-10">
        <h1 className="font-display m-0 text-[26px] leading-tight font-medium tracking-tight">
          Fiche d’urgence
        </h1>
        <p className="text-ink-muted m-0 text-[13px] leading-snug text-pretty">
          Écrivez ce qu’un adulte qui garde {childName} doit savoir. Laissez vide ce qui ne
          s’applique pas : une case vide se lit mieux qu’une case remplie pour la forme.
        </p>

        <Text label="Allergies" value={draft.allergies} onChange={(v) => set({ allergies: v })}
          placeholder="Arachide, pénicilline…" />
        <Text label="Traitements en cours" value={draft.treatments} onChange={(v) => set({ treatments: v })}
          placeholder="Nom du traitement et rythme, tels que prescrits" />
        <Line label="Groupe sanguin" value={draft.bloodGroup} onChange={(v) => set({ bloodGroup: v })}
          placeholder="A+" />
        <Text label="Antécédents" value={draft.history} onChange={(v) => set({ history: v })}
          placeholder="Ce qu’un soignant doit savoir avant d’agir" />

        <div className="flex gap-2">
          <Line label="Médecin" value={draft.doctorName} onChange={(v) => set({ doctorName: v })}
            placeholder="Dr Martin" />
          <Line label="Téléphone" value={draft.doctorPhone} onChange={(v) => set({ doctorPhone: v })}
            placeholder="03 20 00 00 00" tel />
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
            Personnes à joindre
          </h2>
          {draft.contacts.map((c) => (
            <div key={c.id} className="border-line bg-surface flex flex-col gap-2 rounded-[12px] border p-3">
              <div className="flex gap-2">
                <Line label="Nom" value={c.name} onChange={(v) => setContact(c.id, { name: v })}
                  placeholder="Prénom Nom" />
                <Line label="Lien" value={c.relation} onChange={(v) => setContact(c.id, { relation: v })}
                  placeholder="Mère, voisin…" />
              </div>
              <Line label="Téléphone" value={c.phone} onChange={(v) => setContact(c.id, { phone: v })}
                placeholder="06 12 34 56 78" tel />
              <button onClick={() => setDraft((d) => ({ ...d, contacts: d.contacts.filter((x) => x.id !== c.id) }))}
                className="text-ink-faint min-h-11 self-start px-1 text-[12px]">
                Retirer ce contact
              </button>
            </div>
          ))}
          <Button variant="secondary"
            onClick={() => setDraft((d) => ({
              ...d,
              contacts: [...d.contacts, { id: newId(), name: '', phone: '' }],
            }))}>
            Ajouter une personne
          </Button>
        </section>

        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <div className="flex-1">
            <Button full disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  // Un contact sans numéro ne sert à rien le jour venu.
                  await onSave({
                    ...draft,
                    contacts: draft.contacts.filter((c) => c.name.trim() && c.phone.trim()),
                  })
                } finally { setBusy(false) }
              }}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Line({ label, value, onChange, placeholder, tel }: {
  label: string; value?: string; onChange: (v: string) => void; placeholder: string; tel?: boolean
}) {
  return (
    <label className="flex flex-1 flex-col gap-2">
      <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">{label}</span>
      <input value={value ?? ''} placeholder={placeholder} inputMode={tel ? 'tel' : 'text'}
        onChange={(e) => onChange(e.target.value)}
        className="border-line-strong bg-surface min-h-11 w-full rounded-[8px] border px-3 text-[16px]" />
    </label>
  )
}

function Text({ label, value, onChange, placeholder }: {
  label: string; value?: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-ink-muted text-[11px] font-bold tracking-[0.09em] uppercase">{label}</span>
      <textarea value={value ?? ''} placeholder={placeholder} rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="border-line-strong bg-surface w-full rounded-[8px] border px-3 py-2.5 text-[16px] leading-snug" />
    </label>
  )
}

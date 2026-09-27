import { Explainable } from '../Explain'
import { progressExplanation } from '../explanations'

export function Progress({ satisfied, total, unverified, birthDate }: {
  satisfied: number; total: number; unverified: number; birthDate: string
}) {
  const ratio = total === 0 ? 0 : satisfied / total
  const complete = satisfied === total
  return (
    <section className={`rounded-[12px] border p-3.5 ${
      complete ? 'border-ok-border bg-ok-bg' : 'border-line bg-surface'
    }`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-ink-muted m-0 text-[11px] font-bold tracking-[0.09em] uppercase">
          Vaccins obligatoires inscrits
        </h2>
        <Explainable
          explanation={progressExplanation(satisfied, total, birthDate)}
          ariaLabel={`${satisfied} vaccins obligatoires inscrits sur ${total} — voir l'explication`}
          className={`tnum shrink-0 text-[13px] font-bold ${complete ? 'text-ok' : 'text-ink'}`}
        >
          {satisfied} / {total}
        </Explainable>
      </div>
      <div className="bg-line-soft mt-2.5 h-2 overflow-hidden rounded-full" role="img"
        aria-label={`${satisfied} vaccins obligatoires entièrement inscrits sur ${total}`}>
        <div className={`h-full rounded-full ${complete ? 'bg-ok' : 'bg-blue-500'}`}
          style={{ width: `${Math.max(3, ratio * 100)}%` }} />
      </div>
      <p className="text-ink-muted m-0 mt-2 text-[12px] leading-snug text-pretty">
        {complete
          ? "Toutes les doses obligatoires sont inscrites au carnet."
          : "Appuyez sur le chiffre pour comprendre ce qu'il compte."}
        {unverified > 0 && ` ${unverified} vaccination${unverified > 1 ? 's' : ''} importée${unverified > 1 ? 's' : ''} reste${unverified > 1 ? 'nt' : ''} à vérifier.`}
      </p>
    </section>
  )
}

/**
 * Le rattrapage n'est pas un simple décalage des doses manquées : pour le
 * méningocoque B, le schéma lui-même change selon l'âge auquel il commence.
 * La carte restitue le tableau publié, toutes tranches confondues. Elle ne
 * sélectionne pas la ligne qui s'appliquerait à cet enfant : ce choix est un
 * acte médical, pas un affichage.
 */

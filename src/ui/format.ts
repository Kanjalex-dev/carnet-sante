/** Formatage francophone partagé — une seule définition pour toute l'interface. */

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Une date civile ne passe jamais par un fuseau : on construit la date locale. */
function local(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function frDate(iso: string): string {
  return SHORT.format(local(iso))
}

export function frDateLong(iso: string): string {
  return LONG.format(local(iso))
}

export function frStamp(stamp: string): string {
  return SHORT.format(new Date(stamp))
}

export function humanAge(months: number): string {
  if (months < 24) return `${months} mois`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? `${years} ans` : `${years} ans et ${rest} mois`
}

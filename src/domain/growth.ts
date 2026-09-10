/**
 * Croissance — méthode LMS (OMS).
 *
 * z = ((valeur / M)^L - 1) / (L * S)   si L != 0
 * z = ln(valeur / M) / S               si L == 0
 *
 * L'application affiche une position (z-score, percentile). Elle n'émet aucune
 * interprétation : c'est le rôle du médecin.
 */

export interface LMS { L: number; M: number; S: number }

export function zScore(value: number, { L, M, S }: LMS): number {
  if (value <= 0 || M <= 0 || S <= 0) throw new Error('Valeurs LMS ou mesure invalides')
  return L === 0 ? Math.log(value / M) / S : (Math.pow(value / M, L) - 1) / (L * S)
}

/** Fonction de répartition normale — approximation d'Abramowitz & Stegun (7.1.26). */
export function percentileFromZ(z: number): number {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x)
  return 50 * (1 + sign * y)
}

/** Interpole les coefficients LMS entre deux points de la table de référence. */
export function interpolateLMS(a: LMS, b: LMS, ratio: number): LMS {
  const mix = (x: number, y: number) => x + (y - x) * ratio
  return { L: mix(a.L, b.L), M: mix(a.M, b.M), S: mix(a.S, b.S) }
}

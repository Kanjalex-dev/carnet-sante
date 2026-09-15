import { useId, useMemo } from 'react'
import {
  type Indicator, type PlottedMeasure, type RefPoint, type Sex,
  MAX_AGE_DAYS, referenceCurve,
} from '../domain/growthChart'

/**
 * Tracé d'une courbe de croissance.
 *
 * Trois couloirs de référence (−2 ET, médiane, +2 ET) dans un seul bleu, du
 * clair au soutenu : c'est une grandeur ordonnée, pas des catégories. La
 * courbe de l'enfant est la seule ligne rose — une série unique, donc pas de
 * légende à décoder : les repères sont écrits au bout des courbes.
 */

const W = 360
const H = 240
const M = { top: 14, right: 46, bottom: 26, left: 34 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

const BANDS: { z: number; color: string; label: string }[] = [
  { z: 2, color: '#275C94', label: '+2 ET' },
  { z: 0, color: '#5C89B8', label: 'médiane' },
  { z: -2, color: '#9CBBD8', label: '−2 ET' },
]

export interface ChartProps {
  indicator: Indicator
  sex: Sex
  unit: string
  points: PlottedMeasure[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function monthsTicks(maxDays: number): number[] {
  const months = maxDays / 30.4375
  const step = months <= 15 ? 3 : months <= 30 ? 6 : 12
  const out: number[] = []
  for (let m = 0; m * 30.4375 <= maxDays + 1; m += step) out.push(m)
  return out
}

export function GrowthChart({ indicator, sex, unit, points, selectedId, onSelect }: ChartProps) {
  const titleId = useId()

  const maxDays = useMemo(() => {
    const last = points.length > 0 ? points[points.length - 1].ageDays : 0
    return Math.min(MAX_AGE_DAYS, Math.max(365, Math.ceil((last * 1.15) / 30.4375) * 30.4375))
  }, [points])

  const curves = useMemo(
    () => BANDS.map((b) => ({ ...b, pts: referenceCurve(indicator, sex, b.z, maxDays, 30) })),
    [indicator, sex, maxDays],
  )

  const [yMin, yMax] = useMemo(() => {
    const vals: number[] = []
    for (const c of curves) for (const p of c.pts) vals.push(p.value)
    for (const p of points) vals.push(p.value)
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo) * 0.08 || 1
    return [lo - pad, hi + pad]
  }, [curves, points])

  const x = (days: number) => M.left + (days / maxDays) * PW
  const y = (v: number) => M.top + PH - ((v - yMin) / (yMax - yMin)) * PH
  const path = (pts: RefPoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.ageDays).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')

  const ticks = monthsTicks(maxDays)
  const yTicks = useMemo(() => {
    const raw = (yMax - yMin) / 4
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
    const out: number[] = []
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) out.push(Number(v.toFixed(4)))
    return out
  }, [yMin, yMax])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-labelledby={titleId}
      className="block h-auto w-full">
      <title id={titleId}>
        Courbe de croissance. {points.length} mesure{points.length > 1 ? 's' : ''} placée
        {points.length > 1 ? 's' : ''} entre les couloirs de référence de l’OMS. Le détail
        chiffré figure dans la liste sous le graphique.
      </title>

      {/* Grille discrète : elle situe, elle ne se regarde pas. */}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={M.left} x2={M.left + PW} y1={y(v)} y2={y(v)} stroke="#E8EFF6" strokeWidth="1" />
          <text x={M.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="8.5" fill="#8496A5"
            className="tnum">{v}</text>
        </g>
      ))}
      {ticks.map((m) => (
        <text key={`x${m}`} x={x(m * 30.4375)} y={H - 8} textAnchor="middle" fontSize="8.5"
          fill="#8496A5" className="tnum">{m === 0 ? 'nais.' : `${m} m`}</text>
      ))}
      <text x={M.left - 6} y={M.top - 4} textAnchor="end" fontSize="8.5" fill="#8496A5">{unit}</text>

      {curves.map((c) => (
        <g key={c.z}>
          <path d={path(c.pts)} fill="none" stroke={c.color} strokeWidth={c.z === 0 ? 1.6 : 1.2}
            strokeDasharray={c.z === 0 ? undefined : '4 3'} strokeLinecap="round" />
          <text x={M.left + PW + 4} y={y(c.pts[c.pts.length - 1].value) + 3} fontSize="8.5"
            fill={c.color} fontWeight="600">{c.label}</text>
        </g>
      ))}

      {points.length > 1 && (
        <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.ageDays).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')}
          fill="none" stroke="#C46B8B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {points.map((p) => (
        <g key={p.id}>
          <circle cx={x(p.ageDays)} cy={y(p.value)} r="5" fill="#C46B8B" stroke="#FFFFFF"
            strokeWidth="2" />
          {p.id === selectedId && (
            <circle cx={x(p.ageDays)} cy={y(p.value)} r="8.5" fill="none" stroke="#A04E6B"
              strokeWidth="1.5" />
          )}
          {/* Cible tactile large, invisible : le point fait 10 px, le doigt non. */}
          <circle cx={x(p.ageDays)} cy={y(p.value)} r="14" fill="transparent"
            onClick={() => onSelect(p.id === selectedId ? null : p.id)}
            style={{ cursor: 'pointer' }} />
        </g>
      ))}
    </svg>
  )
}

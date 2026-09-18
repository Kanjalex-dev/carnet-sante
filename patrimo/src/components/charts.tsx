'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatEur, formatEurShort } from '@/lib/money';
import { monthLabelShort } from '@/lib/dates';

/*
 * Regles de lecture appliquees a tous les graphiques :
 *  - pas de grille : elle ajoute du bruit sans aider a la lecture sur mobile ;
 *  - axes en format court (12 k€ plutot que 12 000,00 €) ;
 *  - infobulle avec le montant exact, puisque l'axe est arrondi ;
 *  - hauteur fixe, pour eviter le decalage de mise en page au chargement.
 */

const AXIS = {
  stroke: 'rgb(var(--muted))',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

function TooltipBox({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = formatter ?? ((v: number) => formatEur(v));
  return (
    <div className="rounded-xl2 border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted">{entry.name}</span>
          <span className="amount ml-auto">{fmt(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyTrendChart({
  data,
}: {
  data: { month: string; incomeCents: number; expenseCents: number }[];
}) {
  const rows = data.map((d) => ({
    label: monthLabelShort(d.month),
    Entrees: d.incomeCents,
    Depenses: d.expenseCents,
  }));

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} tickFormatter={(v) => formatEurShort(Number(v))} width={62} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgb(var(--surface-2))' }} />
          <Bar dataKey="Entrees" fill="rgb(var(--positive))" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Depenses" fill="rgb(var(--accent))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryPie({
  data,
}: {
  data: { name: string; valueCents: number; color: string }[];
}) {
  const rows = data.map((d) => ({ name: d.name, value: d.valueCents, color: d.color }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius="52%"
            outerRadius="82%"
            paddingAngle={1}
            strokeWidth={0}
          >
            {rows.map((row, i) => (
              <Cell key={i} fill={row.color} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceForecastChart({
  data,
  threshold = 0,
}: {
  data: { date: string; balanceCents: number }[];
  threshold?: number;
}) {
  const rows = data.map((d) => ({
    label: d.date.slice(8, 10),
    Solde: d.balanceCents,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
          <YAxis {...AXIS} tickFormatter={(v) => formatEurShort(Number(v))} width={62} />
          <Tooltip content={<TooltipBox />} />
          {/* Le zero est la seule ligne de reference qui compte sur un solde. */}
          <ReferenceLine y={threshold} stroke="rgb(var(--negative))" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="Solde"
            stroke="rgb(var(--accent))"
            strokeWidth={2}
            fill="url(#balanceFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetWorthChart({
  data,
}: {
  data: { date: string; valueCents: number }[];
}) {
  const rows = data.map((d) => ({
    label: d.date.slice(5),
    Patrimoine: d.valueCents,
  }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--positive))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="rgb(var(--positive))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...AXIS} tickFormatter={(v) => formatEurShort(Number(v))} width={62} />
          <Tooltip content={<TooltipBox />} />
          <Area
            type="monotone"
            dataKey="Patrimoine"
            stroke="rgb(var(--positive))"
            strokeWidth={2}
            fill="url(#nwFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const BENCHMARK_COLORS = [
  'rgb(var(--muted))',
  'rgb(var(--warn))',
  'rgb(var(--accent))',
  'rgb(var(--negative))',
];

export function PerformanceChart({
  data,
  benchmarkLabels,
}: {
  data: { date: string; portfolioIndex: number; benchmarks: Record<string, number> }[];
  benchmarkLabels: Record<string, string>;
}) {
  const keys = Object.keys(benchmarkLabels);
  const rows = data.map((d) => {
    const row: Record<string, string | number> = {
      label: d.date.slice(5),
      Portefeuille: Number(d.portfolioIndex.toFixed(2)),
    };
    for (const key of keys) {
      if (d.benchmarks[key] !== undefined) {
        row[benchmarkLabels[key]] = Number(d.benchmarks[key].toFixed(2));
      }
    }
    return row;
  });

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={28} />
          <YAxis {...AXIS} width={46} domain={['auto', 'auto']} />
          <Tooltip
            content={<TooltipBox formatter={(v) => v.toFixed(1)} />}
          />
          {/* Base 100 : au-dessus on gagne, en dessous on perd. */}
          <ReferenceLine y={100} stroke="rgb(var(--line))" />
          <Line
            type="monotone"
            dataKey="Portefeuille"
            stroke="rgb(var(--positive))"
            strokeWidth={2.5}
            dot={false}
          />
          {keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={benchmarkLabels[key]}
              stroke={BENCHMARK_COLORS[i % BENCHMARK_COLORS.length]}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectionChart({
  scenarios,
}: {
  scenarios: { name: string; points: { year: number; valueCents: number }[] }[];
}) {
  if (scenarios.length === 0) return null;
  const years = scenarios[0].points.map((p) => p.year);
  const rows = years.map((year, i) => {
    const row: Record<string, number> = { year };
    for (const scenario of scenarios) {
      row[scenario.name] = scenario.points[i]?.valueCents ?? 0;
    }
    return row;
  });

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
          <XAxis dataKey="year" {...AXIS} tickFormatter={(v) => `${v} an${v > 1 ? 's' : ''}`} />
          <YAxis {...AXIS} tickFormatter={(v) => formatEurShort(Number(v))} width={66} />
          <Tooltip content={<TooltipBox />} />
          <Line type="monotone" dataKey="Defavorable" stroke="rgb(var(--negative))" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="Median" stroke="rgb(var(--accent))" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="Favorable" stroke="rgb(var(--positive))" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

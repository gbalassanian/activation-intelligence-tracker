'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TtfvPoint {
  label: string;
  median: number | null;
  p90: number | null;
  activationRate: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number | null }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const get = (key: string) => payload.find((p) => p.dataKey === key)?.value;
  const median = get('median');
  const p90 = get('p90');
  const activation = get('activationRate');

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-2.5 shadow-lg">
      <p className="mb-1.5 text-[11px] font-medium tracking-tight text-zinc-900">
        Week of {label}
      </p>
      <div className="flex flex-col gap-0.5 font-mono text-[10.5px] text-zinc-600">
        <span className="flex justify-between gap-4">
          <span className="text-zinc-400">P50 TTFV</span>
          <span>{median === null || median === undefined ? '—' : `${median.toFixed(1)}h`}</span>
        </span>
        <span className="flex justify-between gap-4">
          <span className="text-zinc-400">P90 TTFV</span>
          <span>{p90 === null || p90 === undefined ? '—' : `${p90.toFixed(1)}h`}</span>
        </span>
        <span className="flex justify-between gap-4">
          <span className="text-zinc-400">activation</span>
          <span className="text-emerald-600">{activation ?? 0}%</span>
        </span>
      </div>
    </div>
  );
}

export function TtfvChart({ data }: { data: TtfvPoint[] }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="p90Fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a1a1aa" stopOpacity={0.16} />
              <stop offset="100%" stopColor="#a1a1aa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#a1a1aa', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            tickLine={false}
            axisLine={{ stroke: '#e4e4e7' }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#a1a1aa', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(value: number) => `${Math.round(value)}h`}
          />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ stroke: '#d4d4d8', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="p90"
            stroke="#a1a1aa"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="url(#p90Fill)"
            connectNulls
            dot={false}
            activeDot={false}
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke="#09090b"
            strokeWidth={2}
            connectNulls
            dot={{ r: 2.5, fill: '#09090b', strokeWidth: 0 }}
            activeDot={{ r: 4, fill: '#09090b', strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

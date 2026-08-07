'use client'

/**
 * Explore — build your own chart.
 *
 * Pick up to three metrics, a chart type, a smoothing level, and optionally
 * overlay the previous period. The one rule it enforces: metrics with different
 * units can't share a y-axis, so mixing them switches the scale to an index
 * (first value = 100). That keeps every chart here honest instead of inventing a
 * correlation out of two arbitrary scales.
 */

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsPayload, DayPoint } from '@/lib/analytics/types'
import { ChartCard, DataTable, SectionHeading, VIZ, VizTooltip, axisProps, gridProps, tickInterval } from './chart-kit'
import { cn } from '@/lib/utils'
import { AreaChart as AreaIcon, BarChart3, LineChart as LineIcon, RotateCcw } from 'lucide-react'

type ChartType = 'line' | 'area' | 'bar'
type Smoothing = 'raw' | 'ma7' | 'weekly'
type Scale = 'actual' | 'indexed'

interface MetricDef {
  key: keyof DayPoint
  label: string
  unit: string
  group: string
  /** How a week's worth of values collapses when smoothing to weekly. */
  weekly: 'mean' | 'sum'
}

const METRICS: MetricDef[] = [
  { key: 'intakeKcal', label: 'Calories eaten', unit: 'kcal', group: 'Energy', weekly: 'mean' },
  { key: 'maintenanceKcal', label: 'Maintenance', unit: 'kcal', group: 'Energy', weekly: 'mean' },
  { key: 'balanceKcal', label: 'Energy balance', unit: 'kcal', group: 'Energy', weekly: 'sum' },
  { key: 'burnKcal', label: 'Training burn', unit: 'kcal', group: 'Energy', weekly: 'sum' },
  { key: 'proteinG', label: 'Protein', unit: 'g', group: 'Macros', weekly: 'mean' },
  { key: 'carbsG', label: 'Carbs', unit: 'g', group: 'Macros', weekly: 'mean' },
  { key: 'fatG', label: 'Fat', unit: 'g', group: 'Macros', weekly: 'mean' },
  { key: 'fiberG', label: 'Fiber', unit: 'g', group: 'Macros', weekly: 'mean' },
  { key: 'weightKg', label: 'Body weight', unit: 'kg', group: 'Body', weekly: 'mean' },
  { key: 'weightTrendKg', label: 'Weight trend', unit: 'kg', group: 'Body', weekly: 'mean' },
  { key: 'hydrationL', label: 'Hydration', unit: 'L', group: 'Body', weekly: 'mean' },
  { key: 'sleepH', label: 'Sleep hours', unit: 'h', group: 'Recovery', weekly: 'mean' },
  { key: 'sleepQuality', label: 'Sleep quality', unit: '/10', group: 'Recovery', weekly: 'mean' },
  { key: 'mood', label: 'Mood', unit: '/10', group: 'Mind', weekly: 'mean' },
  { key: 'stress', label: 'Stress', unit: '/10', group: 'Mind', weekly: 'mean' },
  { key: 'anxiety', label: 'Anxiety', unit: '/10', group: 'Mind', weekly: 'mean' },
  { key: 'focus', label: 'Focus', unit: '/10', group: 'Mind', weekly: 'mean' },
  { key: 'motivation', label: 'Motivation', unit: '/10', group: 'Mind', weekly: 'mean' },
  { key: 'dayRating', label: 'Day rating', unit: '/10', group: 'Mind', weekly: 'mean' },
  { key: 'volumeKg', label: 'Tonnage', unit: 'kg', group: 'Training', weekly: 'sum' },
  { key: 'sets', label: 'Sets', unit: '', group: 'Training', weekly: 'sum' },
  { key: 'reps', label: 'Reps', unit: '', group: 'Training', weekly: 'sum' },
  { key: 'workoutMin', label: 'Training minutes', unit: 'min', group: 'Training', weekly: 'sum' },
  { key: 'cardioMin', label: 'Cardio minutes', unit: 'min', group: 'Training', weekly: 'sum' },
  { key: 'symptomCount', label: 'Symptoms', unit: '', group: 'Other', weekly: 'sum' },
  { key: 'deepWorkMin', label: 'Deep work', unit: 'min', group: 'Other', weekly: 'sum' },
  { key: 'screenMin', label: 'Screen time', unit: 'min', group: 'Other', weekly: 'mean' },
  { key: 'mealCount', label: 'Items logged', unit: '', group: 'Other', weekly: 'sum' },
]

const GROUPS = Array.from(new Set(METRICS.map((m) => m.group)))
const SERIES_COLORS = [VIZ.s1, VIZ.s2, VIZ.s3]
const MAX_SERIES = 3

export function ExploreView({ data }: { data: AnalyticsPayload }) {
  const [selected, setSelected] = useState<(keyof DayPoint)[]>(['intakeKcal', 'balanceKcal'])
  const [chartType, setChartType] = useState<ChartType>('line')
  const [smoothing, setSmoothing] = useState<Smoothing>('raw')
  const [compare, setCompare] = useState(false)

  const defs = selected.map((k) => METRICS.find((m) => m.key === k)!).filter(Boolean)
  const units = new Set(defs.map((d) => d.unit))
  // Mixed units can't share an axis. Index them instead of adding a second one.
  const forcedIndex = units.size > 1
  const [scalePref, setScalePref] = useState<Scale>('actual')
  const scale: Scale = forcedIndex ? 'indexed' : scalePref

  const toggle = (key: keyof DayPoint) =>
    setSelected((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= MAX_SERIES ? cur : [...cur, key]
    )

  const rows = useMemo(
    () => buildRows(data.days, compare ? data.previousDays : null, defs, smoothing, scale),
    [data.days, data.previousDays, defs, smoothing, scale, compare]
  )

  const unitLabel = scale === 'indexed' ? 'indexed, first value = 100' : defs[0]?.unit || ''

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Build your own chart"
        hint={`Pick up to ${MAX_SERIES} metrics, choose how to draw them, and compare against the period before.`}
      />

      {/* ---- Controls, one block above the chart ---- */}
      <Card className="p-4 space-y-4">
        {/* Metric picker */}
        <div className="space-y-2.5">
          {GROUPS.map((group) => (
            <div key={group} className="flex flex-wrap items-center gap-1.5">
              <span className="w-[68px] flex-shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {group}
              </span>
              {METRICS.filter((m) => m.group === group).map((m) => {
                const active = selected.includes(m.key)
                const idx = selected.indexOf(m.key)
                const full = !active && selected.length >= MAX_SERIES
                return (
                  <button
                    key={m.key as string}
                    type="button"
                    disabled={full}
                    onClick={() => toggle(m.key)}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-xs transition-colors',
                      active
                        ? 'border-transparent text-white'
                        : full
                          ? 'cursor-not-allowed border-border text-muted-foreground/40'
                          : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                    style={active ? { background: SERIES_COLORS[idx] } : undefined}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Chart options */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3">
          <ToggleGroup
            label="Chart"
            value={chartType}
            onChange={(v) => setChartType(v as ChartType)}
            options={[
              { value: 'line', label: 'Line', icon: <LineIcon className="h-3 w-3" /> },
              { value: 'area', label: 'Area', icon: <AreaIcon className="h-3 w-3" /> },
              { value: 'bar', label: 'Bar', icon: <BarChart3 className="h-3 w-3" /> },
            ]}
          />
          <ToggleGroup
            label="Smoothing"
            value={smoothing}
            onChange={(v) => setSmoothing(v as Smoothing)}
            options={[
              { value: 'raw', label: 'Daily' },
              { value: 'ma7', label: '7-day avg' },
              { value: 'weekly', label: 'By week' },
            ]}
          />
          <ToggleGroup
            label="Scale"
            value={scale}
            disabled={forcedIndex}
            onChange={(v) => setScalePref(v as Scale)}
            options={[
              { value: 'actual', label: 'Actual units' },
              { value: 'indexed', label: 'Indexed' },
            ]}
          />
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            <span className="text-muted-foreground">Compare with previous period</span>
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => {
              setSelected(['intakeKcal', 'balanceKcal'])
              setChartType('line')
              setSmoothing('raw')
              setScalePref('actual')
              setCompare(false)
            }}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
        </div>

        {forcedIndex && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            You picked metrics with different units ({Array.from(units).filter(Boolean).join(', ') || 'unitless'}), so
            they are indexed to their first value = 100. Two different scales on one chart would invent a
            relationship that isn&apos;t in the data — this shows the shapes honestly instead.
          </p>
        )}
      </Card>

      {/* ---- The chart ---- */}
      {defs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Pick a metric above to draw a chart.</Card>
      ) : (
        <ChartCard
          title={defs.map((d) => d.label).join(' · ')}
          subtitle={`${smoothing === 'raw' ? 'Daily values' : smoothing === 'ma7' ? '7-day moving average' : 'Weekly ' + (defs[0].weekly === 'sum' ? 'totals' : 'averages')}${unitLabel ? ` · ${unitLabel}` : ''}${compare ? ' · dashed is the previous period' : ''}`}
          height={340}
          footnote={
            compare
              ? `The previous period is the ${data.range.days} days immediately before this range, aligned by position rather than date so the two can be laid over each other.`
              : undefined
          }
        >
          {renderChart({ chartType, rows, defs, compare, scale })}
        </ChartCard>
      )}

      {/* ---- Table view of exactly what's plotted ---- */}
      {defs.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">The same numbers as a table</h3>
          <DataTable
            rows={[...rows].reverse()}
            maxHeight={420}
            columns={[
              { key: 'label', header: smoothing === 'weekly' ? 'Week of' : 'Date', render: (r: any) => r.label },
              ...defs.map((d, i) => ({
                key: d.key as string,
                header: `${d.label}${d.unit && scale === 'actual' ? ` (${d.unit})` : ''}`,
                align: 'right' as const,
                render: (r: any) =>
                  r[d.key] == null ? <span className="text-muted-foreground">—</span> : Number(r[d.key]).toFixed(scale === 'indexed' ? 1 : d.unit === 'kg' && d.key === 'weightKg' ? 1 : 0),
              })),
              ...(compare
                ? defs.map((d) => ({
                    key: `prev_${d.key as string}`,
                    header: `${d.label} (prev)`,
                    align: 'right' as const,
                    render: (r: any) =>
                      r[`prev_${d.key as string}`] == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        Number(r[`prev_${d.key as string}`]).toFixed(scale === 'indexed' ? 1 : 0)
                      ),
                  }))
                : []),
            ]}
          />
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data shaping
// ---------------------------------------------------------------------------

function ToggleGroup({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; icon?: React.ReactNode }[]
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className={cn('flex rounded-lg border border-border p-0.5', disabled && 'opacity-50')}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              value === o.value
                ? 'bg-primary text-primary-foreground'
                : disabled
                  ? 'cursor-not-allowed text-muted-foreground'
                  : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface Row {
  label: string
  date: string
  [key: string]: number | null | string
}

/** Centred 7-day mean, skipping nulls, so a gap doesn't pull the line to zero. */
function movingAverage(values: (number | null)[], window = 7): (number | null)[] {
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - half), i + half + 1).filter((v): v is number => v != null)
    if (slice.length === 0) return null
    return slice.reduce((s, v) => s + v, 0) / slice.length
  })
}

function buildRows(
  days: DayPoint[],
  previousDays: DayPoint[] | null,
  defs: MetricDef[],
  smoothing: Smoothing,
  scale: Scale
): Row[] {
  const shape = (source: DayPoint[]) => {
    if (smoothing !== 'weekly') return source.map((d) => ({ label: d.label, date: d.date, day: d }))
    // Collapse to weeks of seven, using each metric's own rule (sum for volume,
    // mean for a level like weight).
    const buckets: { label: string; date: string; days: DayPoint[] }[] = []
    for (let i = 0; i < source.length; i += 7) {
      const chunk = source.slice(i, i + 7)
      buckets.push({ label: chunk[0].label, date: chunk[0].date, days: chunk })
    }
    return buckets
  }

  const base = shape(days)
  const prev = previousDays ? shape(previousDays) : null

  const valueAt = (entry: any, def: MetricDef): number | null => {
    if (smoothing === 'weekly') {
      const vals = (entry.days as DayPoint[])
        .map((d) => d[def.key])
        .filter((v): v is number => typeof v === 'number')
      if (vals.length === 0) return null
      const total = vals.reduce((s, v) => s + v, 0)
      return def.weekly === 'sum' ? total : total / vals.length
    }
    const v = (entry.day as DayPoint)[def.key]
    return typeof v === 'number' ? v : null
  }

  // Raw series per metric first, so smoothing and indexing can be applied over
  // the whole column rather than point by point.
  const columns = new Map<string, (number | null)[]>()
  for (const def of defs) {
    let series = base.map((e) => valueAt(e, def))
    if (smoothing === 'ma7') series = movingAverage(series)
    if (scale === 'indexed') series = indexSeries(series)
    columns.set(def.key as string, series)

    if (prev) {
      let pseries = prev.map((e) => valueAt(e, def))
      if (smoothing === 'ma7') pseries = movingAverage(pseries)
      if (scale === 'indexed') pseries = indexSeries(pseries)
      columns.set(`prev_${def.key as string}`, pseries)
    }
  }

  return base.map((e, i) => {
    const row: Row = { label: e.label, date: e.date }
    for (const [key, series] of columns) {
      const v = series[i]
      row[key] = v == null ? null : Math.round(v * 100) / 100
    }
    return row
  })
}

/** Rebase a series so its first real value is 100. */
function indexSeries(values: (number | null)[]): (number | null)[] {
  const firstReal = values.find((v) => v != null && v !== 0)
  if (firstReal == null) return values
  return values.map((v) => (v == null ? null : (v / firstReal) * 100))
}

function renderChart({
  chartType,
  rows,
  defs,
  compare,
  scale,
}: {
  chartType: ChartType
  rows: Row[]
  defs: MetricDef[]
  compare: boolean
  scale: Scale
}) {
  const unit = scale === 'indexed' ? '' : defs[0]?.unit ?? ''
  const common = (
    <>
      <CartesianGrid {...gridProps} />
      <XAxis dataKey="label" {...axisProps} interval={tickInterval(rows.length)} />
      <YAxis {...axisProps} width={52} />
      <Tooltip content={<VizTooltip unit={unit ? ` ${unit}` : ''} dp={scale === 'indexed' ? 1 : 0} />} />
      <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
      {/* Zero line only matters for series that can go negative (balance). */}
      {rows.some((r) => defs.some((d) => (r[d.key as string] as number) < 0)) && (
        <ReferenceLine y={0} stroke={VIZ.axis} strokeWidth={1} />
      )}
      {scale === 'indexed' && <ReferenceLine y={100} stroke={VIZ.axis} strokeWidth={1} />}
    </>
  )

  const margin = { top: 8, right: 12, left: -8, bottom: 0 }

  if (chartType === 'bar') {
    return (
      <BarChart data={rows} margin={margin} barGap={2}>
        {common}
        {defs.map((d, i) => (
          <Bar
            key={d.key as string}
            dataKey={d.key as string}
            name={d.label}
            fill={SERIES_COLORS[i]}
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
          />
        ))}
        {compare &&
          defs.map((d, i) => (
            <Bar
              key={`prev_${d.key as string}`}
              dataKey={`prev_${d.key as string}`}
              name={`${d.label} (prev)`}
              fill={SERIES_COLORS[i]}
              fillOpacity={0.35}
              radius={[3, 3, 0, 0]}
              maxBarSize={26}
            />
          ))}
      </BarChart>
    )
  }

  if (chartType === 'area') {
    return (
      <AreaChart data={rows} margin={margin}>
        {common}
        {defs.map((d, i) => (
          <Area
            key={d.key as string}
            type="monotone"
            dataKey={d.key as string}
            name={d.label}
            stroke={SERIES_COLORS[i]}
            strokeWidth={2}
            fill={SERIES_COLORS[i]}
            fillOpacity={0.18}
            connectNulls
          />
        ))}
        {compare &&
          defs.map((d, i) => (
            <Area
              key={`prev_${d.key as string}`}
              type="monotone"
              dataKey={`prev_${d.key as string}`}
              name={`${d.label} (prev)`}
              stroke={SERIES_COLORS[i]}
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="transparent"
              connectNulls
            />
          ))}
      </AreaChart>
    )
  }

  return (
    <LineChart data={rows} margin={margin}>
      {common}
      {defs.map((d, i) => (
        <Line
          key={d.key as string}
          type="monotone"
          dataKey={d.key as string}
          name={d.label}
          stroke={SERIES_COLORS[i]}
          strokeWidth={2}
          dot={rows.length <= 20 ? { r: 2.5 } : false}
          connectNulls
        />
      ))}
      {compare &&
        defs.map((d, i) => (
          <Line
            key={`prev_${d.key as string}`}
            type="monotone"
            dataKey={`prev_${d.key as string}`}
            name={`${d.label} (prev)`}
            stroke={SERIES_COLORS[i]}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        ))}
    </LineChart>
  )
}

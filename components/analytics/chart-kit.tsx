'use client'

/**
 * Shared chart + stat primitives for /analytics.
 *
 * Every chart on the page goes through these so the whole dashboard reads as one
 * system: one grid style (solid hairline, horizontal only), one axis style, one
 * tooltip, one mark spec (2px lines, 4px rounded bar ends, 2px surface gaps
 * between stacked fills). Colours come from the `--viz-*` CSS variables defined
 * in [app/globals.css] — a validated categorical order that must not be
 * reordered or extended past six hues.
 */

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ResponsiveContainer } from 'recharts'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Info,
  Minus,
  OctagonAlert,
  TriangleAlert,
} from 'lucide-react'
import type { Finding, Severity } from '@/lib/analytics/types'

// ---------------------------------------------------------------------------
// Palette — fixed slot order. Never cycle past slot 6; fold the tail into "Other".
// ---------------------------------------------------------------------------

export const VIZ = {
  s1: 'var(--viz-1)', // blue
  s2: 'var(--viz-2)', // orange
  s3: 'var(--viz-3)', // aqua
  s4: 'var(--viz-4)', // yellow
  s5: 'var(--viz-5)', // magenta
  s6: 'var(--viz-6)', // violet
  cool: 'var(--viz-cool)',
  warm: 'var(--viz-warm)',
  mid: 'var(--viz-mid)',
  good: 'var(--viz-good)',
  warn: 'var(--viz-warn)',
  serious: 'var(--viz-serious)',
  critical: 'var(--viz-critical)',
  grid: 'var(--viz-grid)',
  axis: 'var(--viz-axis)',
  surface: 'var(--viz-surface)',
} as const

export const SERIES_ORDER = [VIZ.s1, VIZ.s2, VIZ.s3, VIZ.s4, VIZ.s5, VIZ.s6]

// Shared axis/grid props — spread these instead of restyling per chart.
export const gridProps = {
  stroke: VIZ.grid,
  strokeWidth: 1,
  vertical: false,
} as const

export const axisProps = {
  tickLine: false,
  axisLine: { stroke: VIZ.grid },
  tick: { fontSize: 11, fill: VIZ.axis },
  stroke: VIZ.axis,
} as const

/** Skip tick labels on dense daily series so they never collide. */
export function tickInterval(n: number): number {
  if (n <= 10) return 0
  if (n <= 20) return 1
  if (n <= 45) return Math.ceil(n / 12)
  return Math.ceil(n / 10)
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const fmtNum = (v: number | null | undefined, dp = 0, suffix = ''): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(dp)}${suffix}`

export const fmtInt = (v: number | null | undefined, suffix = ''): string =>
  v == null || !Number.isFinite(v) ? '—' : `${Math.round(v).toLocaleString()}${suffix}`

export const fmtSigned = (v: number | null | undefined, dp = 0, suffix = ''): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dp)}${suffix}`

export const fmtKcal = (v: number | null | undefined): string => (v == null ? '—' : `${Math.round(v).toLocaleString()} kcal`)

export const fmtKg = (v: number | null | undefined, dp = 1): string => (v == null ? '—' : `${v.toFixed(dp)} kg`)

export const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

// ---------------------------------------------------------------------------
// Cards & layout
// ---------------------------------------------------------------------------

export function ChartCard({
  title,
  subtitle,
  children,
  height = 260,
  className = '',
  action,
  footnote,
}: {
  title: string
  subtitle?: string
  children: React.ReactElement
  height?: number
  className?: string
  action?: React.ReactNode
  footnote?: string
}) {
  return (
    <Card className={cn('p-4 md:p-5 overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {/* Height includes room for the x-axis band so the card never scrolls. */}
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
      {footnote && <p className="text-[11px] text-muted-foreground mt-3 leading-snug">{footnote}</p>}
    </Card>
  )
}

export function SectionHeading({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-3 pt-2">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground/80 mt-1">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * The one-number-is-the-chart case. Proportional figures (no tabular-nums) —
 * equal-width digits read loose at display sizes.
 */
export function HeroStat({
  label,
  value,
  unit,
  note,
  tone = 'neutral',
}: {
  label: string
  value: string
  unit?: string
  note?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : tone === 'warn'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-foreground'
  return (
    <Card className="p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-3xl md:text-4xl font-bold leading-none', toneClass)}>
        {value}
        {unit && <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span>}
      </p>
      {note && <p className="mt-2 text-xs text-muted-foreground leading-snug">{note}</p>}
    </Card>
  )
}

export function StatTile({
  label,
  value,
  sub,
  delta,
  deltaGoodDirection = 'up',
  icon,
}: {
  label: string
  value: string
  sub?: string
  /** Change vs the previous equal-length period, in the value's own units. */
  delta?: number | null
  deltaGoodDirection?: 'up' | 'down' | 'none'
  icon?: React.ReactNode
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
      </div>
      <p className="mt-1.5 text-xl font-bold leading-none">{value}</p>
      <div className="mt-1.5 flex items-center gap-2 min-h-[16px]">
        {delta != null && Number.isFinite(delta) && deltaGoodDirection !== 'none' && (
          <DeltaBadge delta={delta} goodDirection={deltaGoodDirection} />
        )}
        {sub && <span className="text-[11px] text-muted-foreground truncate">{sub}</span>}
      </div>
    </Card>
  )
}

export function DeltaBadge({
  delta,
  goodDirection,
  dp = 0,
  suffix = '',
}: {
  delta: number
  goodDirection: 'up' | 'down'
  dp?: number
  suffix?: string
}) {
  const flat = Math.abs(delta) < 0.0001
  const good = goodDirection === 'up' ? delta > 0 : delta < 0
  const Icon = flat ? Minus : delta > 0 ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium tabular-nums',
        flat
          ? 'bg-muted text-muted-foreground'
          : good
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-500/10 text-red-700 dark:text-red-400'
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(dp)}
      {suffix}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tooltip — one implementation for every chart on the page
// ---------------------------------------------------------------------------

export function VizTooltip({
  active,
  payload,
  label,
  unit = '',
  dp = 0,
  extra,
}: {
  active?: boolean
  payload?: any[]
  label?: string
  unit?: string
  dp?: number
  /** Extra rows keyed off the hovered datum (e.g. "Rest day"). */
  extra?: (datum: any) => { label: string; value: string }[]
}) {
  if (!active || !payload?.length) return null
  const datum = payload[0]?.payload
  const rows = payload.filter((p) => p.value != null)
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg text-xs min-w-[140px]">
      <p className="font-medium mb-1.5">{datum?.date ? fmtDate(datum.date) : label}</p>
      <div className="space-y-1">
        {rows.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm flex-shrink-0" style={{ background: p.color || p.fill }} />
              {p.name}
            </span>
            <span className="font-medium tabular-nums">
              {typeof p.value === 'number' ? p.value.toFixed(dp) : p.value}
              {unit}
            </span>
          </div>
        ))}
        {extra?.(datum)?.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 pt-1 border-t border-border/60">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const SEVERITY: Record<
  Severity,
  { label: string; icon: React.ComponentType<{ className?: string }>; badge: string; ring: string }
> = {
  critical: {
    label: 'Critical',
    icon: OctagonAlert,
    badge: 'bg-red-500/10 text-red-700 dark:text-red-400',
    ring: 'border-red-500/40',
  },
  serious: {
    label: 'Serious',
    icon: TriangleAlert,
    badge: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    ring: 'border-orange-500/40',
  },
  warning: {
    label: 'Watch',
    icon: AlertTriangle,
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    ring: 'border-amber-500/30',
  },
  insight: {
    label: 'Insight',
    icon: Info,
    badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    ring: 'border-blue-500/25',
  },
  good: {
    label: 'Working',
    icon: CheckCircle2,
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    ring: 'border-emerald-500/30',
  },
}

/** Status is never colour-alone: every card carries an icon and a word. */
export function FindingCard({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  const s = SEVERITY[finding.severity]
  const Icon = s.icon
  return (
    <Card className={cn('p-4 md:p-5 border-l-4', s.ring)}>
      <div className="flex items-start gap-3">
        <span className={cn('inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', s.badge)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', s.badge)}>
              {s.label}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{finding.area}</span>
          </div>
          <h3 className="mt-1.5 font-semibold leading-snug text-balance">{finding.title}</h3>
          {!compact && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{finding.detail}</p>}
          {!compact && finding.evidence.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {finding.evidence.map((e) => (
                <div key={e.label} className="text-xs">
                  <span className="text-muted-foreground">{e.label}: </span>
                  <span className="font-semibold tabular-nums">{e.value}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-sm">
            <span className="font-medium text-primary flex-shrink-0">Do this:</span>
            <span className="text-foreground/90">{finding.action}</span>
          </p>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Table view — the accessibility relief for every chart on the page
// ---------------------------------------------------------------------------

export function DataTable<T>({
  rows,
  columns,
  empty = 'Nothing to show yet.',
  maxHeight = 420,
}: {
  rows: T[]
  columns: { key: string; header: string; align?: 'left' | 'right'; render: (row: T) => React.ReactNode }[]
  empty?: string
  maxHeight?: number
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-auto rounded-lg border border-border" style={{ maxHeight }}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-secondary/80 backdrop-blur">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'whitespace-nowrap px-3 py-2 font-medium text-muted-foreground',
                  c.align === 'right' ? 'text-right' : 'text-left'
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border/60">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'whitespace-nowrap px-3 py-1.5 tabular-nums',
                    c.align === 'right' ? 'text-right' : 'text-left'
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Legend for charts whose colour is semantic rather than per-series (diverging
 * bars, day-type shading), where Recharts' own legend has nothing to list.
 * Keeps the rule that identity is never carried by colour alone.
 */
export function SwatchLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">{body}</p>
    </Card>
  )
}

/** A labelled row of "x of y" progress, used for coverage and habit consistency. */
export function MeterRow({
  label,
  value,
  max,
  caption,
  color = VIZ.s1,
}: {
  label: string
  value: number
  max: number
  caption?: string
  color?: string
}) {
  const share = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{caption ?? `${Math.round(share)}%`}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${share}%`, background: color }} />
      </div>
    </div>
  )
}

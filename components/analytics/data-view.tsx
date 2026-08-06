'use client'

/**
 * Data — the table view behind every chart on this page, plus what is missing.
 *
 * This tab is the accessibility relief for the whole dashboard (every value that
 * a chart encodes as colour or position is readable as a number here) and it
 * doubles as the honesty page: coverage shows which dimensions are too sparse to
 * draw conclusions from.
 */

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { AnalyticsPayload, DayPoint } from '@/lib/analytics/types'
import { DataTable, MeterRow, SectionHeading, StatTile, VIZ } from './chart-kit'
import { Download } from 'lucide-react'

type Mode = 'all' | 'logged' | 'trained' | 'rest' | 'surplus'

const MODES: { key: Mode; label: string }[] = [
  { key: 'all', label: 'All days' },
  { key: 'logged', label: 'Logged only' },
  { key: 'trained', label: 'Training days' },
  { key: 'rest', label: 'Rest days' },
  { key: 'surplus', label: 'Surplus days' },
]

export function DataView({ data }: { data: AnalyticsPayload }) {
  const [mode, setMode] = useState<Mode>('logged')

  const rows = useMemo(() => {
    const filtered = data.days.filter((d) => {
      if (mode === 'logged') return d.logged
      if (mode === 'trained') return d.trained
      if (mode === 'rest') return !d.trained
      if (mode === 'surplus') return (d.balanceKcal ?? 0) > 0
      return true
    })
    return [...filtered].reverse()
  }, [data.days, mode])

  const exportCsv = () => {
    const cols: { key: keyof DayPoint; header: string }[] = [
      { key: 'date', header: 'date' },
      { key: 'logged', header: 'logged' },
      { key: 'intakeKcal', header: 'intake_kcal' },
      { key: 'maintenanceKcal', header: 'maintenance_kcal' },
      { key: 'balanceKcal', header: 'balance_kcal' },
      { key: 'burnKcal', header: 'training_burn_kcal' },
      { key: 'proteinG', header: 'protein_g' },
      { key: 'carbsG', header: 'carbs_g' },
      { key: 'fatG', header: 'fat_g' },
      { key: 'fiberG', header: 'fiber_g' },
      { key: 'weightKg', header: 'weight_kg' },
      { key: 'weightTrendKg', header: 'weight_trend_kg' },
      { key: 'sleepH', header: 'sleep_h' },
      { key: 'sleepQuality', header: 'sleep_quality' },
      { key: 'mood', header: 'mood' },
      { key: 'stress', header: 'stress' },
      { key: 'dayRating', header: 'day_rating' },
      { key: 'trained', header: 'trained' },
      { key: 'workoutCount', header: 'workouts' },
      { key: 'workoutMin', header: 'workout_min' },
      { key: 'sets', header: 'sets' },
      { key: 'volumeKg', header: 'tonnage_kg' },
      { key: 'mealCount', header: 'items_logged' },
    ]
    const escape = (v: unknown) => {
      if (v == null) return ''
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [
      cols.map((c) => c.header).join(','),
      ...data.days.map((d) => cols.map((c) => escape(d[c.key])).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `memory-os-analytics-${data.range.start}-to-${data.range.end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const num = (v: number | null, suffix = '') => (v == null ? <span className="text-muted-foreground">—</span> : `${v}${suffix}`)

  return (
    <div className="space-y-5">
      {/* ---- Coverage: what can and cannot be concluded ---- */}
      <SectionHeading
        title="How complete is your data?"
        hint="Sparsest first. Anything under about 50% is too thin to draw a conclusion from — the charts above will say so where it matters."
      />
      <Card className="p-5">
        <div className="space-y-3.5">
          {data.coverage.map((c) => (
            <div key={c.dimension}>
              <MeterRow
                label={c.dimension}
                value={c.daysWithData}
                max={data.range.days}
                caption={`${c.daysWithData}/${data.range.days} days · ${c.pct}%`}
                color={c.pct >= 70 ? VIZ.s3 : c.pct >= 40 ? VIZ.s4 : VIZ.s2}
              />
              {c.pct < 50 && <p className="mt-1 text-[11px] text-muted-foreground">{c.hint}</p>}
            </div>
          ))}
        </div>
      </Card>

      {/* ---- Meta ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Entries analysed" value={`${data.meta.entryCount}`} sub="all time" />
        <StatTile label="Days logged, all time" value={`${data.meta.allTimeDaysLogged}`} sub={data.meta.allTimeFirstDate ? `since ${data.meta.allTimeFirstDate}` : undefined} />
        <StatTile label="Range" value={`${data.range.days} days`} sub={`${data.range.start} → ${data.range.end}`} />
        <StatTile label="In-range logged" value={`${data.summary.daysLogged}`} sub={`${data.gaps.loggingRate}% of days`} />
      </div>

      {/* ---- The full day table ---- */}
      <SectionHeading title="Every day, every number">
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
        </Button>
      </SectionHeading>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={
                mode === m.key
                  ? 'rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground'
              }
            >
              {m.label}
            </button>
          ))}
          <span className="ml-auto self-center text-[11px] text-muted-foreground tabular-nums">{rows.length} rows</span>
        </div>

        <DataTable
          rows={rows}
          maxHeight={560}
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="font-medium">{r.date}</span> },
            { key: 'kcal', header: 'Intake', align: 'right', render: (r) => num(r.intakeKcal) },
            { key: 'maint', header: 'Maint.', align: 'right', render: (r) => num(r.maintenanceKcal) },
            {
              key: 'bal',
              header: 'Balance',
              align: 'right',
              render: (r) =>
                r.balanceKcal == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={r.balanceKcal > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {r.balanceKcal > 0 ? '+' : ''}
                    {r.balanceKcal}
                  </span>
                ),
            },
            { key: 'p', header: 'P', align: 'right', render: (r) => num(r.proteinG) },
            { key: 'c', header: 'C', align: 'right', render: (r) => num(r.carbsG) },
            { key: 'f', header: 'F', align: 'right', render: (r) => num(r.fatG) },
            { key: 'fib', header: 'Fib', align: 'right', render: (r) => num(r.fiberG) },
            { key: 'w', header: 'Weight', align: 'right', render: (r) => num(r.weightKg) },
            { key: 'sleep', header: 'Sleep', align: 'right', render: (r) => num(r.sleepH) },
            { key: 'mood', header: 'Mood', align: 'right', render: (r) => num(r.mood) },
            { key: 'stress', header: 'Stress', align: 'right', render: (r) => num(r.stress) },
            { key: 'rating', header: 'Day', align: 'right', render: (r) => num(r.dayRating) },
            { key: 'sets', header: 'Sets', align: 'right', render: (r) => (r.trained ? r.sets : <span className="text-muted-foreground">rest</span>) },
            { key: 'vol', header: 'Tonnage', align: 'right', render: (r) => (r.volumeKg > 0 ? r.volumeKg.toLocaleString() : <span className="text-muted-foreground">—</span>) },
            { key: 'min', header: 'Min', align: 'right', render: (r) => num(r.workoutMin) },
            { key: 'items', header: 'Items', align: 'right', render: (r) => (r.mealCount > 0 ? r.mealCount : <span className="text-muted-foreground">—</span>) },
          ]}
        />
        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          P/C/F/Fib are grams of protein, carbs, fat and fiber. Balance is intake minus maintenance — recomputed
          here rather than taken from the paste, because the source occasionally subtracts the workout burn a second
          time. Tonnage is weight × reps summed across every logged set.
        </p>
      </Card>
    </div>
  )
}

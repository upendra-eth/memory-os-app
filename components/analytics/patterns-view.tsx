'use client'

/**
 * Patterns — what moves with what.
 *
 * Correlations are computed over logged days only, and every one carries its own
 * n so a strong-looking r from six days can be read for what it is. Correlation
 * is not cause, and the copy says so rather than implying otherwise.
 */

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { CartesianGrid, Cell, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsPayload, Correlation } from '@/lib/analytics/types'
import { ChartCard, DataTable, EmptyPanel, SectionHeading, VIZ, axisProps, gridProps } from './chart-kit'
import { cn } from '@/lib/utils'

export function PatternsView({ data }: { data: AnalyticsPayload }) {
  const { correlations, weekday, gaps } = data
  const [picked, setPicked] = useState<Correlation | null>(correlations[0] ?? null)

  return (
    <div className="space-y-5">
      {correlations.length === 0 ? (
        <EmptyPanel
          title="No reliable patterns yet"
          body="Correlations need at least six days where both numbers were logged, and only relationships stronger than r = 0.35 are shown. Keep logging — this fills in on its own."
        />
      ) : (
        <>
          <SectionHeading
            title="Relationships in your own data"
            hint="Pick a row to plot it. A correlation shows two things moving together — it does not prove one caused the other."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="space-y-1.5">
                {correlations.map((c) => {
                  const active = picked?.aKey === c.aKey && picked?.bKey === c.bKey
                  return (
                    <button
                      key={`${c.aKey}-${c.bKey}`}
                      type="button"
                      onClick={() => setPicked(c)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                        active ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-secondary'
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium capitalize">
                          {c.a} <span className="text-muted-foreground">↔</span> {c.b}
                        </span>
                        <span
                          className={cn(
                            'flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                            c.r > 0
                              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                              : 'bg-red-500/10 text-red-700 dark:text-red-400'
                          )}
                        >
                          r {c.r > 0 ? '+' : ''}
                          {c.r.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {c.strength} · {c.n} days
                      </p>
                    </button>
                  )
                })}
              </div>
            </Card>

            {picked && (
              <ChartCard
                title={`${picked.a} vs ${picked.b}`}
                subtitle={picked.sentence}
                height={300}
                footnote={`${picked.n} days had both values logged. A single cluster of unusual days can create an r this size — check the shape of the cloud, not just the number.`}
              >
                <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
                  <CartesianGrid {...gridProps} vertical />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={picked.a}
                    {...axisProps}
                    label={{ value: picked.a, position: 'insideBottom', offset: -4, fontSize: 10, fill: VIZ.axis }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={picked.b}
                    {...axisProps}
                    width={48}
                    label={{ value: picked.b, angle: -90, position: 'insideLeft', fontSize: 10, fill: VIZ.axis }}
                  />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0].payload
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                          <p className="mb-1 font-medium">{p.date}</p>
                          <p className="capitalize text-muted-foreground">
                            {picked.a}: <span className="font-medium text-foreground tabular-nums">{p.x}</span>
                          </p>
                          <p className="capitalize text-muted-foreground">
                            {picked.b}: <span className="font-medium text-foreground tabular-nums">{p.y}</span>
                          </p>
                        </div>
                      )
                    }}
                  />
                  {/* 2px surface ring keeps overlapping points separable. */}
                  <Scatter data={picked.points} name="Days" fill={VIZ.s1} stroke={VIZ.surface} strokeWidth={2}>
                    {picked.points.map((p) => (
                      <Cell key={p.date} fill={VIZ.s1} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ChartCard>
            )}
          </div>
        </>
      )}

      {/* ---- Weekday table ---- */}
      <SectionHeading title="Your week, in one table" hint="Every weekday's average, so a bad day of the week is impossible to miss." />
      <Card className="p-4">
        <DataTable
          rows={weekday}
          columns={[
            { key: 'name', header: 'Day', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'days', header: 'In range', align: 'right', render: (r) => `${r.days}` },
            {
              key: 'food',
              header: 'Food logged',
              align: 'right',
              render: (r) => <span className={r.daysWithFood < 2 ? 'text-amber-600 dark:text-amber-400' : undefined}>{r.daysWithFood}</span>,
            },
            { key: 'trained', header: 'Trained', align: 'right', render: (r) => `${r.daysTrained} (${r.trainedPct}%)` },
            { key: 'intake', header: 'Avg intake', align: 'right', render: (r) => (r.avgIntake != null ? `${r.avgIntake.toLocaleString()} kcal` : '—') },
            {
              key: 'balance',
              header: 'Avg balance',
              align: 'right',
              render: (r) =>
                r.avgBalance == null ? (
                  '—'
                ) : (
                  <span className={r.avgBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {r.avgBalance > 0 ? '+' : ''}
                    {r.avgBalance}
                  </span>
                ),
            },
            { key: 'volume', header: 'Avg tonnage', align: 'right', render: (r) => (r.avgVolumeKg != null ? `${r.avgVolumeKg.toLocaleString()} kg` : '—') },
          ]}
        />
      </Card>

      {/* ---- Consistency heatmap ---- */}
      <SectionHeading
        title="Consistency"
        hint="One cell per day, most recent last. Colour shows what the day contained."
      />
      <Card className="p-5">
        <ConsistencyHeatmap cells={gaps.heatmap} />
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <Legend color="var(--viz-3)" label="Logged + trained" />
          <Legend color="var(--viz-1)" label="Logged, no training" />
          <Legend color="var(--viz-4)" label="Trained, no food logged" />
          <Legend color="var(--muted)" label="Nothing logged" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat label="Logging rate" value={`${gaps.loggingRate}%`} />
          <MiniStat label="Current streak" value={`${gaps.currentStreak} days`} />
          <MiniStat label="Longest streak" value={`${gaps.longestStreak} days`} />
          <MiniStat label="Days missed" value={`${gaps.daysMissed}`} />
        </div>
      </Card>

      {gaps.gaps.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Your longest gaps without logging</h3>
          <DataTable
            rows={gaps.gaps}
            columns={[
              { key: 'range', header: 'From → to', render: (r) => `${r.start} → ${r.end}` },
              { key: 'days', header: 'Days', align: 'right', render: (r) => `${r.days}` },
            ]}
          />
        </Card>
      )}
    </div>
  )
}

function ConsistencyHeatmap({
  cells,
}: {
  cells: { date: string; logged: boolean; trained: boolean; intake: number | null; balance: number | null }[]
}) {
  // Columns are weeks, rows are weekdays — the familiar contribution-graph layout.
  const weeks: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const color = (c: (typeof cells)[number]) => {
    if (!c.logged) return 'var(--muted)'
    if (c.trained && c.intake != null) return 'var(--viz-3)'
    if (c.trained) return 'var(--viz-4)'
    return 'var(--viz-1)'
  }

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-1">
          {week.map((c) => (
            <div
              key={c.date}
              title={`${c.date}${c.logged ? '' : ' · nothing logged'}${c.trained ? ' · trained' : ''}${c.intake != null ? ` · ${c.intake} kcal` : ''}${c.balance != null ? ` · ${c.balance > 0 ? '+' : ''}${c.balance} balance` : ''}`}
              className="h-3.5 w-3.5 flex-shrink-0 rounded-sm"
              style={{ background: color(c) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold">{value}</p>
    </div>
  )
}

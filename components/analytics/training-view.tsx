'use client'

/**
 * Training — volume, balance across muscle groups, per-lift progression, and the
 * days that were skipped.
 */

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsPayload } from '@/lib/analytics/types'
import {
  ChartCard,
  DataTable,
  EmptyPanel,
  HeroStat,
  MeterRow,
  SectionHeading,
  SwatchLegend,
  VIZ,
  VizTooltip,
  axisProps,
  fmtInt,
  fmtKcal,
  gridProps,
  tickInterval,
} from './chart-kit'
import { Trophy } from 'lucide-react'

export function TrainingView({ data }: { data: AnalyticsPayload }) {
  const { training, summary, days } = data
  const [selected, setSelected] = useState<string>(training.exercises[0]?.name ?? '')

  const exercise = useMemo(
    () => training.exercises.find((e) => e.name === selected) ?? training.exercises[0],
    [training.exercises, selected]
  )

  if (summary.daysTrained === 0) {
    return (
      <EmptyPanel
        title="No workouts in this range"
        body="Log your sets — weight × reps per set — and this tab tracks tonnage, per-muscle volume, estimated 1RM progression per lift, and which days you skipped."
      />
    )
  }

  // Per-day training load, for the density view.
  const loadRows = days.map((d) => ({
    date: d.date,
    label: d.label,
    volumeKg: d.trained ? d.volumeKg : null,
    sets: d.trained ? d.sets : null,
    minutes: d.workoutMin,
  }))

  return (
    <div className="space-y-5">
      {/* ---- Headline ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroStat
          label="Sessions"
          value={`${summary.daysTrained}`}
          note={
            summary.trainingPerWeek != null
              ? `${summary.trainingPerWeek.toFixed(1)}/wk across all ${summary.days} days${summary.trainingPerWeekLogged != null && summary.trainingPerWeekLogged !== summary.trainingPerWeek ? ` · ${summary.trainingPerWeekLogged.toFixed(1)}/wk counting only the ${summary.daysLogged} you logged` : ''}`
              : undefined
          }
          tone={summary.trainingPerWeek == null ? 'neutral' : summary.trainingPerWeek >= 3.5 ? 'good' : summary.trainingPerWeek >= 2 ? 'warn' : 'bad'}
        />
        <HeroStat label="Total tonnage" value={fmtInt(summary.totalVolumeKg)} unit="kg" note={`${summary.totalSets} sets logged`} />
        <HeroStat
          label="Longest gap"
          value={`${training.longestGapDays}`}
          unit="days"
          note={training.currentGapDays > 0 ? `${training.currentGapDays} days since your last session` : 'Trained on the most recent day in range'}
          tone={training.longestGapDays >= 7 ? 'warn' : 'neutral'}
        />
        <HeroStat
          label="Avg session"
          value={training.avgSessionMin != null ? `${training.avgSessionMin}` : '—'}
          unit="min"
          note={training.totalCardioMin > 0 ? `+ ${training.totalCardioMin} min cardio, ${training.totalCardioKm} km` : 'No cardio logged'}
        />
      </div>

      {/* ---- Weekly volume ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Weekly tonnage"
          subtitle="Total kilograms moved each week (weight × reps, every set)"
          height={250}
          footnote="Tonnage is the cleanest single measure of how much work you did. Progressive overload shows up here before it shows up on the scale."
        >
          <ComposedChart data={training.weekly} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(training.weekly.length)} />
            <YAxis {...axisProps} width={54} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}t`} />
            <Tooltip
              content={
                <VizTooltip
                  unit=" kg"
                  extra={(d) => (d ? [{ label: 'Sessions', value: `${d.sessions}` }, { label: 'Sets', value: `${d.sets}` }] : [])}
                />
              }
            />
            <Bar dataKey="volumeKg" name="Tonnage" fill={VIZ.s1} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </ComposedChart>
        </ChartCard>

        <ChartCard
          title="Sessions and sets per week"
          subtitle="Frequency next to workload"
          height={250}
        >
          <ComposedChart data={training.weekly} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(training.weekly.length)} />
            <YAxis {...axisProps} width={40} allowDecimals={false} />
            <Tooltip content={<VizTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <Bar dataKey="sets" name="Sets" fill={VIZ.s3} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Line type="monotone" dataKey="sessions" name="Sessions" stroke={VIZ.s2} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ChartCard>
      </div>

      {/* ---- Muscle balance ---- */}
      <SectionHeading title="Are you training everything?" hint="Roughly 10 hard sets per muscle per week is the working minimum for growth." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sets per week by muscle group"
          subtitle="Muscle tags are folded into groups — a set counts once per group it trains"
          height={Math.max(220, training.muscles.length * 32 + 40)}
          footnote="Under 4 sets a week is maintenance at best; 10+ is a growth stimulus."
          action={<SwatchLegend items={[{ color: VIZ.s3, label: '10+ sets/wk' }, { color: VIZ.s4, label: '4–10' }, { color: VIZ.s2, label: 'under 4' }]} />}
        >
          <BarChart data={training.muscles} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 0 }}>
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} hide />
            <YAxis type="category" dataKey="group" {...axisProps} width={82} />
            <Tooltip
              content={
                <VizTooltip
                  extra={(d) =>
                    d ? [{ label: 'Total sets', value: `${d.sets}` }, { label: 'Sessions', value: `${d.sessions}` }, { label: 'Share', value: `${d.share}%` }] : []
                  }
                />
              }
            />
            <Bar
              dataKey="setsPerWeek"
              name="Sets/week"
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              label={{ position: 'right', fontSize: 10, fill: VIZ.axis, formatter: (v: number) => `${v}/wk` }}
            >
              {training.muscles.map((m) => (
                <Cell key={m.group} fill={m.setsPerWeek >= 10 ? VIZ.s3 : m.setsPerWeek >= 4 ? VIZ.s4 : VIZ.s2} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <Card className="p-5">
          <h3 className="text-sm font-semibold">Balance ratios</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Both should sit near 1.0. Persistent imbalance is how posture problems and shoulder pain start.
          </p>
          <div className="mt-5 space-y-5">
            <div>
              <MeterRow
                label="Push vs pull"
                value={Math.min(2, training.pushPullRatio ?? 0)}
                max={2}
                caption={training.pushPullRatio != null ? `${training.pushPullRatio.toFixed(2)} : 1` : 'no data'}
                color={
                  training.pushPullRatio == null
                    ? VIZ.s1
                    : training.pushPullRatio > 1.4 || training.pushPullRatio < 0.7
                      ? VIZ.s2
                      : VIZ.s3
                }
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {training.pushPullRatio == null
                  ? 'Needs muscle tags on your logged workouts.'
                  : training.pushPullRatio > 1.4
                    ? 'Push-dominant. Add rows or face pulls.'
                    : training.pushPullRatio < 0.7
                      ? 'Pull-dominant. Add a pressing movement.'
                      : 'Balanced.'}
              </p>
            </div>
            <div>
              <MeterRow
                label="Upper vs lower"
                value={Math.min(4, training.upperLowerRatio ?? 0)}
                max={4}
                caption={training.upperLowerRatio != null ? `${training.upperLowerRatio.toFixed(2)} : 1` : 'no data'}
                color={training.upperLowerRatio == null ? VIZ.s1 : training.upperLowerRatio > 2.5 ? VIZ.s2 : VIZ.s3}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {training.upperLowerRatio == null
                  ? 'Needs muscle tags on your logged workouts.'
                  : training.upperLowerRatio > 2.5
                    ? 'Legs are well behind your upper body — legs are also where the largest muscles (and the biggest metabolic payoff) live.'
                    : 'Reasonably balanced across the body.'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ---- Per-exercise progression ---- */}
      <SectionHeading title="Lift by lift" hint="Estimated 1RM uses the Epley formula on your heaviest logged set." />
      <ChartCard
        title={exercise ? `${exercise.name} — load progression` : 'Load progression'}
        subtitle={
          exercise
            ? `${exercise.sessions} sessions · ${exercise.sets} sets · best estimated 1RM ${exercise.bestE1RM ?? '—'} kg${exercise.progressPct != null ? ` · ${exercise.progressPct > 0 ? '+' : ''}${exercise.progressPct}% over the range` : ''}`
            : undefined
        }
        height={260}
        action={
          <Select value={exercise?.name ?? ''} onValueChange={setSelected}>
            <SelectTrigger className="h-8 w-[190px] text-xs">
              <SelectValue placeholder="Pick an exercise" />
            </SelectTrigger>
            <SelectContent>
              {training.exercises.map((e) => (
                <SelectItem key={e.name} value={e.name} className="text-xs">
                  {e.name} ({e.sessions})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        footnote="Both series are kilograms on one axis: the top set you actually lifted, and what that set implies for a single max-effort rep."
      >
        <ComposedChart data={exercise?.history ?? []} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval={tickInterval(exercise?.history.length ?? 0)} />
          <YAxis {...axisProps} width={44} unit=" kg" />
          <Tooltip
            content={
              <VizTooltip
                unit=" kg"
                extra={(d) => (d ? [{ label: 'Sets', value: `${d.sets}` }, { label: 'Tonnage', value: `${d.volumeKg.toLocaleString()} kg` }] : [])}
              />
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          <Line type="monotone" dataKey="topWeightKg" name="Top set" stroke={VIZ.s1} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="e1rm" name="Est. 1RM" stroke={VIZ.s2} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ChartCard>

      {/* ---- PRs & stalls ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-amber-500" /> Personal bests in this range
          </h3>
          <DataTable
            rows={training.prs}
            empty="No loaded sets logged yet."
            columns={[
              { key: 'name', header: 'Lift', render: (r) => <span className="font-medium">{r.name}</span> },
              { key: 'set', header: 'Best set', align: 'right', render: (r) => `${r.weightKg} kg × ${r.reps}` },
              { key: 'e1rm', header: 'Est. 1RM', align: 'right', render: (r) => `${r.e1rm} kg` },
              { key: 'date', header: 'When', align: 'right', render: (r) => r.label },
            ]}
          />
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Lifts that have stopped moving</h3>
          {training.stalled.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing stalled — every lift with enough history is trending.
            </p>
          ) : (
            <DataTable
              rows={training.stalled}
              columns={[
                { key: 'name', header: 'Lift', render: (r) => <span className="font-medium">{r.name}</span> },
                { key: 'sessions', header: 'Sessions', align: 'right', render: (r) => `${r.sessions}` },
                { key: 'top', header: 'Top weight', align: 'right', render: (r) => (r.topWeightKg != null ? `${r.topWeightKg} kg` : '—') },
                {
                  key: 'progress',
                  header: 'Change',
                  align: 'right',
                  render: (r) => (
                    <Badge variant="secondary" className="text-[10px]">
                      {r.progressPct != null ? `${r.progressPct > 0 ? '+' : ''}${r.progressPct}%` : 'flat'}
                    </Badge>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </div>

      {/* ---- Daily load ---- */}
      <ChartCard
        title="Training load, day by day"
        subtitle="Gaps are days you did not train"
        height={230}
      >
        <BarChart data={loadRows} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval={tickInterval(loadRows.length)} />
          <YAxis {...axisProps} width={54} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}t`} />
          <Tooltip
            content={
              <VizTooltip
                unit=" kg"
                extra={(d) => (d ? [{ label: 'Sets', value: d.sets != null ? `${d.sets}` : '—' }, { label: 'Minutes', value: d.minutes != null ? `${d.minutes}` : '—' }] : [])}
              />
            }
          />
          <Bar dataKey="volumeKg" name="Tonnage" fill={VIZ.s1} radius={[3, 3, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ChartCard>

      {/* ---- All exercises table ---- */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Every exercise you have logged</h3>
        <DataTable
          rows={training.exercises}
          columns={[
            { key: 'name', header: 'Exercise', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'sessions', header: 'Sessions', align: 'right', render: (r) => `${r.sessions}` },
            { key: 'sets', header: 'Sets', align: 'right', render: (r) => `${r.sets}` },
            { key: 'top', header: 'Top weight', align: 'right', render: (r) => (r.topWeightKg != null ? `${r.topWeightKg} kg` : '—') },
            { key: 'e1rm', header: 'Best 1RM', align: 'right', render: (r) => (r.bestE1RM != null ? `${r.bestE1RM} kg` : '—') },
            { key: 'volume', header: 'Tonnage', align: 'right', render: (r) => `${r.totalVolumeKg.toLocaleString()} kg` },
            {
              key: 'status',
              header: 'Trend',
              align: 'right',
              render: (r) => (
                <span
                  className={
                    r.status === 'progressing'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : r.status === 'regressing'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground'
                  }
                >
                  {r.status}
                  {r.progressPct != null ? ` ${r.progressPct > 0 ? '+' : ''}${r.progressPct}%` : ''}
                </span>
              ),
            },
          ]}
        />
      </Card>

      {/* ---- Missed days ---- */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Days you did not train</h3>
        <p className="mt-1 mb-3 text-xs text-muted-foreground leading-relaxed">
          Rest is part of training — a rest day is only a problem when the eating does not change with it. Days
          highlighted in red ended above maintenance anyway.
        </p>
        <DataTable
          rows={training.missedDays}
          empty="You trained every day in this range."
          columns={[
            { key: 'date', header: 'Date', render: (r) => `${r.label} · ${r.weekday}` },
            { key: 'intake', header: 'Eaten', align: 'right', render: (r) => (r.logged ? fmtKcal(r.intake) : <span className="text-muted-foreground">not logged</span>) },
            {
              key: 'balance',
              header: 'Balance',
              align: 'right',
              render: (r) =>
                r.balance == null ? (
                  '—'
                ) : (
                  <span className={r.balance > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {r.balance > 0 ? '+' : ''}
                    {Math.round(r.balance).toLocaleString()}
                  </span>
                ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

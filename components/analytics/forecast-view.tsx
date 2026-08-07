'use client'

/**
 * Forecast — where the numbers are going, in charts and in words.
 *
 * Two deliberate choices here. Projections are drawn dashed inside a shaded
 * prediction band, so a guess never looks like a measurement. And every
 * projection is restated in prose underneath, because "83.4 kg on 3 Nov" means
 * nothing without the assumption it rests on.
 */

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
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
  StatTile,
  SwatchLegend,
  VIZ,
  VizTooltip,
  axisProps,
  gridProps,
  tickInterval,
} from './chart-kit'
import { cn } from '@/lib/utils'
import { CheckCircle2, CircleDashed, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'

export function ForecastView({ data }: { data: AnalyticsPayload }) {
  const { forecast, profile, summary } = data
  const { weight, composition, lifts, mind, scenarios, narrative, dataQuality } = forecast
  const [liftName, setLiftName] = useState(lifts[0]?.name ?? '')
  const lift = lifts.find((l) => l.name === liftName) ?? lifts[0]

  if (!weight && !composition && lifts.length === 0 && mind.metrics.length === 0) {
    return (
      <EmptyPanel
        title="Not enough history to forecast anything yet"
        body="Projections need a trend to extrapolate: four or more weigh-ins spread over a fortnight, or three weeks of food logging. Nothing here is guessed from less than that — keep logging and this tab fills in."
      />
    )
  }

  const wantsLoss =
    profile.nutritionGoal === 'lose_weight' ||
    (profile.targetWeightKg != null && profile.weightKg != null && profile.targetWeightKg < profile.weightKg)

  const twelve = weight?.projections[weight.projections.length - 1]
  const comp12 = composition?.projections[composition.projections.length - 1]

  return (
    <div className="space-y-5">
      {/* ---- Headline projections ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroStat
          label="Weight in 12 weeks"
          value={twelve ? twelve.value.toFixed(1) : '—'
          }
          unit={twelve ? 'kg' : undefined}
          tone={
            twelve == null || weight == null
              ? 'neutral'
              : Math.abs(weight.ratePerWeek) < 0.02
                ? 'neutral'
                : wantsLoss === weight.ratePerWeek < 0
                  ? 'good'
                  : 'bad'
          }
          note={twelve ? `${twelve.low.toFixed(1)}–${twelve.high.toFixed(1)} kg range · ${twelve.dateLabel}` : 'Needs 4+ weigh-ins over 2 weeks'}
        />
        <HeroStat
          label="Body fat then"
          value={comp12 ? comp12.bodyFatPct.toFixed(0) : '—'}
          unit={comp12 ? '%' : undefined}
          note={
            composition
              ? `From about ${composition.now.bodyFatPct.toFixed(0)}% now · BMI-based estimate, ±4 points`
              : 'Needs weight, height, age and sex in your profile'
          }
        />
        <HeroStat
          label="Muscle change"
          value={comp12 ? `${comp12.leanChangeKg >= 0 ? '+' : ''}${comp12.leanChangeKg.toFixed(1)}` : '—'}
          unit={comp12 ? 'kg' : undefined}
          tone={comp12 == null ? 'neutral' : comp12.leanChangeKg > 0.1 ? 'good' : comp12.leanChangeKg < -0.1 ? 'bad' : 'neutral'}
          note={
            composition
              ? `${Math.round(composition.leanShare * 100)}% of the projected change is lean tissue`
              : undefined
          }
        />
        <HeroStat
          label="Fat change"
          value={comp12 ? `${comp12.fatChangeKg >= 0 ? '+' : ''}${comp12.fatChangeKg.toFixed(1)}` : '—'}
          unit={comp12 ? 'kg' : undefined}
          tone={comp12 == null ? 'neutral' : comp12.fatChangeKg < -0.1 ? 'good' : comp12.fatChangeKg > 0.1 ? 'bad' : 'neutral'}
          note={comp12 ? `${comp12.fatMassKg.toFixed(1)} kg of fat mass at 12 weeks` : undefined}
        />
      </div>

      {/* Identical weigh-ins would otherwise be reported as a confident flat trend. */}
      {weight?.flatlineWarning && (
        <Card className="flex items-start gap-3 border-l-4 border-amber-500/50 p-4">
          <CircleDashed className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium">Your weight readings are all identical</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{weight.flatlineWarning}</p>
          </div>
        </Card>
      )}

      {/* ---- Weight projection ---- */}
      {weight && (
        <>
          <ChartCard
            title="Weight projection"
            subtitle="Solid is measured, dashed is projected, the shaded band is the ~95% prediction range"
            height={320}
            action={
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {weight.method === 'scale-trend' ? 'from the scale' : 'from your food log'}
                </Badge>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px]',
                    weight.confidence === 'high'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : weight.confidence === 'medium'
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'bg-red-500/10 text-red-700 dark:text-red-400'
                  )}
                >
                  {weight.confidence} confidence
                </Badge>
              </div>
            }
            footnote={`The band widens the further out it goes, which is honest: a 4-week projection is far firmer than a 12-week one. ${weight.r2 != null ? `The trend line explains ${Math.round(weight.r2 * 100)}% of the variation in your ${weight.observations} weigh-ins.` : ''}`}
          >
            <ComposedChart data={weight.series} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval={tickInterval(weight.series.length)} />
              <YAxis
                {...axisProps}
                width={46}
                domain={['dataMin - 1', 'dataMax + 1']}
                tickFormatter={(v) => Number(v).toFixed(1)}
              />
              <Tooltip content={<VizTooltip unit=" kg" dp={1} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
              {profile.targetWeightKg != null && (
                <ReferenceLine
                  y={profile.targetWeightKg}
                  stroke={VIZ.s3}
                  strokeWidth={1.5}
                  label={{ value: `target ${profile.targetWeightKg} kg`, position: 'insideBottomRight', fontSize: 10, fill: VIZ.axis }}
                />
              )}
              {/* Band drawn as two stacked areas: transparent up to `low`, then
                  the visible span up to `high`. */}
              <Area dataKey="low" stackId="band" stroke="none" fill="transparent" legendType="none" name="" />
              <Area
                dataKey={(d: any) => (d.high != null && d.low != null ? d.high - d.low : null)}
                stackId="band"
                stroke="none"
                fill={VIZ.s2}
                fillOpacity={0.14}
                name="Prediction range"
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Weigh-in"
                stroke={VIZ.s1}
                strokeWidth={0}
                dot={{ r: 3, fill: VIZ.s1, stroke: VIZ.surface, strokeWidth: 2 }}
                connectNulls={false}
                legendType="circle"
              />
              <Line type="monotone" dataKey="fitted" name="Trend" stroke={VIZ.s1} strokeWidth={2} dot={false} connectNulls />
              <Line
                type="monotone"
                dataKey="projected"
                name="Projected"
                stroke={VIZ.s2}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ChartCard>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {weight.projections.map((p) => (
              <Card key={p.horizonDays} className="p-4">
                <p className="text-xs text-muted-foreground">In {p.horizonLabel} · {p.dateLabel}</p>
                <p className="mt-1 text-2xl font-bold">
                  {p.value.toFixed(1)} <span className="text-sm font-medium text-muted-foreground">kg</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                  range {p.low.toFixed(1)} – {p.high.toFixed(1)} kg
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ---- Composition projection ---- */}
      {composition && (
        <>
          <SectionHeading
            title="Muscle and fat, projected"
            hint="Where the projected weight change actually goes — an estimate, not a measurement."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Fat mass vs lean mass"
              subtitle="Now and at each horizon, in kilograms"
              height={280}
              footnote={composition.caveat}
            >
              <BarChart data={composition.series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={44} unit=" kg" />
                <Tooltip
                  content={
                    <VizTooltip
                      unit=" kg"
                      dp={1}
                      extra={(d) => (d?.projected ? [{ label: 'Status', value: 'projected' }] : [{ label: 'Status', value: 'estimated now' }])}
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                {/* 2px surface stroke gives the stacked segments a visible gap. */}
                <Bar dataKey="lean" stackId="c" name="Lean mass" fill={VIZ.s3} stroke={VIZ.surface} strokeWidth={2} maxBarSize={54} />
                <Bar dataKey="fat" stackId="c" name="Fat mass" fill={VIZ.s2} stroke={VIZ.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={54} />
              </BarChart>
            </ChartCard>

            <Card className="p-5">
              <h3 className="text-sm font-semibold">How the change splits</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{composition.leanShareReason}</p>

              <div className="mt-4 space-y-3">
                <MeterRow
                  label="Lean share of the change"
                  value={Math.round(composition.leanShare * 100)}
                  max={100}
                  caption={`${Math.round(composition.leanShare * 100)}% lean / ${100 - Math.round(composition.leanShare * 100)}% fat`}
                  color={VIZ.s3}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatTile label="Body fat now" value={`${composition.now.bodyFatPct.toFixed(0)}%`} sub={`${composition.now.fatMassKg.toFixed(1)} kg fat`} />
                <StatTile label="Lean mass now" value={`${composition.now.leanMassKg.toFixed(1)} kg`} sub="muscle, bone, organs, water" />
              </div>

              {composition.muscleCeilingKgPerMonth && (
                <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Reality check: </span>
                  a natural lifter at {composition.now.weightKg.toFixed(0)} kg can build roughly{' '}
                  {composition.muscleCeilingKgPerMonth.low}–{composition.muscleCeilingKgPerMonth.high} kg of muscle a
                  month at best.{' '}
                  {composition.leanVsCeiling === 'above-ceiling'
                    ? 'The projection above exceeds that, so part of what it calls lean mass is water and glycogen.'
                    : composition.leanVsCeiling === 'within'
                      ? 'The projection sits inside that ceiling, so it is achievable.'
                      : composition.leanVsCeiling === 'losing'
                        ? 'The projection has you losing lean mass — protein and training frequency are what flip that.'
                        : 'The projection has lean mass roughly flat.'}
                </p>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Composition at each horizon</h3>
            <DataTable
              rows={composition.projections}
              columns={[
                { key: 'h', header: 'When', render: (r) => `${r.horizonLabel} (${r.dateLabel})` },
                { key: 'w', header: 'Weight', align: 'right', render: (r) => `${r.weightKg.toFixed(1)} kg` },
                { key: 'bf', header: 'Body fat', align: 'right', render: (r) => `${r.bodyFatPct.toFixed(1)}%` },
                { key: 'fat', header: 'Fat mass', align: 'right', render: (r) => `${r.fatMassKg.toFixed(1)} kg` },
                { key: 'lean', header: 'Lean mass', align: 'right', render: (r) => `${r.leanMassKg.toFixed(1)} kg` },
                {
                  key: 'dfat',
                  header: 'Δ fat',
                  align: 'right',
                  render: (r) => (
                    <span className={r.fatChangeKg > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                      {r.fatChangeKg >= 0 ? '+' : ''}
                      {r.fatChangeKg.toFixed(2)}
                    </span>
                  ),
                },
                {
                  key: 'dlean',
                  header: 'Δ lean',
                  align: 'right',
                  render: (r) => (
                    <span className={r.leanChangeKg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                      {r.leanChangeKg >= 0 ? '+' : ''}
                      {r.leanChangeKg.toFixed(2)}
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      {/* ---- Strength projection ---- */}
      {lifts.length > 0 && lift && (
        <>
          <SectionHeading title="Strength projection" hint="Only lifts with four or more sessions over three weeks are projected." />
          <ChartCard
            title={`${lift.name} — estimated 1RM`}
            subtitle={`${lift.currentE1RM} kg now, moving ${lift.ratePerWeek > 0 ? '+' : ''}${lift.ratePerWeek} kg a week across ${lift.sessions} sessions (r² ${lift.r2})`}
            height={250}
            action={
              <Select value={lift.name} onValueChange={setLiftName}>
                <SelectTrigger className="h-8 w-[190px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lifts.map((l) => (
                    <SelectItem key={l.name} value={l.name} className="text-xs">
                      {l.name} ({l.ratePerWeek > 0 ? '+' : ''}
                      {l.ratePerWeek} kg/wk{l.reliability === 'noisy' ? ', scattered' : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            footnote={
              lift.reliability === 'noisy'
                ? `${lift.name} is progressing, but its sessions vary enough that the 12-week range is ${lift.projected.low}–${lift.projected.high} kg — wider than the projection itself, so treat it as a direction only.`
                : "Load progression is a staircase, not a ramp — every lift plateaus eventually. Read this as 'if the current run continues'."
            }
          >
            <BarChart
              data={[
                { name: 'Now', value: lift.currentE1RM },
                { name: `In ${lift.projected.horizonLabel}`, value: lift.projected.value },
              ]}
              margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} width={44} unit=" kg" domain={[0, 'dataMax + 10']} />
              <Tooltip content={<VizTooltip unit=" kg" />} />
              <Bar dataKey="value" name="Est. 1RM" radius={[4, 4, 0, 0]} maxBarSize={72} label={{ position: 'top', fontSize: 11, fill: VIZ.axis }}>
                <Cell fill={VIZ.s1} />
                <Cell fill={VIZ.s2} />
              </Bar>
            </BarChart>
          </ChartCard>

          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Every lift with a measurable trend</h3>
            <DataTable
              rows={lifts}
              columns={[
                { key: 'name', header: 'Lift', render: (r) => <span className="font-medium">{r.name}</span> },
                { key: 'now', header: 'Est. 1RM now', align: 'right', render: (r) => `${r.currentE1RM} kg` },
                {
                  key: 'rate',
                  header: 'Per week',
                  align: 'right',
                  render: (r) => (
                    <span className={r.ratePerWeek > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                      {r.ratePerWeek > 0 ? '+' : ''}
                      {r.ratePerWeek} kg
                    </span>
                  ),
                },
                {
                  key: 'proj',
                  header: 'In 12 weeks',
                  align: 'right',
                  render: (r) =>
                    r.reliability === 'noisy' ? (
                      <span className="text-muted-foreground">too scattered</span>
                    ) : (
                      `${r.projected.value} kg`
                    ),
                },
                { key: 'range', header: 'Range', align: 'right', render: (r) => `${r.projected.low}–${r.projected.high} kg` },
                { key: 'n', header: 'Sessions', align: 'right', render: (r) => `${r.sessions}` },
              ]}
            />
          </Card>
        </>
      )}

      {/* ---- Mind projection ---- */}
      {mind.metrics.length > 0 && (
        <>
          <SectionHeading title="Mood and mental health, projected" hint="Self-reported, on the days you chose to log — the softest predictions on this page." />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Where each measure lands in 30 days"
              subtitle="Now vs projected, all on the same 1–10 scale"
              height={260}
              action={<SwatchLegend items={[{ color: VIZ.s1, label: 'Now' }, { color: VIZ.s2, label: 'In 30 days' }]} />}
            >
              <BarChart
                data={mind.metrics.map((m) => ({ name: m.label, now: m.current, then: m.projected30d }))}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                barGap={2}
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} angle={-30} textAnchor="end" height={58} interval={0} />
                <YAxis {...axisProps} width={34} domain={[0, 10]} />
                <Tooltip content={<VizTooltip dp={1} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar dataKey="now" name="Now" fill={VIZ.s1} radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="then" name="In 30 days" fill={VIZ.s2} radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ChartCard>

            <Card className="p-5">
              <h3 className="text-sm font-semibold">Direction of travel</h3>
              <div className="mt-3 space-y-2.5">
                {mind.metrics.map((m) => {
                  const Icon = m.direction === 'flat' ? CircleDashed : m.ratePerWeek > 0 ? TrendingUp : TrendingDown
                  const good = m.direction === 'improving'
                  return (
                    <div key={m.key} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
                      <span className="flex items-center gap-2 text-sm">
                        <Icon
                          className={cn(
                            'h-3.5 w-3.5 flex-shrink-0',
                            m.direction === 'flat'
                              ? 'text-muted-foreground'
                              : good
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                          )}
                        />
                        {m.label}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {m.current.toFixed(1)} → <span className="font-semibold text-foreground">{m.projected30d.toFixed(1)}</span>
                        <span className="ml-1.5 text-[10px] uppercase">{m.direction}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
              {mind.drivers.length > 0 && (
                <>
                  <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    What moves them
                  </h4>
                  <ul className="mt-2 space-y-1.5">
                    {mind.drivers.map((d) => (
                      <li key={`${d.metric}-${d.driver}`} className="text-xs text-muted-foreground leading-relaxed">
                        {d.sentence}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>
        </>
      )}

      {/* ---- Scenarios ---- */}
      {scenarios.length > 0 && (
        <>
          <SectionHeading
            title="What would change it"
            hint="Each scenario is priced from your own averages, then run forward 12 weeks."
          />
          <ChartCard
            title="Weight in 12 weeks under each scenario"
            subtitle="Same units, one axis — directly comparable"
            height={Math.max(200, scenarios.length * 46 + 40)}
            footnote="Scenarios assume the change is the only thing that changes, and that you hold it for the full 12 weeks."
          >
            <BarChart
              data={scenarios.filter((s) => s.weightIn12WeeksKg != null)}
              layout="vertical"
              margin={{ top: 4, right: 56, left: 4, bottom: 0 }}
            >
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...axisProps} domain={['dataMin - 1', 'dataMax + 1']} hide />
              <YAxis type="category" dataKey="title" {...axisProps} width={150} tick={{ fontSize: 10, fill: VIZ.axis }} />
              <Tooltip
                content={
                  <VizTooltip
                    unit=" kg"
                    dp={1}
                    extra={(d) =>
                      d
                        ? [
                            { label: 'Daily balance', value: d.newDailyBalanceKcal != null ? `${d.newDailyBalanceKcal > 0 ? '+' : ''}${d.newDailyBalanceKcal} kcal` : '—' },
                            { label: 'vs doing nothing', value: d.deltaVsNothingKg != null ? `${d.deltaVsNothingKg > 0 ? '+' : ''}${d.deltaVsNothingKg} kg` : '—' },
                          ]
                        : []
                    }
                  />
                }
              />
              <Bar
                dataKey="weightIn12WeeksKg"
                name="Projected weight"
                radius={[0, 4, 4, 0]}
                maxBarSize={22}
                label={{ position: 'right', fontSize: 10, fill: VIZ.axis, formatter: (v: number) => `${v.toFixed(1)} kg` }}
              >
                {scenarios
                  .filter((s) => s.weightIn12WeeksKg != null)
                  .map((s) => (
                    <Cell key={s.id} fill={s.id === 'baseline' ? VIZ.s4 : (s.deltaVsNothingKg ?? 0) < 0 === wantsLoss ? VIZ.s3 : VIZ.s1} />
                  ))}
              </Bar>
            </BarChart>
          </ChartCard>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {scenarios.map((s) => (
              <Card key={s.id} className={cn('p-4', s.id === 'baseline' && 'border-dashed')}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-snug">{s.title}</h3>
                  {s.deltaVsNothingKg != null && s.id !== 'baseline' && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'flex-shrink-0 text-[10px] tabular-nums',
                        (s.deltaVsNothingKg < 0) === wantsLoss
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      )}
                    >
                      {s.deltaVsNothingKg > 0 ? '+' : ''}
                      {s.deltaVsNothingKg} kg vs nothing
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{s.change}</p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.sentence}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ---- The predictions in words ---- */}
      <SectionHeading title="All of it, in words" hint="Every projection above, written out with the assumption it rests on." />
      <div className="space-y-3">
        {narrative.map((section) => (
          <Card key={section.heading} className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {section.heading}
            </h3>
            <div className="mt-2.5 space-y-2.5">
              {section.body.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* ---- What would sharpen the forecast ---- */}
      <SectionHeading title="What would make these predictions better" />
      <Card className="p-5">
        <div className="space-y-3">
          {dataQuality.map((q) => (
            <div key={q.label}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  {q.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  )}
                  {q.label}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {q.have} / {q.need}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, q.need > 0 ? (q.have / q.need) * 100 : 0)}%`,
                    background: q.ok ? VIZ.s3 : VIZ.s4,
                  }}
                />
              </div>
              {!q.ok && <p className="mt-1 text-[11px] text-muted-foreground">{q.note}</p>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
          Nothing on this tab is generated by an AI model — every number is a regression or an energy-balance
          calculation over your own {summary.daysLogged} logged days, and every sentence is assembled from those
          numbers.
        </p>
      </Card>
    </div>
  )
}

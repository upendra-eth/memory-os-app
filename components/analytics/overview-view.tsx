'use client'

/**
 * Overview — the answer first, the evidence underneath.
 *
 * The top of this tab is deliberately not a chart: the reader's question is
 * "what is happening to me and why", which is a sentence and four numbers. The
 * charts below exist to let them check that sentence against the data.
 */

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsPayload } from '@/lib/analytics/types'
import {
  ChartCard,
  FindingCard,
  HeroStat,
  SectionHeading,
  StatTile,
  SwatchLegend,
  VIZ,
  VizTooltip,
  axisProps,
  fmtInt,
  fmtKcal,
  gridProps,
  tickInterval,
} from './chart-kit'
import { ArrowRight, Dumbbell, Flame, Moon, Scale, Utensils } from 'lucide-react'

export function OverviewView({ data, onJump }: { data: AnalyticsPayload; onJump: (tab: string) => void }) {
  const { summary, previous, weight, energy, dayType, weekly, profile } = data

  const rate = weight.rateKgPerWeek
  const direction = rate == null ? 'flat' : rate > 0.05 ? 'up' : rate < -0.05 ? 'down' : 'flat'
  const wantsLoss =
    profile.nutritionGoal === 'lose_weight' ||
    (profile.targetWeightKg != null && profile.weightKg != null && profile.targetWeightKg < profile.weightKg)
  const goingRightWay = direction === 'flat' ? null : wantsLoss ? direction === 'down' : direction === 'up'

  const topFindings = data.findings.filter((f) => f.severity !== 'good').slice(0, 3)

  // Daily energy rows, trimmed to days that carry a number so a sparse range
  // doesn't render as a field of gaps.
  const energyRows = energy.series

  return (
    <div className="space-y-5">
      {/* ---- THE VERDICT ---- */}
      <Card className="p-5 md:p-6 bg-gradient-to-br from-primary/8 to-accent/8 border-primary/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">The bottom line</p>
        <p className="mt-2 text-lg md:text-xl font-semibold leading-snug text-balance">
          {verdictSentence(data)}
        </p>
        <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">{verdictDetail(data)}</p>
        {topFindings.length > 0 && (
          <Button variant="outline" size="sm" className="mt-4" onClick={() => onJump('why')}>
            See all {data.findings.length} findings
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}
      </Card>

      {/* ---- HERO NUMBERS ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroStat
          label="Weight trend"
          value={rate == null ? '—' : `${rate > 0 ? '+' : ''}${rate.toFixed(2)}`}
          unit={rate == null ? undefined : 'kg/wk'}
          tone={goingRightWay == null ? 'neutral' : goingRightWay ? 'good' : 'bad'}
          note={
            weight.observations < 3
              ? `Needs ≥3 weigh-ins — you have ${weight.observations}`
              : weight.fittedChangeKg != null
                ? `${weight.fittedChangeKg > 0 ? '+' : ''}${weight.fittedChangeKg.toFixed(1)} kg across the range`
                : undefined
          }
        />
        <HeroStat
          label="Your real maintenance"
          value={weight.trueMaintenanceKcal != null ? weight.trueMaintenanceKcal.toLocaleString() : '—'}
          unit={weight.trueMaintenanceKcal != null ? 'kcal' : undefined}
          note={
            weight.maintenanceGapKcal != null
              ? `${Math.abs(weight.maintenanceGapKcal)} kcal ${weight.maintenanceGapKcal > 0 ? 'above' : 'below'} the formula's ${weight.assumedMaintenanceKcal?.toLocaleString()}`
              : 'Log weight + food for ~2 weeks to unlock'
          }
        />
        <HeroStat
          label="Avg intake"
          value={summary.avgIntakeKcal != null ? summary.avgIntakeKcal.toLocaleString() : '—'}
          unit={summary.avgIntakeKcal != null ? 'kcal' : undefined}
          note={
            summary.avgBalanceKcal != null
              ? `${summary.avgBalanceKcal > 0 ? '+' : ''}${summary.avgBalanceKcal} kcal/day vs maintenance`
              : undefined
          }
        />
        <HeroStat
          label="Training"
          value={summary.trainingPerWeek != null ? summary.trainingPerWeek.toFixed(1) : '—'}
          unit="× / week"
          tone={
            summary.trainingPerWeek == null ? 'neutral' : summary.trainingPerWeek >= 3.5 ? 'good' : summary.trainingPerWeek >= 2 ? 'warn' : 'bad'
          }
          note={
            summary.trainingPerWeekLogged != null && summary.trainingPerWeekLogged !== summary.trainingPerWeek
              ? `${summary.daysTrained} sessions · ${summary.trainingPerWeekLogged.toFixed(1)}×/wk counting only logged days`
              : `${summary.daysTrained} sessions · ${fmtInt(summary.totalVolumeKg)} kg moved`
          }
        />
      </div>

      {/* ---- PERIOD STRIP with period-over-period deltas ---- */}
      <SectionHeading
        title="This period vs the one before"
        hint={previous ? 'Arrows compare against the same number of days immediately before this range.' : 'No earlier period to compare against yet.'}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Days logged"
          value={`${summary.daysLogged}/${summary.days}`}
          delta={previous ? summary.daysLogged - previous.daysLogged : null}
          deltaGoodDirection="up"
        />
        <StatTile
          label="Avg calories"
          value={fmtInt(summary.avgIntakeKcal)}
          icon={<Flame className="h-3.5 w-3.5" />}
          delta={previous && summary.avgIntakeKcal != null && previous.avgIntakeKcal != null ? summary.avgIntakeKcal - previous.avgIntakeKcal : null}
          deltaGoodDirection={wantsLoss ? 'down' : 'up'}
        />
        <StatTile
          label="Protein"
          value={summary.proteinPerKg != null ? `${summary.proteinPerKg.toFixed(1)} g/kg` : fmtInt(summary.avgProteinG, ' g')}
          icon={<Utensils className="h-3.5 w-3.5" />}
          delta={previous && summary.avgProteinG != null && previous.avgProteinG != null ? summary.avgProteinG - previous.avgProteinG : null}
          deltaGoodDirection="up"
          sub={summary.avgProteinG != null ? `${summary.avgProteinG} g/day` : undefined}
        />
        <StatTile
          label="Sessions"
          value={`${summary.daysTrained}`}
          icon={<Dumbbell className="h-3.5 w-3.5" />}
          delta={previous ? summary.daysTrained - previous.daysTrained : null}
          deltaGoodDirection="up"
          sub={`${summary.totalSets} sets`}
        />
        <StatTile
          label="Sleep"
          value={summary.avgSleepH != null ? `${summary.avgSleepH.toFixed(1)} h` : '—'}
          icon={<Moon className="h-3.5 w-3.5" />}
          delta={previous && summary.avgSleepH != null && previous.avgSleepH != null ? summary.avgSleepH - previous.avgSleepH : null}
          deltaGoodDirection="up"
        />
        <StatTile
          label="Weight"
          value={weight.lastKg != null ? `${weight.lastKg.toFixed(1)} kg` : '—'}
          icon={<Scale className="h-3.5 w-3.5" />}
          delta={summary.weightChangeKg}
          deltaGoodDirection={wantsLoss ? 'down' : 'up'}
          sub={profile.targetWeightKg ? `target ${profile.targetWeightKg} kg` : undefined}
        />
      </div>

      {/* ---- TOP FINDINGS ---- */}
      {topFindings.length > 0 && (
        <>
          <SectionHeading title="What needs your attention" hint="Ranked by how much it is costing you." />
          <div className="space-y-3">
            {topFindings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        </>
      )}

      {/* ---- CHARTS ---- */}
      <SectionHeading title="The evidence" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Calories in vs your maintenance line"
          subtitle="Bars above the line are surplus days, below are deficit days"
          height={250}
          footnote={`Maintenance is your logged TDEE where available, otherwise Mifflin-St Jeor × your activity level. The 'real maintenance' number above is derived from your own weight trend instead.${data.estimation.assumedDays > 0 ? ` Faded bars are the ${data.estimation.assumedDays} days with no entry, filled in at ${data.estimation.intakePerDayKcal?.toLocaleString()} kcal each.` : ''}`}
        >
          <ComposedChart data={energyRows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(energyRows.length)} />
            <YAxis {...axisProps} width={44} />
            <Tooltip content={<VizTooltip unit=" kcal" />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            {/* Logged solid, estimated faded — same slot, so the day total reads right. */}
            <Bar dataKey="intakeLogged" stackId="intake" name="Logged intake" fill={VIZ.s2} radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Bar
              dataKey="intakeEstimated"
              stackId="intake"
              name="Estimated (no entry)"
              fill={VIZ.s2}
              fillOpacity={0.28}
              stroke={VIZ.s2}
              strokeWidth={1}
              strokeDasharray="2 2"
              radius={[3, 3, 0, 0]}
              maxBarSize={26}
            />
            <Line
              type="monotone"
              dataKey="maintenance"
              name="Maintenance"
              stroke={VIZ.s1}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ChartCard>

        <ChartCard
          title="Body weight — reading vs trend vs what food predicts"
          subtitle="All three lines are kilograms, so they are directly comparable"
          height={250}
          footnote={
            weight.observations < 3
              ? 'Log your morning weight more often — the trend line needs at least three readings to mean anything.'
              : 'The predicted line walks your first weigh-in forward using cumulative energy balance ÷ 7 700 kcal per kg. Where it diverges from the real trend, either the food log or the maintenance number is off.'
          }
        >
          <LineChart data={weight.series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(weight.series.length)} />
            <YAxis {...axisProps} width={44} domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(v) => Number(v).toFixed(1)} />
            <Tooltip content={<VizTooltip unit=" kg" dp={1} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            {profile.targetWeightKg != null && (
              <ReferenceLine
                y={profile.targetWeightKg}
                stroke={VIZ.s3}
                strokeWidth={1.5}
                label={{ value: `target ${profile.targetWeightKg}`, position: 'insideTopRight', fontSize: 10, fill: VIZ.axis }}
              />
            )}
            <Line
              type="monotone"
              dataKey="weight"
              name="Weigh-in"
              stroke={VIZ.s1}
              strokeWidth={0}
              dot={{ r: 3, fill: VIZ.s1, stroke: VIZ.surface, strokeWidth: 2 }}
              connectNulls={false}
              legendType="circle"
            />
            <Line type="monotone" dataKey="trend" name="7-day trend" stroke={VIZ.s1} strokeWidth={2} dot={false} connectNulls />
            <Line
              type="monotone"
              dataKey="predicted"
              name="Predicted by food"
              stroke={VIZ.s2}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartCard>

        <ChartCard
          title="Weekly energy balance"
          subtitle="Total surplus or deficit each week — the number that actually moves the scale"
          height={230}
          footnote={`Across this range: ${fmtKcal(energy.cumulativeKcal)} cumulative, which is ${energy.predictedWeightChangeKg != null ? `${energy.predictedWeightChangeKg > 0 ? '+' : ''}${energy.predictedWeightChangeKg.toFixed(2)} kg` : '—'} of predicted body mass.`}
          action={<SwatchLegend items={[{ color: VIZ.cool, label: 'Deficit' }, { color: VIZ.warm, label: 'Surplus' }]} />}
        >
          <BarChart data={weekly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(weekly.length)} />
            <YAxis {...axisProps} width={52} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              content={
                <VizTooltip
                  unit=" kcal"
                  extra={(d) =>
                    d
                      ? [
                          { label: 'Days trained', value: `${d.daysTrained}/${d.daysLogged || 0}` },
                          { label: 'Avg intake', value: fmtKcal(d.avgIntake) },
                        ]
                      : []
                  }
                />
              }
            />
            <ReferenceLine y={0} stroke={VIZ.axis} strokeWidth={1} />
            <Bar dataKey="totalBalance" name="Week balance" radius={[3, 3, 0, 0]} maxBarSize={40}>
              {weekly.map((w) => (
                <Cell key={w.weekStart} fill={(w.totalBalance ?? 0) > 0 ? VIZ.warm : VIZ.cool} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Training days vs rest days"
          subtitle="Same units (kcal), so the two bars are honestly comparable"
          height={230}
          footnote={`${
            dayType.rest.daysWithFood < 3 || dayType.trained.daysWithFood < 3 || dayType.intakeDeltaKcal == null
              ? `This needs three days with an intake figure on each side; you have ${dayType.trained.daysWithFood} training and ${dayType.rest.daysWithFood} rest.`
              : dayType.intakeDeltaKcal > -150
                ? `You eat only ${Math.abs(dayType.intakeDeltaKcal)} kcal ${dayType.intakeDeltaKcal >= 0 ? 'more' : 'less'} on rest days than training days — while burning nothing extra. This is the single most common reason the scale climbs during a training block.`
                : `You eat ${Math.abs(dayType.intakeDeltaKcal)} kcal less on rest days. That is the right instinct.`
          }${
            dayType.rest.daysEstimated > 0
              ? ` ${dayType.rest.daysEstimated} of the ${dayType.rest.daysWithFood} rest days averaged here are estimated rather than logged, so this comparison is only as good as that assumption.`
              : ''
          }`}
        >
          <BarChart
            data={[
              {
                name: `Training days (${dayType.trained.daysWithFood} logged)`,
                intake: dayType.trained.avgIntake,
                maintenance: dayType.trained.avgMaintenance,
              },
              {
                name: `Rest days (${dayType.rest.daysWithFood} logged)`,
                intake: dayType.rest.avgIntake,
                maintenance: dayType.rest.avgMaintenance,
              },
            ]}
            margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
            barGap={2}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} width={44} />
            <Tooltip content={<VizTooltip unit=" kcal" />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <Bar dataKey="intake" name="Avg intake" fill={VIZ.s2} radius={[4, 4, 0, 0]} maxBarSize={64} />
            <Bar dataKey="maintenance" name="Avg maintenance" fill={VIZ.s1} radius={[4, 4, 0, 0]} maxBarSize={64} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onJump('energy')}>
          Energy detail
        </Button>
        <Button variant="outline" size="sm" onClick={() => onJump('weight')}>
          Weight & composition
        </Button>
        <Button variant="outline" size="sm" onClick={() => onJump('training')}>
          Training
        </Button>
        <Button variant="outline" size="sm" onClick={() => onJump('data')}>
          Raw day table
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The verdict — one sentence assembled from the strongest signal available
// ---------------------------------------------------------------------------

function verdictSentence(data: AnalyticsPayload): string {
  const { weight, summary, profile } = data
  const rate = weight.rateKgPerWeek

  if (summary.daysLogged === 0) return 'No entries in this range — widen the range or log a day.'
  if (weight.observations < 3 || rate == null) {
    if (summary.avgBalanceKcal == null)
      return `You logged ${summary.daysLogged} of ${summary.days} days, but not enough food data to judge your energy balance.`
    return summary.avgBalanceKcal > 100
      ? `You are eating about ${summary.avgBalanceKcal} kcal a day over maintenance, which points to gaining — but with only ${weight.observations} weigh-in${weight.observations === 1 ? '' : 's'} the scale cannot confirm it.`
      : `You are averaging ${summary.avgBalanceKcal > 0 ? '+' : ''}${summary.avgBalanceKcal} kcal a day against maintenance. Weigh in more often so this can be verified against the scale.`
  }

  const perWeek = Math.abs(rate).toFixed(2)
  const monthly = (rate * 4.345).toFixed(1)
  const wantsLoss =
    profile.nutritionGoal === 'lose_weight' ||
    (profile.targetWeightKg != null && profile.weightKg != null && profile.targetWeightKg < profile.weightKg)

  if (rate > 0.05) {
    return wantsLoss
      ? `You are gaining ${perWeek} kg a week (${monthly} kg a month) while trying to lose — and the numbers below show exactly where it is coming from.`
      : `You are gaining ${perWeek} kg a week, about ${monthly} kg a month.`
  }
  if (rate < -0.05) {
    return wantsLoss
      ? `You are losing ${perWeek} kg a week — about ${Math.abs(Number(monthly))} kg a month — and that is the direction you want.`
      : `You are losing ${perWeek} kg a week, which is the opposite of your stated goal.`
  }
  return `Your weight is essentially flat (${rate.toFixed(2)} kg/week) — you are sitting at maintenance.`
}

function verdictDetail(data: AnalyticsPayload): string {
  const { weight, dayType, summary, energy } = data
  const parts: string[] = []

  if (weight.trueMaintenanceKcal != null && summary.avgIntakeKcal != null) {
    const gap = summary.avgIntakeKcal - weight.trueMaintenanceKcal
    parts.push(
      `Your body's real maintenance works out to about ${weight.trueMaintenanceKcal.toLocaleString()} kcal and you averaged ${summary.avgIntakeKcal.toLocaleString()} kcal — a ${gap > 0 ? 'surplus' : 'deficit'} of ${Math.abs(Math.round(gap))} kcal a day.`
    )
  } else if (summary.avgIntakeKcal != null && summary.avgMaintenanceKcal != null) {
    parts.push(
      `You averaged ${summary.avgIntakeKcal.toLocaleString()} kcal against an assumed maintenance of ${summary.avgMaintenanceKcal.toLocaleString()} kcal.`
    )
  }

  if (dayType.rest.days >= 3 && dayType.rest.surplusKcal > 0) {
    parts.push(
      `Your ${dayType.rest.days} rest days contributed ${Math.round(dayType.rest.surplusKcal).toLocaleString()} kcal of surplus on their own${dayType.restSurplusKg ? ` — about ${dayType.restSurplusKg.toFixed(2)} kg` : ''}.`
    )
  }

  if (energy.surplusDays + energy.deficitDays > 0) {
    parts.push(`${energy.surplusDays} surplus days vs ${energy.deficitDays} deficit days in this range.`)
  }

  return parts.join(' ')
}

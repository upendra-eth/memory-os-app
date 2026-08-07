'use client'

/**
 * Weight & composition — is the scale telling the truth, and is the change
 * muscle or fat?
 *
 * The honest answer to "why am I gaining while training and eating less" lives
 * here: the measured trend, what the food log predicts, the gap between them,
 * and an explicit estimate of how the change splits between lean and fat mass.
 */

import { useRef } from 'react'
import { Card } from '@/components/ui/card'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsPayload } from '@/lib/analytics/types'
import {
  ChartCard,
  EmptyPanel,
  HeroStat,
  SectionHeading,
  StatTile,
  SwatchLegend,
  VIZ,
  VizTooltip,
  axisProps,
  fmtKg,
  gridProps,
  tickInterval,
} from './chart-kit'
import { Info } from 'lucide-react'
import { QuickWeightLog } from './quick-weight-log'
import { WeightLogManager, type WeightLogManagerHandle } from './weight-log-manager'

/** A weigh-in dot that's actually clickable — jumps to that date in the manager below. Skips null placeholders and gives touch a bigger hit target than the 3.5px mark. */
function ClickableWeighInDot(props: any) {
  const { cx, cy, payload, onPick } = props
  if (cx == null || cy == null || payload?.weight == null) return null
  return (
    <g style={{ cursor: 'pointer' }} onClick={() => onPick(payload.date)}>
      <circle cx={cx} cy={cy} r={11} fill="transparent" />
      <circle cx={cx} cy={cy} r={3.5} fill={VIZ.s1} stroke={VIZ.surface} strokeWidth={2} />
    </g>
  )
}

export function WeightView({ data, onLogged }: { data: AnalyticsPayload; onLogged: () => void }) {
  const { weight, summary, profile, monthly, weekly, days } = data
  const managerRef = useRef<WeightLogManagerHandle>(null)
  const pickDate = (date: string) => managerRef.current?.focusDate(date)
  const handleChanged = () => {
    managerRef.current?.refresh()
    onLogged()
  }

  if (weight.observations === 0) {
    return (
      <div className="space-y-5">
        <QuickWeightLog lastKg={profile.weightKg} onLogged={onLogged} />
        <EmptyPanel
          title="No weigh-ins in this range"
          body="Body weight is the one measurement that settles every disagreement between what you think you ate and what your body did. Log it above, or mention it in your daily paste — even three readings unlocks the trend line and your real maintenance calories."
        />
      </div>
    )
  }

  const wantsLoss =
    profile.nutritionGoal === 'lose_weight' ||
    (profile.targetWeightKg != null && profile.weightKg != null && profile.targetWeightKg < profile.weightKg)
  const rate = weight.rateKgPerWeek
  const comp = weight.composition

  // Lean/fat split as one stacked bar — the magnitudes, side by side.
  const compRows = comp
    ? [
        {
          name: 'Estimated split',
          lean: Math.abs(comp.leanKg),
          fat: Math.abs(comp.fatKg),
        },
      ]
    : []

  return (
    <div className="space-y-5">
      <QuickWeightLog lastKg={weight.lastKg ?? profile.weightKg} onLogged={onLogged} />

      {/* ---- Headline numbers ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroStat
          label="Current"
          value={weight.lastKg != null ? weight.lastKg.toFixed(1) : '—'}
          unit="kg"
          note={
            weight.bmi != null
              ? `BMI ${weight.bmi} · ${weight.bmiCategory}`
              : 'Add height to your profile for BMI'
          }
        />
        <HeroStat
          label="Trend"
          value={rate != null ? `${rate > 0 ? '+' : ''}${rate.toFixed(2)}` : '—'}
          unit="kg/wk"
          tone={rate == null ? 'neutral' : wantsLoss === (rate < 0) ? 'good' : 'bad'}
          note={
            rate != null
              ? `${(rate * 4.345).toFixed(1)} kg/month at this rate · ${weight.observations} weigh-ins`
              : `Only ${weight.observations} weigh-in${weight.observations === 1 ? '' : 's'} — needs 3`
          }
        />
        <HeroStat
          label="To target"
          value={
            profile.targetWeightKg != null && weight.lastKg != null
              ? `${(weight.lastKg - profile.targetWeightKg).toFixed(1)}`
              : '—'
          }
          unit="kg"
          note={
            weight.weeksToTarget != null
              ? `~${weight.weeksToTarget} weeks at your current rate`
              : profile.targetWeightKg == null
                ? 'Set a target weight in your profile'
                : 'Current trend is not moving toward the target'
          }
        />
        <HeroStat
          label="Real maintenance"
          value={weight.trueMaintenanceKcal != null ? weight.trueMaintenanceKcal.toLocaleString() : '—'}
          unit="kcal"
          note={
            weight.trueMaintenanceKcal != null
              ? `From your intake + trend, not a formula`
              : 'Needs ≥3 weigh-ins over ≥10 days'
          }
        />
      </div>

      {/* ---- The core chart ---- */}
      <ChartCard
        title="Measured weight, trend, and what your food log predicts"
        subtitle="All three series are kilograms on one axis — click any weigh-in dot to correct or delete it"
        height={320}
        footnote="Where the dashed prediction and the solid trend separate, the food log and the maintenance figure disagree with your body. The body is right; the inputs need fixing. Click a solid dot above to jump straight to that date below."
      >
        <LineChart data={weight.series} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval={tickInterval(weight.series.length)} />
          <YAxis
            {...axisProps}
            width={46}
            domain={['dataMin - 1', 'dataMax + 1']}
            tickFormatter={(v) => Number(v).toFixed(1)}
          />
          <Tooltip content={<VizTooltip unit=" kg" dp={2} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          {profile.idealWeightRange && (
            <ReferenceArea
              y1={profile.idealWeightRange.min}
              y2={profile.idealWeightRange.max}
              fill={VIZ.s3}
              fillOpacity={0.07}
              stroke="none"
            />
          )}
          {profile.targetWeightKg != null && (
            <ReferenceLine
              y={profile.targetWeightKg}
              stroke={VIZ.s3}
              strokeWidth={1.5}
              label={{ value: `target ${profile.targetWeightKg} kg`, position: 'insideBottomRight', fontSize: 10, fill: VIZ.axis }}
            />
          )}
          <Line
            type="monotone"
            dataKey="weight"
            name="Weigh-in"
            stroke={VIZ.s1}
            strokeWidth={0}
            dot={<ClickableWeighInDot onPick={pickDate} />}
            connectNulls={false}
            legendType="circle"
          />
          <Line type="monotone" dataKey="trend" name="7-day trend" stroke={VIZ.s1} strokeWidth={2} dot={false} connectNulls />
          <Line
            type="monotone"
            dataKey="predicted"
            name="Predicted by food log"
            stroke={VIZ.s2}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ChartCard>

      {/* ---- Water weight warning ---- */}
      {weight.waterWeightNote && (
        <Card className="flex items-start gap-3 border-blue-500/25 border-l-4 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium">That jump was not fat</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{weight.waterWeightNote}</p>
          </div>
        </Card>
      )}

      {/* ---- Composition ---- */}
      <SectionHeading
        title="Muscle or fat?"
        hint="An estimate from your rate of change, training frequency and protein intake — not a measurement."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {comp ? (
          <>
            <ChartCard
              title={`Estimated split of the ${comp.changeKg > 0 ? 'gain' : 'loss'}`}
              subtitle={`${Math.abs(comp.changeKg).toFixed(2)} kg total · ${comp.leanShare}% lean / ${100 - comp.leanShare}% fat`}
              height={180}
              footnote="Stacked segments carry a 2px gap so the two magnitudes stay separable. Confidence is capped at medium by design — only a DEXA or caliper measures this."
            >
              <BarChart data={compRows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axisProps} unit=" kg" />
                <YAxis type="category" dataKey="name" {...axisProps} width={0} tick={false} />
                <Tooltip content={<VizTooltip unit=" kg" dp={2} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar
                  dataKey="lean"
                  stackId="c"
                  name="Lean mass"
                  fill={VIZ.s3}
                  stroke={VIZ.surface}
                  strokeWidth={2}
                  radius={[4, 0, 0, 4]}
                  maxBarSize={54}
                />
                <Bar
                  dataKey="fat"
                  stackId="c"
                  name="Fat mass"
                  fill={VIZ.s2}
                  stroke={VIZ.surface}
                  strokeWidth={2}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={54}
                />
              </BarChart>
            </ChartCard>

            <Card className="p-5">
              <h3 className="text-sm font-semibold">Why that split</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{comp.reasoning}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatTile label="Est. lean change" value={fmtKg(comp.leanKg, 2)} />
                <StatTile label="Est. fat change" value={fmtKg(comp.fatKg, 2)} />
                <StatTile
                  label="Training"
                  value={summary.trainingPerWeek != null ? `${summary.trainingPerWeek.toFixed(1)}×/wk` : '—'}
                  sub={summary.trainingPerWeek != null && summary.trainingPerWeek >= 3 ? 'above threshold' : 'below the 3×/wk threshold'}
                />
                <StatTile
                  label="Protein"
                  value={summary.proteinPerKg != null ? `${summary.proteinPerKg.toFixed(1)} g/kg` : '—'}
                  sub={summary.proteinPerKg != null && summary.proteinPerKg >= 1.6 ? 'above threshold' : 'below the 1.6 g/kg threshold'}
                />
              </div>
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                The two levers that shift this split are both in your control: keep the rate of change under
                0.3–0.5 kg a week, and keep protein at or above 1.6 g per kg of bodyweight. Confidence:{' '}
                <span className="font-medium">{comp.confidence}</span>.
              </p>
            </Card>
          </>
        ) : (
          <Card className="p-5 lg:col-span-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your weight has not moved enough in this range (or has too few readings) to split into muscle and fat.
              This estimate needs at least three weigh-ins spanning ten days and a change of more than 0.3 kg.
            </p>
          </Card>
        )}
      </div>

      {/* ---- Rate over time ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Weekly average weight"
          subtitle="Smoothed by week — the noise-free view of the same data"
          height={240}
        >
          <ComposedChart data={weekly} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(weekly.length)} />
            <YAxis {...axisProps} width={46} domain={['dataMin - 0.5', 'dataMax + 0.5']} tickFormatter={(v) => Number(v).toFixed(1)} />
            <Tooltip content={<VizTooltip unit=" kg" dp={2} />} />
            <Line type="monotone" dataKey="avgWeightKg" name="Avg weight" stroke={VIZ.s1} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ChartCard>

        {monthly.length > 1 && (
          <ChartCard
            title="Weight change per month"
            subtitle="First to last reading inside each calendar month"
            height={240}
            action={
              <SwatchLegend
                items={[
                  { color: VIZ.warm, label: 'Gained' },
                  { color: VIZ.cool, label: 'Lost' },
                ]}
              />
            }
          >
            <BarChart data={monthly} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={44} unit=" kg" />
              <Tooltip content={<VizTooltip unit=" kg" dp={2} />} />
              <ReferenceLine y={0} stroke={VIZ.axis} strokeWidth={1} />
              <Bar dataKey="weightChangeKg" name="Change" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {monthly.map((m) => (
                  <Cell key={m.month} fill={(m.weightChangeKg ?? 0) > 0 ? VIZ.warm : VIZ.cool} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
        )}
      </div>

      {/* ---- Manage every weigh-in: correct, delete, see what's superseded ---- */}
      <SectionHeading title="Manage your weigh-ins" hint="Fix a wrong number, remove a duplicate, or see exactly what the charts are reading." />
      <WeightLogManager ref={managerRef} onChanged={handleChanged} />
    </div>
  )
}

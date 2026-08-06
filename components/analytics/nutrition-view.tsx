'use client'

/**
 * Diet — macros, portion truth, and which foods reliably tip a day over.
 */

import { Card } from '@/components/ui/card'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  DataTable,
  EmptyPanel,
  MeterRow,
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

export function NutritionView({ data }: { data: AnalyticsPayload }) {
  const { nutrition, summary, profile } = data

  if (summary.daysWithFood === 0) {
    return (
      <EmptyPanel
        title="No food logged in this range"
        body="Paste a day that lists what you ate. The normalizer breaks it into items with calories and macros, and this tab reconstructs your diet from those items."
      />
    )
  }

  const macroRows = nutrition.macroSeries
  const proteinTarget = profile.weightKg ? nutrition.proteinTargetPerKg : null

  return (
    <div className="space-y-5">
      {/* ---- Summary ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Avg calories" value={fmtInt(summary.avgIntakeKcal)} sub={`${summary.daysWithFood} days logged`} />
        <StatTile
          label="Protein"
          value={summary.proteinPerKg != null ? `${summary.proteinPerKg.toFixed(1)} g/kg` : fmtInt(summary.avgProteinG, ' g')}
          sub={profile.proteinTargetG ? `target ${profile.proteinTargetG} g` : undefined}
        />
        <StatTile label="Carbs" value={fmtInt(summary.avgCarbsG, ' g')} />
        <StatTile label="Fat" value={fmtInt(summary.avgFatG, ' g')} />
        <StatTile
          label="Fiber"
          value={fmtInt(summary.avgFiberG, ' g')}
          sub={`target ${nutrition.fiberTargetG} g`}
        />
        <StatTile label="Meals/day" value={nutrition.avgMealsPerDay != null ? `${nutrition.avgMealsPerDay}` : '—'} sub="logged items" />
      </div>

      {/* ---- Macro split ---- */}
      {nutrition.macroSplit && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Where your calories come from</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Share of total energy, computed from average grams (protein and carbs 4 kcal/g, fat 9 kcal/g)
          </p>
          <div className="mt-4 space-y-3">
            <MeterRow
              label="Protein"
              value={nutrition.macroSplit.protein}
              max={100}
              caption={`${nutrition.macroSplit.protein}% · ${summary.avgProteinG} g`}
              color={VIZ.s1}
            />
            <MeterRow
              label="Carbs"
              value={nutrition.macroSplit.carbs}
              max={100}
              caption={`${nutrition.macroSplit.carbs}% · ${summary.avgCarbsG} g`}
              color={VIZ.s4}
            />
            <MeterRow
              label="Fat"
              value={nutrition.macroSplit.fat}
              max={100}
              caption={`${nutrition.macroSplit.fat}% · ${summary.avgFatG} g`}
              color={VIZ.s2}
            />
          </div>
        </Card>
      )}

      {/* ---- Daily macros + protein per kg ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Macros day by day" subtitle="Grams, stacked — total height is the day's macro load" height={260}>
          <AreaChart data={macroRows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(macroRows.length)} />
            <YAxis {...axisProps} width={44} unit="g" />
            <Tooltip content={<VizTooltip unit=" g" />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <Area
              type="monotone"
              dataKey="protein"
              stackId="m"
              name="Protein"
              stroke={VIZ.s1}
              strokeWidth={2}
              fill={VIZ.s1}
              fillOpacity={0.55}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="carbs"
              stackId="m"
              name="Carbs"
              stroke={VIZ.s4}
              strokeWidth={2}
              fill={VIZ.s4}
              fillOpacity={0.55}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="fat"
              stackId="m"
              name="Fat"
              stroke={VIZ.s2}
              strokeWidth={2}
              fill={VIZ.s2}
              fillOpacity={0.55}
              connectNulls={false}
            />
          </AreaChart>
        </ChartCard>

        <ChartCard
          title="Protein per kilogram of bodyweight"
          subtitle={`The shaded band is the ${nutrition.proteinTargetPerKg}–2.2 g/kg window that protects muscle`}
          height={260}
          footnote="Below 1.6 g/kg, weight you lose is more likely to include muscle and weight you gain is more likely to be fat. This one number changes what your scale movement means."
        >
          <LineChart data={nutrition.proteinSeries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(nutrition.proteinSeries.length)} />
            <YAxis {...axisProps} width={40} unit=" g" />
            {proteinTarget && <ReferenceArea y1={proteinTarget} y2={2.2} fill={VIZ.s3} fillOpacity={0.09} stroke="none" />}
            <Tooltip content={<VizTooltip unit=" g/kg" dp={2} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            {proteinTarget && <ReferenceLine y={proteinTarget} stroke={VIZ.s3} strokeWidth={1.5} />}
            <Line type="monotone" dataKey="perKg" name="Protein g/kg" stroke={VIZ.s1} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} />
          </LineChart>
        </ChartCard>
      </div>

      {/* ---- Intake distribution + meals ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="How your daily calories are distributed"
          subtitle="Number of days that landed in each 250 kcal band"
          height={240}
          action={
            nutrition.calorieTargetKcal != null ? (
              <SwatchLegend
                items={[
                  { color: VIZ.s1, label: `At or under ${nutrition.calorieTargetKcal.toLocaleString()}` },
                  { color: VIZ.s2, label: 'Over target' },
                ]}
              />
            ) : undefined
          }
          footnote={
            nutrition.calorieTargetKcal != null
              ? `${nutrition.daysOverTarget} days over your ${nutrition.calorieTargetKcal.toLocaleString()} kcal target, ${nutrition.daysUnderTarget} at or under. A wide spread means inconsistency — and inconsistency is harder to fix than a wrong average.`
              : 'Add weight, height, sex and age to your profile to get a calorie target drawn on this chart.'
          }
        >
          <BarChart data={nutrition.intakeHistogram} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="bucket" {...axisProps} angle={-35} textAnchor="end" height={52} interval={0} />
            <YAxis {...axisProps} width={36} allowDecimals={false} />
            <Tooltip content={<VizTooltip unit=" days" />} />
            <Bar dataKey="days" name="Days" radius={[3, 3, 0, 0]} maxBarSize={44}>
              {nutrition.intakeHistogram.map((b) => (
                <Cell key={b.bucket} fill={b.over ? VIZ.s2 : VIZ.s1} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Calories by meal"
          subtitle="Average per day that meal was logged"
          height={240}
          footnote="Bars rather than a pie: comparing close values is what bars are for."
        >
          <BarChart data={nutrition.mealTypes} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="mealType" {...axisProps} tickFormatter={(v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)} />
            <YAxis {...axisProps} width={44} />
            <Tooltip
              content={
                <VizTooltip
                  unit=" kcal"
                  extra={(d) =>
                    d ? [{ label: 'Days logged', value: `${d.days}` }, { label: 'Share of intake', value: `${d.share}%` }] : []
                  }
                />
              }
            />
            <Bar dataKey="avgKcal" name="Avg kcal" fill={VIZ.s1} radius={[4, 4, 0, 0]} maxBarSize={52} />
          </BarChart>
        </ChartCard>
      </div>

      {/* ---- Top foods ---- */}
      <SectionHeading
        title="Your biggest calorie sources"
        hint="One item carrying a large share of your intake means one portion change moves your whole week."
      />
      <ChartCard
        title="Top foods by total calories in this range"
        subtitle="Direct-labelled, so the values read without the axis"
        height={Math.max(220, Math.min(10, nutrition.topFoodsByKcal.length) * 34 + 40)}
      >
        <BarChart
          data={nutrition.topFoodsByKcal.slice(0, 10)}
          layout="vertical"
          margin={{ top: 4, right: 64, left: 8, bottom: 0 }}
        >
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis type="number" {...axisProps} hide />
          <YAxis type="category" dataKey="item" {...axisProps} width={124} tick={{ fontSize: 11, fill: VIZ.axis }} />
          <Tooltip
            content={
              <VizTooltip
                unit=" kcal"
                extra={(d) =>
                  d
                    ? [
                        { label: 'Days eaten', value: `${d.days}` },
                        { label: 'Per serving', value: fmtKcal(d.avgKcal) },
                        { label: 'Share of intake', value: `${d.kcalShare}%` },
                        { label: 'Protein', value: `${d.proteinG} g` },
                      ]
                    : []
                }
              />
            }
          />
          <Bar
            dataKey="totalKcal"
            name="Total kcal"
            fill={VIZ.s1}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            label={{
              position: 'right',
              fontSize: 10,
              fill: VIZ.axis,
              formatter: (v: number) => `${Math.round(v).toLocaleString()} kcal`,
            }}
          />
        </BarChart>
      </ChartCard>

      {/* ---- Surplus offenders ---- */}
      {nutrition.surplusOffenders.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Foods that show up on your surplus days</h3>
          <p className="mt-1 mb-3 text-xs text-muted-foreground leading-relaxed">
            &ldquo;Lift&rdquo; is how much more often a food appears on days you ended over maintenance versus days you
            ended under. Above 1.4 with at least two appearances is a real pattern, not chance. These are not bad
            foods — they are the ones that reliably tip your day over.
          </p>
          <DataTable
            rows={nutrition.surplusOffenders}
            columns={[
              { key: 'item', header: 'Food', render: (r) => <span className="font-medium">{r.item}</span> },
              { key: 'lift', header: 'Lift', align: 'right', render: (r) => (r.surplusLift === 99 ? 'only on surplus days' : `${r.surplusLift}×`) },
              { key: 'sd', header: 'Surplus days', align: 'right', render: (r) => `${r.surplusDays}` },
              { key: 'dd', header: 'Deficit days', align: 'right', render: (r) => `${r.deficitDays}` },
              { key: 'avg', header: 'Per serving', align: 'right', render: (r) => fmtKcal(r.avgKcal) },
              { key: 'total', header: 'Total', align: 'right', render: (r) => fmtKcal(r.totalKcal) },
            ]}
          />
        </Card>
      )}

      {/* ---- Full food table ---- */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Most frequent foods</h3>
        <DataTable
          rows={nutrition.topFoodsByFrequency}
          columns={[
            { key: 'item', header: 'Food', render: (r) => <span className="font-medium">{r.item}</span> },
            { key: 'days', header: 'Days', align: 'right', render: (r) => `${r.days}` },
            { key: 'servings', header: 'Servings', align: 'right', render: (r) => `${r.servings}` },
            { key: 'avg', header: 'Avg kcal', align: 'right', render: (r) => fmtKcal(r.avgKcal) },
            { key: 'total', header: 'Total kcal', align: 'right', render: (r) => fmtKcal(r.totalKcal) },
            { key: 'share', header: 'Share', align: 'right', render: (r) => `${r.kcalShare}%` },
            { key: 'protein', header: 'Protein', align: 'right', render: (r) => `${r.proteinG} g` },
          ]}
        />
      </Card>
    </div>
  )
}

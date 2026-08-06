'use client'

/**
 * Energy — calories in, calories out, and where the surplus actually accumulated.
 *
 * Every chart on this tab is in kcal on a single axis. Where a second unit was
 * tempting (e.g. kcal against kg), the conversion is done in the copy instead of
 * being smuggled in as a second y-axis.
 */

import { Card } from '@/components/ui/card'
import {
  Area,
  AreaChart,
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

export function EnergyView({ data }: { data: AnalyticsPayload }) {
  const { energy, summary, dayType, weekday, weekly, monthly } = data

  if (summary.daysWithFood === 0) {
    return (
      <EmptyPanel
        title="No calories logged in this range"
        body="Energy analysis needs food data. Paste a day that includes what you ate — the normalizer fills in calories and macros per item, and everything on this tab computes from there."
      />
    )
  }

  const rows = energy.series

  return (
    <div className="space-y-5">
      {/* ---- Summary strip ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Avg intake" value={fmtInt(summary.avgIntakeKcal)} sub="kcal/day" />
        <StatTile label="Avg maintenance" value={fmtInt(summary.avgMaintenanceKcal)} sub="kcal/day" />
        <StatTile
          label="Avg balance"
          value={summary.avgBalanceKcal != null ? `${summary.avgBalanceKcal > 0 ? '+' : ''}${summary.avgBalanceKcal}` : '—'}
          sub="kcal/day"
        />
        <StatTile label="Surplus days" value={`${energy.surplusDays}`} sub={fmtKcal(energy.surplusTotalKcal)} />
        <StatTile label="Deficit days" value={`${energy.deficitDays}`} sub={fmtKcal(energy.deficitTotalKcal)} />
        <StatTile
          label="Net over range"
          value={energy.cumulativeKcal != null ? `${energy.cumulativeKcal > 0 ? '+' : ''}${Math.round(energy.cumulativeKcal / 1000)}k` : '—'}
          sub={
            energy.predictedWeightChangeKg != null
              ? `≈ ${energy.predictedWeightChangeKg > 0 ? '+' : ''}${energy.predictedWeightChangeKg.toFixed(2)} kg`
              : undefined
          }
        />
      </div>

      {/* ---- Daily in vs out ---- */}
      <ChartCard
        title="Every day: what you ate against what you burn"
        subtitle="Bars are intake, the line is your maintenance. Training burn is shown separately below — it is already inside the maintenance figure, so subtracting it twice would double-count."
        height={300}
      >
        <ComposedChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval={tickInterval(rows.length)} />
          <YAxis {...axisProps} width={48} />
          <Tooltip
            content={
              <VizTooltip
                unit=" kcal"
                extra={(d) => (d ? [{ label: 'Day type', value: d.trained ? 'Trained' : 'Rest' }] : [])}
              />
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          <Bar dataKey="intake" name="Intake" radius={[3, 3, 0, 0]} maxBarSize={22}>
            {rows.map((r) => (
              // Colour carries day type, which the tooltip also states outright.
              <Cell key={r.date} fill={r.trained ? VIZ.s2 : VIZ.s4} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="maintenance" name="Maintenance" stroke={VIZ.s1} strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ChartCard>
      <SwatchLegend
        items={[
          { color: VIZ.s2, label: 'Intake on a training day' },
          { color: VIZ.s4, label: 'Intake on a rest day' },
          { color: VIZ.s1, label: 'Maintenance' },
        ]}
      />

      {/* ---- Daily balance, diverging ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Daily energy balance"
          subtitle="Above zero you stored, below zero you drew down"
          height={260}
          action={<SwatchLegend items={[{ color: VIZ.cool, label: 'Deficit' }, { color: VIZ.warm, label: 'Surplus' }]} />}
        >
          <BarChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(rows.length)} />
            <YAxis {...axisProps} width={48} />
            <Tooltip
              content={
                <VizTooltip
                  unit=" kcal"
                  extra={(d) =>
                    d
                      ? [
                          { label: 'Intake', value: fmtKcal(d.intake) },
                          { label: 'Day type', value: d.trained ? 'Trained' : 'Rest' },
                        ]
                      : []
                  }
                />
              }
            />
            <ReferenceLine y={0} stroke={VIZ.axis} strokeWidth={1} />
            <Bar dataKey="balance" name="Balance" radius={[3, 3, 0, 0]} maxBarSize={22}>
              {rows.map((r) => (
                <Cell key={r.date} fill={(r.balance ?? 0) > 0 ? VIZ.warm : VIZ.cool} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Cumulative energy balance"
          subtitle="The running total — this is the line that becomes body mass"
          height={260}
          footnote={`Divide by 7 700 kcal to read it in kilograms: the range ends at ${fmtKcal(energy.cumulativeKcal)}, or about ${energy.predictedWeightChangeKg != null ? `${energy.predictedWeightChangeKg > 0 ? '+' : ''}${energy.predictedWeightChangeKg.toFixed(2)} kg` : '—'}.`}
        >
          <AreaChart data={rows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VIZ.s6} stopOpacity={0.35} />
                <stop offset="100%" stopColor={VIZ.s6} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(rows.length)} />
            <YAxis {...axisProps} width={52} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              content={
                <VizTooltip
                  unit=" kcal"
                  extra={(d) =>
                    d?.cumulative != null ? [{ label: 'As body mass', value: `${(d.cumulative / 7700).toFixed(2)} kg` }] : []
                  }
                />
              }
            />
            <ReferenceLine y={0} stroke={VIZ.axis} strokeWidth={1} />
            <Area
              type="monotone"
              dataKey="cumulative"
              name="Cumulative balance"
              stroke={VIZ.s6}
              strokeWidth={2}
              fill="url(#cumFill)"
              connectNulls
            />
          </AreaChart>
        </ChartCard>
      </div>

      {/* ---- Weekday profile: two charts, never one dual axis ---- */}
      <SectionHeading
        title="Your week has a shape"
        hint="Average intake and training rate for each weekday. Two charts because kcal and percent are different units."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Average intake by weekday"
          subtitle="Which day of the week costs you the most — averaged over that weekday's food-logged days only"
          height={240}
        >
          <BarChart data={weekday} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} tickFormatter={(v) => String(v).slice(0, 3)} />
            <YAxis {...axisProps} width={48} />
            <Tooltip
              content={
                <VizTooltip
                  unit=" kcal"
                  extra={(d) =>
                    d
                      ? [
                          { label: 'Days in range', value: `${d.days}` },
                          { label: 'With food logged', value: `${d.daysWithFood}` },
                          { label: 'Trained', value: `${d.trainedPct}%` },
                          { label: 'Avg balance', value: d.avgBalance != null ? fmtKcal(d.avgBalance) : '—' },
                        ]
                      : []
                  }
                />
              }
            />
            <Bar dataKey="avgIntake" name="Avg intake" fill={VIZ.s2} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="How often you train, by weekday"
          subtitle="Percent of that weekday you actually trained"
          height={240}
        >
          <BarChart data={weekday} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} tickFormatter={(v) => String(v).slice(0, 3)} />
            <YAxis {...axisProps} width={40} domain={[0, 100]} unit="%" />
            <Tooltip
              content={
                <VizTooltip
                  unit="%"
                  extra={(d) => (d ? [{ label: 'Sessions', value: `${d.daysTrained}/${d.days}` }] : [])}
                />
              }
            />
            <Bar dataKey="trainedPct" name="Trained" fill={VIZ.s3} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartCard>
      </div>

      {/* ---- Month rollup ---- */}
      {monthly.length > 1 && (
        <ChartCard
          title="Month by month"
          subtitle="Total energy balance per calendar month"
          height={240}
          action={<SwatchLegend items={[{ color: VIZ.cool, label: 'Deficit' }, { color: VIZ.warm, label: 'Surplus' }]} />}
        >
          <BarChart data={monthly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={52} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              content={
                <VizTooltip
                  unit=" kcal"
                  extra={(d) =>
                    d
                      ? [
                          { label: 'Days logged', value: `${d.daysLogged}` },
                          { label: 'Days trained', value: `${d.daysTrained}` },
                          { label: 'Weight change', value: d.weightChangeKg != null ? `${d.weightChangeKg > 0 ? '+' : ''}${d.weightChangeKg} kg` : '—' },
                        ]
                      : []
                  }
                />
              }
            />
            <ReferenceLine y={0} stroke={VIZ.axis} strokeWidth={1} />
            <Bar dataKey="totalBalance" name="Month balance" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {monthly.map((m) => (
                <Cell key={m.month} fill={(m.totalBalance ?? 0) > 0 ? VIZ.warm : VIZ.cool} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>
      )}

      {/* ---- Day-type breakdown table ---- */}
      <SectionHeading
        title="Trained vs rest, in numbers"
        hint="Averages count only days with food logged, so an unlogged rest day cannot flatter the comparison."
      />
      <Card className="p-4">
        <DataTable
          rows={[dayType.trained, dayType.rest]}
          columns={[
            { key: 'type', header: '', render: (r) => <span className="font-medium capitalize">{r.type} days</span> },
            { key: 'days', header: 'Days', align: 'right', render: (r) => `${r.days}` },
            {
              key: 'withfood',
              header: 'With food logged',
              align: 'right',
              render: (r) => (
                <span className={r.daysWithFood < 3 ? 'text-amber-600 dark:text-amber-400' : undefined}>{r.daysWithFood}</span>
              ),
            },
            { key: 'intake', header: 'Avg intake', align: 'right', render: (r) => fmtKcal(r.avgIntake) },
            { key: 'maint', header: 'Avg maintenance', align: 'right', render: (r) => fmtKcal(r.avgMaintenance) },
            {
              key: 'balance',
              header: 'Avg balance',
              align: 'right',
              render: (r) => (
                <span className={(r.avgBalance ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                  {r.avgBalance != null ? `${r.avgBalance > 0 ? '+' : ''}${r.avgBalance}` : '—'}
                </span>
              ),
            },
            { key: 'protein', header: 'Avg protein', align: 'right', render: (r) => (r.avgProtein != null ? `${r.avgProtein} g` : '—') },
            { key: 'surplus', header: 'Surplus days', align: 'right', render: (r) => `${r.surplusDays}` },
            { key: 'surpluskcal', header: 'Surplus total', align: 'right', render: (r) => fmtKcal(r.surplusKcal) },
          ]}
        />
      </Card>

      {/* ---- Extremes ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Your most expensive days</h3>
          <DataTable
            rows={energy.worstDays}
            empty="No surplus days in this range."
            columns={[
              { key: 'date', header: 'Date', render: (r) => r.label },
              { key: 'type', header: 'Type', render: (r) => (r.trained ? 'Trained' : 'Rest') },
              { key: 'intake', header: 'Eaten', align: 'right', render: (r) => fmtKcal(r.intake) },
              {
                key: 'balance',
                header: 'Balance',
                align: 'right',
                render: (r) => <span className="font-semibold text-red-600 dark:text-red-400">+{Math.round(r.balance).toLocaleString()}</span>,
              },
            ]}
          />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Your best days</h3>
          <DataTable
            rows={energy.bestDays}
            empty="No deficit days in this range."
            columns={[
              { key: 'date', header: 'Date', render: (r) => r.label },
              { key: 'type', header: 'Type', render: (r) => (r.trained ? 'Trained' : 'Rest') },
              { key: 'intake', header: 'Eaten', align: 'right', render: (r) => fmtKcal(r.intake) },
              {
                key: 'balance',
                header: 'Balance',
                align: 'right',
                render: (r) => <span className="font-semibold text-emerald-600 dark:text-emerald-400">{Math.round(r.balance).toLocaleString()}</span>,
              },
            ]}
          />
        </Card>
      </div>

      {/* ---- Weekly table ---- */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Week by week</h3>
        <DataTable
          rows={weekly}
          columns={[
            { key: 'week', header: 'Week of', render: (r) => r.label },
            { key: 'logged', header: 'Logged', align: 'right', render: (r) => `${r.daysLogged}/7` },
            { key: 'trained', header: 'Trained', align: 'right', render: (r) => `${r.daysTrained}` },
            { key: 'intake', header: 'Avg intake', align: 'right', render: (r) => fmtKcal(r.avgIntake) },
            {
              key: 'balance',
              header: 'Week balance',
              align: 'right',
              render: (r) =>
                r.totalBalance != null ? (
                  <span className={r.totalBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {r.totalBalance > 0 ? '+' : ''}
                    {r.totalBalance.toLocaleString()}
                  </span>
                ) : (
                  '—'
                ),
            },
            { key: 'protein', header: 'Protein', align: 'right', render: (r) => (r.avgProtein != null ? `${r.avgProtein} g` : '—') },
            { key: 'volume', header: 'Tonnage', align: 'right', render: (r) => `${r.volumeKg.toLocaleString()} kg` },
            { key: 'weight', header: 'Avg weight', align: 'right', render: (r) => (r.avgWeightKg != null ? `${r.avgWeightKg} kg` : '—') },
          ]}
        />
      </Card>
    </div>
  )
}

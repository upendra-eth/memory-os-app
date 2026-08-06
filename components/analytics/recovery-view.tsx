'use client'

/**
 * Recovery — sleep, mood, stress, energy through the day, symptoms and habits.
 * The inputs that quietly decide whether the diet and training work at all.
 */

import { Card } from '@/components/ui/card'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsPayload } from '@/lib/analytics/types'
import {
  ChartCard,
  DataTable,
  EmptyPanel,
  MeterRow,
  SectionHeading,
  StatTile,
  VIZ,
  VizTooltip,
  axisProps,
  gridProps,
  tickInterval,
} from './chart-kit'
import { Moon } from 'lucide-react'

export function RecoveryView({ data }: { data: AnalyticsPayload }) {
  const { recovery, summary } = data

  const hasAny =
    recovery.series.some((s) => s.sleepH != null || s.mood != null || s.stress != null || s.dayRating != null) ||
    recovery.energyCurve.length > 0 ||
    recovery.habits.length > 0

  if (!hasAny) {
    return (
      <EmptyPanel
        title="No recovery data in this range"
        body="Mention sleep hours, how you felt, your stress level or a 1–10 rating of the day in your entries. Sleep in particular is worth logging: short sleep reliably raises how much you eat the next day."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Avg sleep" value={summary.avgSleepH != null ? `${summary.avgSleepH.toFixed(1)} h` : '—'} icon={<Moon className="h-3.5 w-3.5" />} />
        <StatTile label="Avg mood" value={summary.avgMood != null ? `${summary.avgMood}/10` : '—'} />
        <StatTile label="Avg stress" value={summary.avgStress != null ? `${summary.avgStress}/10` : '—'} />
        <StatTile label="Day rating" value={summary.avgDayRating != null ? `${summary.avgDayRating}/10` : '—'} />
        <StatTile label="Symptoms logged" value={`${recovery.symptoms.reduce((s, x) => s + x.occurrences, 0)}`} sub={`${recovery.symptoms.length} distinct`} />
      </div>

      {/* ---- The sleep → intake link, the highest-leverage finding on this tab ---- */}
      {recovery.sleepVsIntake && recovery.sleepVsIntake.shortSleepAvgIntake != null && recovery.sleepVsIntake.normalSleepAvgIntake != null && (
        <ChartCard
          title="What short sleep costs you in calories"
          subtitle="Average intake on nights under 7 hours vs 7 hours or more — same units, one axis"
          height={220}
          footnote="Short sleep raises ghrelin and blunts leptin, so appetite genuinely increases. If there is a gap here, protecting sleep removes those calories at the source instead of fighting them with willpower."
        >
          <BarChart
            data={[
              { name: `Under 7 h (${recovery.sleepVsIntake.shortSleepDays} days)`, intake: recovery.sleepVsIntake.shortSleepAvgIntake },
              { name: '7 h or more', intake: recovery.sleepVsIntake.normalSleepAvgIntake },
            ]}
            margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} width={48} />
            <Tooltip content={<VizTooltip unit=" kcal" />} />
            <Bar dataKey="intake" name="Avg intake" fill={VIZ.s2} radius={[4, 4, 0, 0]} maxBarSize={72} />
          </BarChart>
        </ChartCard>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Sleep" subtitle="Hours and quality — both on a shared scale" height={250}>
          <LineChart data={recovery.series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(recovery.series.length)} />
            <YAxis {...axisProps} width={34} domain={[0, 10]} />
            <Tooltip content={<VizTooltip dp={1} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <ReferenceLine y={7} stroke={VIZ.s3} strokeWidth={1.5} label={{ value: '7 h', position: 'insideTopLeft', fontSize: 10, fill: VIZ.axis }} />
            <Line type="monotone" dataKey="sleepH" name="Hours slept" stroke={VIZ.s6} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="sleepQuality" name="Quality /10" stroke={VIZ.s5} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          </LineChart>
        </ChartCard>

        <ChartCard title="Mind" subtitle="Everything on the same 1–10 scale" height={250}>
          <LineChart data={recovery.series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={tickInterval(recovery.series.length)} />
            <YAxis {...axisProps} width={34} domain={[0, 10]} />
            <Tooltip content={<VizTooltip dp={1} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
            <Line type="monotone" dataKey="mood" name="Mood" stroke={VIZ.s3} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="stress" name="Stress" stroke={VIZ.s2} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="focus" name="Focus" stroke={VIZ.s1} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="dayRating" name="Day rating" stroke={VIZ.s6} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
          </LineChart>
        </ChartCard>
      </div>

      {recovery.energyCurve.length > 0 && (
        <ChartCard
          title="Your energy through the day"
          subtitle="Average level at each time of day you have described"
          height={220}
          footnote="A consistent afternoon trough usually traces back to the previous night's sleep or a carb-heavy lunch."
        >
          <BarChart data={recovery.energyCurve} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="timeOfDay" {...axisProps} />
            <YAxis {...axisProps} width={34} domain={[0, 10]} />
            <Tooltip content={<VizTooltip dp={1} extra={(d) => (d ? [{ label: 'Observations', value: `${d.n}` }] : [])} />} />
            <Bar dataKey="avgLevel" name="Energy /10" fill={VIZ.s4} radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ChartCard>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {recovery.symptoms.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Symptoms</h3>
            <DataTable
              rows={recovery.symptoms}
              columns={[
                { key: 'name', header: 'Symptom', render: (r) => <span className="font-medium">{r.name}</span> },
                { key: 'n', header: 'Times', align: 'right', render: (r) => `${r.occurrences}` },
                { key: 'int', header: 'Avg intensity', align: 'right', render: (r) => `${r.avgIntensity}/10` },
                { key: 'last', header: 'Last', align: 'right', render: (r) => r.lastDate },
              ]}
            />
          </Card>
        )}

        {recovery.habits.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-4 text-sm font-semibold">Habit consistency</h3>
            <div className="space-y-3.5">
              {recovery.habits.map((h) => (
                <MeterRow
                  key={h.name}
                  label={h.name}
                  value={h.consistency}
                  max={100}
                  caption={`${h.consistency}% · ${h.done} done / ${h.skipped} skipped`}
                  color={h.consistency >= 80 ? VIZ.s3 : h.consistency >= 50 ? VIZ.s4 : VIZ.s2}
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      {recovery.emotions.length > 0 && (
        <>
          <SectionHeading title="What you felt most" hint="Count of mentions, with the average intensity you gave it." />
          <ChartCard
            title="Most-logged emotions"
            subtitle="Direct-labelled counts"
            height={Math.max(200, Math.min(10, recovery.emotions.length) * 30 + 40)}
          >
            <BarChart data={recovery.emotions.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 44, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...axisProps} hide allowDecimals={false} />
              <YAxis type="category" dataKey="feeling" {...axisProps} width={96} />
              <Tooltip content={<VizTooltip extra={(d) => (d ? [{ label: 'Avg intensity', value: `${d.avgIntensity}/10` }] : [])} />} />
              <Bar
                dataKey="count"
                name="Mentions"
                fill={VIZ.s5}
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                label={{ position: 'right', fontSize: 10, fill: VIZ.axis }}
              />
            </BarChart>
          </ChartCard>
        </>
      )}
    </div>
  )
}

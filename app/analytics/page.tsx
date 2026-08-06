'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/components/auth-provider'
import { getAnalytics } from '@/app/analytics-actions'
import { RANGE_LABELS, type AnalyticsPayload, type RangeKey } from '@/lib/analytics/types'
import { cn } from '@/lib/utils'
import { OverviewView } from '@/components/analytics/overview-view'
import { DiagnosticsView } from '@/components/analytics/diagnostics-view'
import { EnergyView } from '@/components/analytics/energy-view'
import { WeightView } from '@/components/analytics/weight-view'
import { NutritionView } from '@/components/analytics/nutrition-view'
import { TrainingView } from '@/components/analytics/training-view'
import { RecoveryView } from '@/components/analytics/recovery-view'
import { PatternsView } from '@/components/analytics/patterns-view'
import { DataView } from '@/components/analytics/data-view'
import { BarChart3, CalendarRange, Plus, RefreshCw } from 'lucide-react'

const PRESETS: RangeKey[] = ['7d', '14d', '30d', '60d', '90d', '180d', '365d', 'all']

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'why', label: 'Why' },
  { value: 'energy', label: 'Energy' },
  { value: 'weight', label: 'Weight' },
  { value: 'nutrition', label: 'Diet' },
  { value: 'training', label: 'Training' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'patterns', label: 'Patterns' },
  { value: 'data', label: 'Data' },
]

export default function AnalyticsPage() {
  const { profileId, isLoading: authLoading, profileLoading } = useAuth()
  const [range, setRange] = useState<RangeKey>('90d')
  const [custom, setCustom] = useState<{ start: string; end: string }>({ start: '', end: '' })
  const [customOpen, setCustomOpen] = useState(false)
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('overview')

  const load = useCallback(
    async (key: RangeKey, c?: { start: string; end: string }, isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await getAnalytics(key, key === 'custom' ? c : undefined)
        if (res.ok) setData(res.data)
        else setError(res.error)
      } catch (e) {
        console.error('[v0] analytics load failed:', e)
        setError(e instanceof Error ? e.message : 'Could not load analytics')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    []
  )

  useEffect(() => {
    if (authLoading || profileLoading) return
    if (!profileId) {
      setLoading(false)
      return
    }
    load(range, custom)
    // `custom` is applied explicitly via the Apply button, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, authLoading, profileLoading, range, load])

  const pickPreset = (key: RangeKey) => {
    setCustomOpen(false)
    setRange(key)
  }

  const applyCustom = () => {
    if (!custom.start || !custom.end) return
    setRange('custom')
    load('custom', custom)
  }

  const rangeCaption = useMemo(() => {
    if (!data) return ''
    const { start, end, days } = data.range
    const fmt = (iso: string) =>
      new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      })
    return `${fmt(start)} → ${fmt(end)} · ${days} days · ${data.summary.daysLogged} logged`
  }, [data])

  if (authLoading || profileLoading) {
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      </Shell>
    )
  }

  if (!profileId) {
    return (
      <Shell>
        <Card className="p-10 text-center">
          <p className="text-muted-foreground">Sign in to see your analytics.</p>
        </Card>
      </Shell>
    )
  }

  const hasData = data != null && data.meta.allTimeDaysLogged > 0

  return (
    <Shell>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <BarChart3 className="h-7 w-7 text-primary" />
            Analytics
          </h1>
          <p className="mt-1 text-muted-foreground">
            Every number you have logged, cross-examined — what is happening to your body and why
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(range, custom, true)}
          disabled={refreshing || loading}
        >
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </header>

      {/* ---- RANGE CONTROLS: one row above the charts ---- */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => pickPreset(key)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                range === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((o) => !o)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              range === 'custom'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Custom
          </button>
          {rangeCaption && (
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{rangeCaption}</span>
          )}
        </div>

        {customOpen && (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="text-xs">
              <span className="text-muted-foreground">From</span>
              <input
                type="date"
                value={custom.start}
                max={custom.end || undefined}
                onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
                className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">To</span>
              <input
                type="date"
                value={custom.end}
                min={custom.start || undefined}
                onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
                className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
              />
            </label>
            <Button size="sm" onClick={applyCustom} disabled={!custom.start || !custom.end}>
              Apply
            </Button>
            {data?.meta.allTimeFirstDate && (
              <span className="text-[11px] text-muted-foreground">
                Data starts {data.meta.allTimeFirstDate}
              </span>
            )}
          </div>
        )}
      </Card>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-24">
          <Spinner />
          <p className="text-xs text-muted-foreground">Crunching every entry…</p>
        </div>
      ) : error ? (
        <Card className="p-8 text-center space-y-3">
          <p className="font-medium">Could not build your analytics</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => load(range, custom)}>
            Try again
          </Button>
        </Card>
      ) : !hasData ? (
        <Card className="p-10 text-center space-y-4">
          <p className="font-medium">Nothing to analyse yet</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
            Analytics is built entirely from your daily entries. Log a few days — food, workouts and a morning
            weight — and this page fills with charts, correlations and a breakdown of exactly why the scale is
            moving the way it is.
          </p>
          <Link href="/add">
            <Button>
              <Plus className="mr-1.5 h-4 w-4" /> Add an entry
            </Button>
          </Link>
        </Card>
      ) : (
        data && (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            {/* Horizontal scroll so nine tabs work on a phone without wrapping. */}
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <TabsList className="w-max">
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs">
                    {t.label}
                    {t.value === 'why' && data.findings.some((f) => f.severity === 'critical') && (
                      <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-red-500" aria-label="critical findings" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-5 space-y-5">
              <OverviewView data={data} onJump={setTab} />
            </TabsContent>
            <TabsContent value="why" className="mt-5 space-y-5">
              <DiagnosticsView data={data} />
            </TabsContent>
            <TabsContent value="energy" className="mt-5 space-y-5">
              <EnergyView data={data} />
            </TabsContent>
            <TabsContent value="weight" className="mt-5 space-y-5">
              <WeightView data={data} />
            </TabsContent>
            <TabsContent value="nutrition" className="mt-5 space-y-5">
              <NutritionView data={data} />
            </TabsContent>
            <TabsContent value="training" className="mt-5 space-y-5">
              <TrainingView data={data} />
            </TabsContent>
            <TabsContent value="recovery" className="mt-5 space-y-5">
              <RecoveryView data={data} />
            </TabsContent>
            <TabsContent value="patterns" className="mt-5 space-y-5">
              <PatternsView data={data} />
            </TabsContent>
            <TabsContent value="data" className="mt-5 space-y-5">
              <DataView data={data} />
            </TabsContent>
          </Tabs>
        )
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Navigation />
      <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <div className="mx-auto max-w-6xl space-y-5">{children}</div>
      </main>
    </div>
  )
}

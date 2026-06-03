'use client'

import { Fragment, useEffect, useState } from 'react'
import { Navigation } from '@/components/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/components/auth-provider'
import { getTrainingLog, type TrainingDay } from '@/app/training-actions'
import type { Workout } from '@/lib/extraction-schema'
import { Dumbbell, Utensils, Flame, TrendingDown, TrendingUp, Sparkles } from 'lucide-react'

type Range = '7' | '30' | '90'

export default function TrainingPage() {
  const { profileId, isLoading: authLoading } = useAuth()
  const [range, setRange] = useState<Range>('7')
  const [days, setDays] = useState<TrainingDay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!profileId) {
      setLoading(false)
      return
    }
    setLoading(true)
    getTrainingLog(parseInt(range))
      .then(setDays)
      .finally(() => setLoading(false))
  }, [range, profileId, authLoading])

  const formatDay = (date: string) =>
    new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Training Log</h1>
              <p className="text-muted-foreground mt-1">Every day's workout & diet, in full detail</p>
            </div>
            <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
              <TabsList>
                <TabsTrigger value="7">Week</TabsTrigger>
                <TabsTrigger value="30">Month</TabsTrigger>
                <TabsTrigger value="90">Quarter</TabsTrigger>
              </TabsList>
            </Tabs>
          </header>

          {authLoading || loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : days.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              No entries in this range yet. Add one from <span className="font-medium">Add Entry</span>.
            </Card>
          ) : (
            days.map((day) => (
              <Card key={day.date} className="p-5 space-y-5">
                {/* Day header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-lg font-semibold">{formatDay(day.date)}</h2>
                  <div className="flex items-center gap-2">
                    {day.reflectionRating != null && (
                      <Badge variant="secondary">Day {day.reflectionRating}/10</Badge>
                    )}
                    {day.energyBalance?.status && (
                      <Badge
                        variant="outline"
                        className={
                          day.energyBalance.status === 'deficit'
                            ? 'text-emerald-600 border-emerald-300'
                            : day.energyBalance.status === 'surplus'
                              ? 'text-orange-600 border-orange-300'
                              : ''
                        }
                      >
                        {day.energyBalance.status === 'deficit' ? (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        ) : day.energyBalance.status === 'surplus' ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : null}
                        {day.energyBalance.status}
                        {typeof day.energyBalance.balance_kcal === 'number' &&
                          ` ${day.energyBalance.balance_kcal > 0 ? '+' : ''}${day.energyBalance.balance_kcal}`}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Workouts */}
                {day.workouts.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Dumbbell className="h-4 w-4" /> Workout · {day.workouts.length} exercises
                    </div>
                    {day.workouts.map((w, i) => (
                      <ExerciseBlock key={i} workout={w} />
                    ))}
                  </div>
                )}

                {/* Diet */}
                {day.nutrition.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Utensils className="h-4 w-4" /> Diet
                      </div>
                      {day.dailyTotals?.kcal != null && (
                        <div className="flex items-center gap-1 text-sm font-semibold">
                          <Flame className="h-3.5 w-3.5 text-orange-500" />
                          {day.dailyTotals.kcal} kcal
                          {day.dailyTotals.protein_g != null && (
                            <span className="text-muted-foreground font-normal">
                              {' '}· {day.dailyTotals.protein_g}P / {day.dailyTotals.carbs_g ?? '—'}C /{' '}
                              {day.dailyTotals.fat_g ?? '—'}F
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border divide-y">
                      {day.nutrition.map((n, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                          <span className="capitalize">
                            {n.item}
                            {n.portion && n.portion !== 'unspecified' && (
                              <span className="text-muted-foreground"> · {n.portion}</span>
                            )}
                            {n.meal_type && (
                              <span className="text-xs text-muted-foreground"> ({n.meal_type})</span>
                            )}
                          </span>
                          {n.est_kcal > 0 && <span className="text-muted-foreground tabular-nums">{n.est_kcal} kcal</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ChatGPT's analysis for the day */}
                {day.insights.length > 0 && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Sparkles className="h-4 w-4" /> Analysis
                    </div>
                    {day.insights.map((ins, i) => (
                      <p key={i} className="text-sm text-foreground/90">
                        {ins}
                      </p>
                    ))}
                  </div>
                )}

                {day.workouts.length === 0 && day.nutrition.length === 0 && day.insights.length === 0 && day.summary && (
                  <p className="text-sm text-muted-foreground">{day.summary}</p>
                )}
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  )
}

function ExerciseBlock({ workout: w }: { workout: Workout }) {
  const sets = w.set_log?.length
    ? w.set_log
    : w.weight_kg != null || w.reps != null
      ? [{ weight_kg: w.weight_kg, reps: w.reps, rpe_1_10: w.rpe_1_10 }]
      : []

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium capitalize">{w.exercise}</p>
        {w.muscles && w.muscles.length > 0 && (
          <p className="text-xs text-muted-foreground capitalize">{w.muscles.join(', ').replace(/_/g, ' ')}</p>
        )}
      </div>
      {sets.length > 0 ? (
        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-4 gap-y-1 text-sm">
          <span className="text-xs text-muted-foreground">Set</span>
          <span className="text-xs text-muted-foreground">Weight</span>
          <span className="text-xs text-muted-foreground">Reps</span>
          <span className="text-xs text-muted-foreground text-right">RPE</span>
          {sets.map((s, i) => (
            <Fragment key={i}>
              <span className="tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="tabular-nums font-medium">
                {s.weight_kg != null ? `${s.weight_kg} kg` : '—'}
                {s.assist_kg != null && (
                  <span className="text-muted-foreground font-normal"> (−{s.assist_kg} assist)</span>
                )}
              </span>
              <span className="tabular-nums">{s.reps ?? '—'}</span>
              <span className="tabular-nums text-right text-muted-foreground">{s.rpe_1_10 ?? '—'}</span>
            </Fragment>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{w.notes || 'Logged'}</p>
      )}
    </div>
  )
}

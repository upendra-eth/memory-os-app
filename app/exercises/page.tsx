'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/components/auth-provider'
import {
  getExerciseCatalog,
  getExerciseHistory,
  type ExerciseCatalogItem,
  type ExercisePoint,
} from '@/app/training-actions'
import { Dumbbell, TrendingUp, Trophy } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

export default function ExercisesPage() {
  const { profileId, isLoading: authLoading } = useAuth()
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([])
  const [selected, setSelected] = useState<string>('')
  const [history, setHistory] = useState<ExercisePoint[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Load the exercise catalog once
  useEffect(() => {
    if (authLoading) return
    if (!profileId) {
      setLoadingCatalog(false)
      return
    }
    getExerciseCatalog()
      .then((c) => {
        setCatalog(c)
        if (c.length > 0) setSelected(c[0].name)
      })
      .finally(() => setLoadingCatalog(false))
  }, [profileId, authLoading])

  // Load history when selection changes
  useEffect(() => {
    if (!selected) return
    setLoadingHistory(true)
    getExerciseHistory(selected)
      .then(setHistory)
      .finally(() => setLoadingHistory(false))
  }, [selected])

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })

  const last = history[history.length - 1]
  const best = history.reduce<ExercisePoint | null>(
    (b, p) => (p.topWeightKg != null && (!b || p.topWeightKg > (b.topWeightKg ?? 0)) ? p : b),
    null
  )
  const chartData = history
    .filter((p) => p.topWeightKg != null)
    .map((p) => ({ date: fmtDate(p.date), weight: p.topWeightKg, e1rm: p.estimated1RM }))

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Exercise Progress</h1>
            <p className="text-muted-foreground mt-1">
              Pick an exercise to see how much you lifted, date by date
            </p>
          </header>

          {authLoading || loadingCatalog ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : catalog.length === 0 ? (
            <Card className="p-10 text-center space-y-4">
              <p className="text-muted-foreground">
                No workouts logged yet. Add an entry with a workout to start tracking progress per exercise.
              </p>
              <Link href="/add"><Button>Add an entry</Button></Link>
            </Card>
          ) : (
            <>
              {/* Exercise picker */}
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="w-full md:w-80">
                  <SelectValue placeholder="Select an exercise" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((c) => (
                    <SelectItem key={c.name} value={c.name} className="capitalize">
                      {c.name} · {c.sessions}×
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {loadingHistory ? (
                <div className="flex justify-center py-12">
                  <Spinner />
                </div>
              ) : history.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">No history for this exercise.</Card>
              ) : (
                <>
                  {/* Highlight cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <HighlightCard
                      icon={<Dumbbell className="h-4 w-4" />}
                      label="Last lifted"
                      value={last?.topSet ? `${last.topSet.weight_kg ?? '—'} kg × ${last.topSet.reps ?? '—'}` : '—'}
                      sub={last ? fmtDate(last.date) : ''}
                      tint="text-cyan-600 bg-cyan-500/10"
                    />
                    <HighlightCard
                      icon={<Trophy className="h-4 w-4" />}
                      label="Heaviest"
                      value={best?.topWeightKg != null ? `${best.topWeightKg} kg` : '—'}
                      sub={best ? fmtDate(best.date) : ''}
                      tint="text-amber-600 bg-amber-500/10"
                    />
                    <HighlightCard
                      icon={<TrendingUp className="h-4 w-4" />}
                      label="Best est. 1RM"
                      value={
                        history.reduce((m, p) => Math.max(m, p.estimated1RM ?? 0), 0) > 0
                          ? `${history.reduce((m, p) => Math.max(m, p.estimated1RM ?? 0), 0)} kg`
                          : '—'
                      }
                      sub="Epley formula"
                      tint="text-emerald-600 bg-emerald-500/10"
                    />
                  </div>

                  {/* Progress chart */}
                  {chartData.length > 1 && (
                    <Card className="p-5">
                      <h3 className="text-sm font-semibold mb-4 capitalize">{selected} — top set weight over time</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="date" fontSize={12} />
                          <YAxis fontSize={12} unit="kg" />
                          <Tooltip />
                          <Line type="monotone" dataKey="weight" stroke="#14b8a6" name="Top set (kg)" strokeWidth={2} />
                          <Line
                            type="monotone"
                            dataKey="e1rm"
                            stroke="#94a3b8"
                            strokeDasharray="4 4"
                            name="Est. 1RM"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                  )}

                  {/* Date-wise table (most recent first) */}
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold mb-3">Session history</h3>
                    <div className="space-y-3">
                      {[...history].reverse().map((p, i) => (
                        <div key={i} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{fmtDate(p.date)}</span>
                            <div className="flex items-center gap-2 text-xs">
                              {p.topWeightKg != null && <Badge variant="secondary">top {p.topWeightKg} kg</Badge>}
                              {p.totalVolumeKg != null && (
                                <span className="text-muted-foreground">{p.totalVolumeKg} kg volume</span>
                              )}
                            </div>
                          </div>
                          {p.sets.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {p.sets.map((s, j) => (
                                <span
                                  key={j}
                                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums"
                                >
                                  {s.weight_kg != null ? `${s.weight_kg}kg` : 'BW'}
                                  {s.assist_kg != null && `−${s.assist_kg}`}
                                  {s.reps != null && ` × ${s.reps}`}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">{p.notes || 'Logged'}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function HighlightCard({
  icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tint: string
}) {
  return (
    <Card className="p-4">
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg mb-2 ${tint}`}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  )
}

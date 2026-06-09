'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/components/auth-provider'
import { getWorkoutBoard, type WorkoutBoard, type ExerciseLast } from '@/app/training-actions'
import type { WorkoutSet } from '@/lib/extraction-schema'
import { Dumbbell, Copy, Check, CalendarClock, ArrowRight } from 'lucide-react'

function fmtSets(sets: WorkoutSet[]): string {
  if (!sets.length) return ''
  return sets
    .map((s) => {
      const w = s.weight_kg != null ? `${s.weight_kg}kg` : 'BW'
      const a = s.assist_kg ? ` (−${s.assist_kg})` : ''
      const r = s.reps != null ? `×${s.reps}` : ''
      const rpe = s.rpe_1_10 ? ` @${s.rpe_1_10}` : ''
      return `${w}${a}${r}${rpe}`
    })
    .join(', ')
}

const niceDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** Match a planned exercise name to logged history (case-insensitive, then fuzzy). */
function findLast(name: string, map: Record<string, ExerciseLast>): ExerciseLast | null {
  const key = name.trim().toLowerCase()
  if (map[key]) return map[key]
  for (const k of Object.keys(map)) {
    if (k.includes(key) || key.includes(k)) return map[k]
  }
  return null
}

export default function WorkoutPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [board, setBoard] = useState<WorkoutBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    getWorkoutBoard().then((b) => {
      setBoard(b)
      const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
      const days = b.weekly || []
      const today = days.find((d) => d.day === todayName)
      // Default to today if it's a training day, else the first training day, else today.
      const firstTraining = days.find((d) => d.exercises?.length)
      setSelected((today?.exercises?.length ? today.day : firstTraining?.day) || todayName)
      setLoading(false)
    })
  }, [authLoading, user])

  const day = useMemo(() => board?.weekly?.find((d) => d.day === selected) || null, [board, selected])
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  const copyDay = async () => {
    if (!day || !board) return
    const lines = [`${day.day} · ${day.focus} — last progression`]
    for (const ex of day.exercises || []) {
      const last = findLast(ex.name, board.lastByExercise)
      lines.push(`${ex.name}: ${last && last.sets.length ? `${fmtSets(last.sets)} (${niceDate(last.date)})` : '— no history yet'}`)
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast({ title: 'Copied', description: 'Last progression for the whole day copied.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy manually.', variant: 'destructive' })
    }
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto space-y-5">
          <header className="flex items-start gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/25">
              <Dumbbell className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Today&apos;s Workout</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">Your split + exactly what you lifted last time, ready to beat.</p>
            </div>
          </header>

          {authLoading || loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !user ? (
            <Card className="p-10 text-center text-muted-foreground">Please sign in.</Card>
          ) : !board?.weekly ? (
            <Card className="p-8 text-center space-y-4">
              <p className="text-muted-foreground">No schedule yet. Create one with AI or paste your own in Plan.</p>
              <Link href="/plan"><Button>Set up your schedule <ArrowRight className="h-4 w-4 ml-1.5" /></Button></Link>
            </Card>
          ) : (
            <>
              {/* Day chips */}
              <div className="flex flex-wrap gap-1.5">
                {board.weekly.map((d) => {
                  const active = d.day === selected
                  const isToday = d.day === todayName
                  const rest = !d.exercises?.length
                  return (
                    <button
                      key={d.day}
                      onClick={() => setSelected(d.day)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        active ? 'border-primary bg-primary text-primary-foreground'
                        : rest ? 'border-input bg-background text-muted-foreground hover:bg-secondary'
                        : 'border-input bg-background hover:bg-secondary'
                      }`}
                    >
                      {d.day.slice(0, 3)}{isToday ? ' •' : ''}
                    </button>
                  )
                })}
              </div>

              {day && (
                <Card className="p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{day.day}</h2>
                      <Badge variant="secondary" className="capitalize">{day.focus}</Badge>
                      {day.day === todayName && <Badge className="bg-primary/15 text-primary" variant="secondary">Today</Badge>}
                    </div>
                    {day.exercises?.length > 0 && (
                      <Button size="sm" variant="outline" onClick={copyDay}>
                        {copied ? <Check className="h-4 w-4 mr-1.5 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1.5" />}
                        Copy day
                      </Button>
                    )}
                  </div>

                  {!day.exercises?.length ? (
                    <p className="text-sm text-muted-foreground">Rest &amp; recover. 💤</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {day.exercises.map((ex, i) => {
                        const last = board && findLast(ex.name, board.lastByExercise)
                        return (
                          <div key={i} className="py-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-medium">{ex.name}</span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">target {ex.sets}×{ex.reps}</span>
                            </div>
                            {last && last.sets.length ? (
                              <div className="mt-1 flex items-center gap-2 text-sm">
                                <CalendarClock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                <span className="font-medium text-foreground">{fmtSets(last.sets)}</span>
                                <span className="text-xs text-muted-foreground">· last on {niceDate(last.date)}</span>
                              </div>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">No history yet — log it today to start tracking.</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>
              )}

              <p className="text-center text-xs text-muted-foreground">
                “last” = the most recent session you actually did each move (skipped ones fall back to the time before).
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

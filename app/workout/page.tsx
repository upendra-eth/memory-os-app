'use client'

import { useEffect, useMemo, useState } from 'react'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/components/auth-provider'
import { getWorkoutBoard, type WorkoutBoard, type ExerciseLast } from '@/app/training-actions'
import type { WorkoutSet } from '@/lib/extraction-schema'
import { PlanSetup } from '@/components/plan-setup'
import { Dumbbell, Copy, Check, CalendarClock, Pencil, X } from 'lucide-react'

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

// Common gym abbreviations → canonical words, so a plan's "Incline DB Curl"
// matches a logged "Incline Dumbbell Curl" (the normalizer tends to expand
// these). Applied token-by-token after punctuation is stripped.
const EXERCISE_ABBREV: Record<string, string> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  sldl: 'stiff leg deadlift',
  bw: 'bodyweight',
  cg: 'close grip',
  wg: 'wide grip',
}

// Articles / filler that carry no matching signal.
const EXERCISE_STOP = new Set(['the', 'a', 'and', 'with', 'to', 'of'])

/** Lowercase, strip punctuation (-, /, _, …), collapse spaces, expand abbreviations. */
function normExercise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[/_\-,.()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => EXERCISE_ABBREV[w] || w)
    .join(' ')
}

function exerciseTokens(s: string): Set<string> {
  return new Set(normExercise(s).split(' ').filter((w) => w && !EXERCISE_STOP.has(w)))
}

/**
 * Match a planned exercise name to logged history. Layers, strongest first:
 *   1. exact match after normalization (handles DB↔Dumbbell, hyphens, etc.)
 *   2. substring containment ("Lat Pulldown" ⊂ "Lat Pulldown / Pull-ups")
 *   3. token-subset ("Pec Deck" ⊆ "Reverse Pec Deck") with ≥2 shared tokens
 *   4. Jaccard overlap ≥ 0.6 as a last resort
 * The 0.6 floor is deliberately conservative so e.g. "Incline DB Curl" never
 * collapses onto "Hammer Curl" just because both contain "curl".
 */
function findLast(name: string, map: Record<string, ExerciseLast>): ExerciseLast | null {
  const target = normExercise(name)
  const tTok = exerciseTokens(name)
  let best: ExerciseLast | null = null
  let bestScore = 0

  for (const k of Object.keys(map)) {
    const cand = normExercise(k)
    let score = 0

    if (cand === target) {
      score = 1
    } else if (target && cand && (cand.includes(target) || target.includes(cand))) {
      score = 0.9
    } else {
      const cTok = exerciseTokens(k)
      const shared = [...tTok].filter((t) => cTok.has(t)).length
      const smaller = Math.min(tTok.size, cTok.size)
      if (smaller >= 2 && shared === smaller) {
        score = 0.85
      } else {
        const union = new Set([...tTok, ...cTok]).size
        const jaccard = union ? shared / union : 0
        if (jaccard >= 0.6) score = jaccard
      }
    }

    // Strongest match wins; ties break toward the most recent session.
    if (score > bestScore || (score > 0 && score === bestScore && best && map[k].date > best.date)) {
      bestScore = score
      best = map[k]
    }
  }

  return bestScore >= 0.6 ? best : null
}

export default function WorkoutPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [board, setBoard] = useState<WorkoutBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const { toast } = useToast()

  const pickDefaultDay = (b: WorkoutBoard) => {
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    const days = b.weekly || []
    const today = days.find((d) => d.day === todayName)
    const firstTraining = days.find((d) => d.exercises?.length)
    setSelected((today?.exercises?.length ? today.day : firstTraining?.day) || todayName)
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    getWorkoutBoard().then((b) => {
      setBoard(b)
      pickDefaultDay(b)
      setLoading(false)
    })
  }, [authLoading, user])

  // After saving a new/updated plan, reload the board so last-progression re-binds.
  const reloadAfterSave = async () => {
    setEditing(false)
    setLoading(true)
    const b = await getWorkoutBoard()
    setBoard(b)
    pickDefaultDay(b)
    setLoading(false)
  }

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
            <div className="flex-1">
              <h1 className="text-3xl font-bold tracking-tight">Today&apos;s Workout</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">Your split + exactly what you lifted last time, ready to beat.</p>
            </div>
            {board?.weekly && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="flex-shrink-0">
                <Pencil className="h-4 w-4 md:mr-1.5" /><span className="hidden md:inline">Edit plan</span>
              </Button>
            )}
          </header>

          {authLoading || loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !user ? (
            <Card className="p-10 text-center text-muted-foreground">Please sign in.</Card>
          ) : editing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {board?.weekly ? 'Update your plan' : 'Set up your plan'}
                </h2>
                {board?.weekly && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
                )}
              </div>
              <PlanSetup onSaved={reloadAfterSave} />
            </div>
          ) : !board?.weekly ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No schedule yet — let AI build one from your goals, or paste a plan you already have.</p>
              <PlanSetup onSaved={reloadAfterSave} />
            </div>
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

'use server'

import { createClient } from '@/lib/supabase/server'
import type { ExtractedJSON, Workout, Nutrition, WorkoutSet, DailyTotals, EnergyBalance } from '@/lib/extraction-schema'

async function getAuthProfileId(): Promise<{ userId: string; supabase: any } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return null
  return { userId: profile.id, supabase }
}

/** The calendar date an entry is ABOUT: the captured log_date, else its save date. */
function effectiveDate(extracted: ExtractedJSON | undefined, createdAt: string): string {
  return extracted?.log_date || createdAt.slice(0, 10)
}

// ---------------------------------------------------------------------------
// Training log — diet + workouts in full detail, grouped by day
// ---------------------------------------------------------------------------

export interface TrainingDay {
  date: string
  workouts: Workout[]
  nutrition: Nutrition[]
  dailyTotals?: DailyTotals
  energyBalance?: EnergyBalance
  reflectionRating?: number
  insights: string[]
  summary?: string
}

export async function getTrainingLog(rangeDays = 90): Promise<TrainingDay[]> {
  const auth = await getAuthProfileId()
  if (!auth) return []

  const since = new Date()
  since.setDate(since.getDate() - rangeDays)

  const { data: entries, error } = await auth.supabase
    .from('entries')
    .select('extracted_json, summary, created_at')
    .eq('user_id', auth.userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  if (error || !entries) return []

  // Merge multiple entries that share the same effective date.
  const byDate = new Map<string, TrainingDay>()
  for (const e of entries) {
    const ex = (e.extracted_json as ExtractedJSON) || {}
    const date = effectiveDate(ex, e.created_at)
    const day =
      byDate.get(date) ||
      ({ date, workouts: [], nutrition: [], insights: [] } as TrainingDay)

    if (ex.workouts?.length) day.workouts.push(...ex.workouts)
    if (ex.nutrition?.length) day.nutrition.push(...ex.nutrition)
    if (ex.daily_totals && !day.dailyTotals) day.dailyTotals = ex.daily_totals
    if (ex.energy_balance && !day.energyBalance) day.energyBalance = ex.energy_balance
    if (ex.reflection?.rating_1_10 && day.reflectionRating == null) day.reflectionRating = ex.reflection.rating_1_10
    if (ex.cognition?.insights?.length) day.insights.push(...ex.cognition.insights)
    if (!day.summary && e.summary) day.summary = e.summary

    byDate.set(date, day)
  }

  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
}

// ---------------------------------------------------------------------------
// Per-exercise progress — track weights lifted over time
// ---------------------------------------------------------------------------

export interface ExerciseCatalogItem {
  name: string
  sessions: number
  lastDate: string
}

export interface ExercisePoint {
  date: string
  sets: WorkoutSet[]
  topWeightKg: number | null
  topSet: WorkoutSet | null
  totalVolumeKg: number | null
  estimated1RM: number | null
  notes?: string
}

const epley1RM = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30))

/** Scan all entries and return every exercise that has logged data, most-recent first. */
export async function getExerciseCatalog(): Promise<ExerciseCatalogItem[]> {
  const auth = await getAuthProfileId()
  if (!auth) return []

  const { data: entries } = await auth.supabase
    .from('entries')
    .select('extracted_json, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })

  if (!entries) return []

  const map = new Map<string, ExerciseCatalogItem>()
  for (const e of entries) {
    const ex = (e.extracted_json as ExtractedJSON) || {}
    const date = effectiveDate(ex, e.created_at)
    for (const w of ex.workouts || []) {
      const key = w.exercise.trim().toLowerCase()
      if (!key) continue
      const existing = map.get(key)
      if (existing) {
        existing.sessions += 1
        if (date > existing.lastDate) existing.lastDate = date
      } else {
        map.set(key, { name: w.exercise.trim(), sessions: 1, lastDate: date })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1))
}

/** Date-wise progression for a single exercise (matched case-insensitively). */
export async function getExerciseHistory(exerciseName: string): Promise<ExercisePoint[]> {
  const auth = await getAuthProfileId()
  if (!auth || !exerciseName.trim()) return []
  const target = exerciseName.trim().toLowerCase()

  const { data: entries } = await auth.supabase
    .from('entries')
    .select('extracted_json, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: true })

  if (!entries) return []

  const points: ExercisePoint[] = []
  for (const e of entries) {
    const ex = (e.extracted_json as ExtractedJSON) || {}
    const date = effectiveDate(ex, e.created_at)
    for (const w of ex.workouts || []) {
      if (w.exercise.trim().toLowerCase() !== target) continue

      const sets: WorkoutSet[] = w.set_log?.length
        ? w.set_log
        : // Fall back to the summary set if no per-set log was captured
          w.weight_kg != null || w.reps != null
          ? [{ weight_kg: w.weight_kg, reps: w.reps, rpe_1_10: w.rpe_1_10 }]
          : []

      const weighted = sets.filter((s) => typeof s.weight_kg === 'number')
      const topSet =
        weighted.length > 0
          ? weighted.reduce((b, s) => ((s.weight_kg as number) > (b.weight_kg as number) ? s : b))
          : null
      const topWeightKg = topSet ? (topSet.weight_kg as number) : null
      const totalVolumeKg = weighted.reduce((sum, s) => sum + (s.weight_kg as number) * (s.reps || 0), 0)
      const estimated1RM =
        topSet && topSet.weight_kg && topSet.reps ? epley1RM(topSet.weight_kg, topSet.reps) : null

      points.push({
        date,
        sets,
        topWeightKg,
        topSet,
        totalVolumeKg: totalVolumeKg > 0 ? Math.round(totalVolumeKg) : null,
        estimated1RM,
        notes: w.notes,
      })
    }
  }

  // One point per session, oldest → newest (good for charting progress)
  return points
}

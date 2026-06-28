'use server'

import { createClient } from '@/lib/supabase/server'
import type { ExtractedJSON, Workout, Nutrition, WorkoutSet, DailyTotals, EnergyBalance } from '@/lib/extraction-schema'
import type { PlanDay } from '@/lib/prompts/plan'

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

// ---------------------------------------------------------------------------
// Workout board — your schedule for a day + the LAST time you did each exercise
// (most-recent logged set_log per exercise, so a skipped exercise falls back to
// the previous session it appeared in). Powers the /workout daily view.
// ---------------------------------------------------------------------------

export interface ExerciseLast {
  exercise: string
  date: string
  sets: WorkoutSet[]
  /** Summary set count when no per-set log was captured (e.g. "3 sets"). */
  setsCount?: number
  /** Time-based moves (planks, holds, carries) log duration instead of load. */
  durationMin?: number
}

export interface WorkoutBoard {
  weekly: PlanDay[] | null
  // key = exercise name (lowercased). Value = every logged session of that name,
  // newest-first. The /workout page merges variant names ("Face Pull" /
  // "Face Pulls") at match time and surfaces the most recent sessions.
  lastByExercise: Record<string, ExerciseLast[]>
}

export async function getWorkoutBoard(): Promise<WorkoutBoard> {
  const auth = await getAuthProfileId()
  if (!auth) return { weekly: null, lastByExercise: {} }
  const { userId, supabase } = auth

  const [planRes, entriesRes] = await Promise.all([
    supabase
      .from('exercise_plans')
      .select('plan')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('entries')
      .select('extracted_json, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(150),
  ])

  const weekly = (planRes.data?.plan?.weekly as PlanDay[]) ?? null

  // Entries are newest-first, so each name's list comes out newest-first too.
  // We keep ALL sessions (not just the latest) so the UI can show the last two
  // workouts per exercise and the user sees their real progression.
  const lastByExercise: Record<string, ExerciseLast[]> = {}
  for (const e of entriesRes.data || []) {
    const ex = (e.extracted_json as ExtractedJSON) || {}
    const date = effectiveDate(ex, e.created_at)
    for (const w of ex.workouts || []) {
      if (!w.exercise) continue
      const key = w.exercise.trim().toLowerCase()
      const sets: WorkoutSet[] =
        w.set_log && w.set_log.length
          ? w.set_log
          : w.weight_kg != null || w.reps != null
            ? [{ weight_kg: w.weight_kg, reps: w.reps, rpe_1_10: w.rpe_1_10 }]
            : []
      ;(lastByExercise[key] ||= []).push({
        exercise: w.exercise.trim(),
        date,
        sets,
        setsCount: w.sets ?? undefined,
        durationMin: w.duration_min ?? undefined,
      })
    }
  }

  return { weekly, lastByExercise }
}

// ---------------------------------------------------------------------------
// Manual workout entry — add a missing result, or correct one that was logged
// wrong / mis-parsed. Writes straight into entries.extracted_json.workouts[]
// so the board, day view and progress charts all pick it up immediately.
// (daily_aggregates is nutrition/energy-focused and is not recomputed here.)
// ---------------------------------------------------------------------------

export interface ManualWorkoutInput {
  exercise: string
  /** Effective date (YYYY-MM-DD). For an edit, the date the record is on; for
   *  an add, the day you did it (defaults to today on the client). */
  date: string
  sets?: number | null
  reps?: number | null
  weightKg?: number | null
  durationMin?: number | null
  rpe?: number | null
}

const cleanNum = (v: number | null | undefined): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

export async function saveManualWorkout(
  input: ManualWorkoutInput,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuthProfileId()
  if (!auth) return { ok: false, error: 'Not signed in.' }
  const { userId, supabase } = auth

  const exercise = input.exercise.trim()
  if (!exercise) return { ok: false, error: 'Exercise name is required.' }
  const date = input.date?.slice(0, 10)
  if (!date) return { ok: false, error: 'A date is required.' }

  // Build the workout from whatever the user provided. A manual record carries
  // only summary fields (no per-set log); the board reads weight/reps/duration
  // directly so this renders fine for both strength and time-based moves.
  const fields: Partial<Workout> = {
    sets: cleanNum(input.sets),
    reps: cleanNum(input.reps),
    weight_kg: cleanNum(input.weightKg),
    duration_min: cleanNum(input.durationMin),
    rpe_1_10: cleanNum(input.rpe),
  }
  const hasAnyValue = Object.values(fields).some((v) => v !== undefined)
  if (!hasAnyValue) return { ok: false, error: 'Enter at least one value (sets, reps, weight or duration).' }

  // Pull recent entries and locate the one on the target date that already
  // holds this exercise (an edit), else any entry on that date (append).
  const { data: rows, error: readErr } = await supabase
    .from('entries')
    .select('id, extracted_json, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (readErr) return { ok: false, error: 'Could not load your entries.' }

  const onDate = (rows || []).filter(
    (r: any) => effectiveDate(r.extracted_json as ExtractedJSON, r.created_at) === date,
  )
  const norm = (s: string) => s.trim().toLowerCase()

  // Prefer the entry that already contains this exercise on that date.
  const target: any = onDate.find((r: any) =>
    ((r.extracted_json as ExtractedJSON)?.workouts || []).some((w) => w.exercise && norm(w.exercise) === norm(exercise)),
  )

  if (target) {
    const ex = (target.extracted_json as ExtractedJSON) || {}
    const workouts = (ex.workouts || []).map((w) =>
      w.exercise && norm(w.exercise) === norm(exercise)
        ? // Overwrite the summary fields the user edited; clear any stale
          // per-set log so the corrected summary is what shows.
          { ...w, exercise, ...fields, set_log: undefined }
        : w,
    )
    const { error } = await supabase
      .from('entries')
      .update({ extracted_json: { ...ex, workouts }, updated_at: new Date().toISOString() })
      .eq('id', target.id)
    return error ? { ok: false, error: 'Save failed.' } : { ok: true }
  }

  const workout: Workout = { exercise, ...fields }

  // No matching exercise — append to an existing entry on that date if there
  // is one, otherwise create a fresh minimal entry for the date.
  if (onDate.length) {
    const row = onDate[0]
    const ex = (row.extracted_json as ExtractedJSON) || {}
    const { error } = await supabase
      .from('entries')
      .update({
        extracted_json: { ...ex, workouts: [...(ex.workouts || []), workout] },
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    return error ? { ok: false, error: 'Save failed.' } : { ok: true }
  }

  const text = `Manual workout: ${exercise}`
  const { error } = await supabase.from('entries').insert({
    user_id: userId,
    raw_text: text,
    normalized_text: text,
    narrative_text: text,
    extracted_json: { log_date: date, workouts: [workout] } as ExtractedJSON,
    summary: text,
    embedding: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  return error ? { ok: false, error: 'Save failed.' } : { ok: true }
}

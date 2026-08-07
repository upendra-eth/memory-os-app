/**
 * Post-save side effects for an entry: the canonical entity list and the
 * per-day aggregate row.
 *
 * These live outside [app/entry-actions.ts](../app/entry-actions.ts) — which is
 * a `'use server'` module, where every export becomes a callable server action —
 * so they can take a `userId` argument without exposing an endpoint that trusts
 * it, and so they can be exercised directly against a database in a script.
 *
 * WHY THEY DON'T USE `upsert`
 * ---------------------------
 * Both writes used to be `upsert(..., { onConflict: [...] })`, which needs a
 * matching UNIQUE constraint. On a project whose tables predate the current
 * base-schema those constraints were never created (see
 * supabase/sql/fix-schema-drift.sql), so PostgREST rejected every write with
 * 42P10 — and because the callers wrapped these in a bare try/catch that only
 * logged, entries kept saving while trends and entities stayed permanently
 * empty. An empty `entities` table is the worse half: `getKnownEntities()` feeds
 * the normalizer the canonical names to reuse, so with nothing there the model
 * invents a fresh spelling of every food and exercise on every entry.
 *
 * So: read first, then update-or-insert. That works with or without the
 * constraints, and the unique-violation branch keeps it correct once they exist.
 */

import type { ExtractedJSON } from '@/lib/extraction-schema'

/** Postgres unique-violation — the constraint exists and someone else won the race. */
const UNIQUE_VIOLATION = '23505'
/** Postgres check-violation — a value is outside a CHECK constraint's range. */
const CHECK_VIOLATION = '23514'

/**
 * The 1-10 subjective scales. Legacy `daily_aggregates` tables carry CHECK
 * constraints pinning these to 1-5, from a schema version that used a 5-point
 * scale; the app has since standardised on 1-10 (`sleep_quality_1_10`,
 * `intensity_1_10`, `stress_1_10`). Rather than lose the whole row — including
 * the day's calories and training, which is what actually gets charted — a
 * check violation retries with these nulled. Null reads as "not recorded",
 * which is true; clamping 9 down to 5 would store a number the user never gave.
 */
const SCALE_COLUMNS = ['mood_score', 'sleep_quality', 'stress_level'] as const

const CHECK_HINT =
  'run supabase/sql/fix-schema-drift.sql to widen the 1-5 CHECK constraints to 1-10'

type Supabase = any

/** Calorie/macro contribution of a single entry (its own day-totals, else summed items). */
export function entryNutrition(ex: ExtractedJSON) {
  const sumItems = (key: 'est_kcal' | 'protein_g' | 'carbs_g' | 'fat_g') =>
    ex.nutrition?.reduce((s, n) => s + (n[key] || 0), 0) || 0
  return {
    kcal: ex.daily_totals?.kcal ?? ex.energy_balance?.intake_kcal ?? sumItems('est_kcal'),
    protein: ex.daily_totals?.protein_g ?? sumItems('protein_g'),
    carbs: ex.daily_totals?.carbs_g ?? sumItems('carbs_g'),
    fat: ex.daily_totals?.fat_g ?? sumItems('fat_g'),
  }
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Record any entity names in this entry that the user doesn't have yet.
 *
 * Two queries: read the names we're about to touch, batch-insert the new ones.
 * `mention_count` is deliberately not written — nothing in the app reads it, and
 * the column is absent on legacy schemas. The DB default fills it in where it
 * does exist.
 */
export async function recordEntities(
  userId: string,
  entities: ExtractedJSON['entities'],
  supabase: Supabase
): Promise<{ inserted: number }> {
  if (!entities) return { inserted: 0 }

  const wanted = new Map<string, { entity_type: string; entity_name: string }>()
  const collect = (names: string[] | undefined, entity_type: string) => {
    for (const raw of names || []) {
      const entity_name = raw?.trim()
      if (!entity_name) continue
      wanted.set(`${entity_type}::${entity_name.toLowerCase()}`, { entity_type, entity_name })
    }
  }
  collect(entities.people, 'person')
  collect(entities.foods, 'food')
  collect(entities.exercises, 'exercise')
  collect(entities.places, 'place')

  if (wanted.size === 0) return { inserted: 0 }

  const { data: existing, error: readError } = await supabase
    .from('entities')
    .select('entity_type, entity_name')
    .eq('user_id', userId)
    .in(
      'entity_name',
      Array.from(wanted.values()).map((e) => e.entity_name)
    )

  if (readError) {
    console.error('[v0] entities: read failed, skipping entity sync:', readError.message)
    return { inserted: 0 }
  }

  // Compare case-insensitively so "Chicken Breast" and "chicken breast" don't
  // both get stored; the first spelling the user logged stays canonical.
  const have = new Set(
    (existing || []).map((e: any) => `${e.entity_type}::${String(e.entity_name).toLowerCase()}`)
  )
  const toInsert = Array.from(wanted.entries())
    .filter(([key]) => !have.has(key))
    .map(([, e]) => ({ user_id: userId, ...e }))

  if (toInsert.length === 0) return { inserted: 0 }

  const { error: insertError } = await supabase.from('entities').insert(toInsert)
  if (!insertError) return { inserted: toInsert.length }

  // A unique violation means the constraint exists and a concurrent save got
  // there first. Retry one at a time so one collision can't drop the batch.
  if (insertError.code === UNIQUE_VIOLATION) {
    let inserted = 0
    for (const row of toInsert) {
      const { error } = await supabase.from('entities').insert(row)
      if (!error) inserted += 1
      else if (error.code !== UNIQUE_VIOLATION)
        console.error(`[v0] entities: insert failed for "${row.entity_name}":`, error.message)
    }
    return { inserted }
  }

  console.error('[v0] entities: batch insert failed:', insertError.message)
  return { inserted: 0 }
}

// ---------------------------------------------------------------------------
// Daily aggregates
// ---------------------------------------------------------------------------

export interface DailyAggregateRow {
  user_id: string
  log_date: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  sleep_hours: number | null
  sleep_quality: number | null
  mood_score: number | null
  stress_level: number | null
  workouts_count: number
  workout_duration_min: number | null
}

/**
 * Roll a day's entries into one aggregate row.
 *
 * Nutrition and training SUM across the day's entries; point-in-time states
 * (sleep) take the highest value logged; mood and stress are averaged. Pure —
 * given the same entries it always produces the same row.
 */
export function buildDailyAggregate(
  userId: string,
  logDate: string,
  dayEntries: ExtractedJSON[]
): DailyAggregateRow | null {
  if (dayEntries.length === 0) return null

  let kcal = 0
  let protein = 0
  let carbs = 0
  let fat = 0
  let workoutCount = 0
  let workoutMin = 0
  let sleepH: number | null = null
  let sleepQ: number | null = null
  const moods: number[] = []
  const stresses: number[] = []

  for (const ex of dayEntries) {
    const n = entryNutrition(ex)
    kcal += n.kcal
    protein += n.protein
    carbs += n.carbs
    fat += n.fat
    workoutCount += (ex.workouts?.length || 0) + (ex.cardio?.length || 0)
    workoutMin +=
      (ex.workouts?.reduce((s, w) => s + (w.duration_min || 0), 0) || 0) +
      (ex.cardio?.reduce((s, c) => s + (c.duration_min || 0), 0) || 0)
    if (ex.body?.sleep_hours != null) sleepH = Math.max(sleepH ?? 0, ex.body.sleep_hours)
    if (ex.body?.sleep_quality_1_10 != null) sleepQ = Math.max(sleepQ ?? 0, ex.body.sleep_quality_1_10)
    if (ex.emotions?.length)
      moods.push(ex.emotions.reduce((s, e) => s + e.intensity_1_10, 0) / ex.emotions.length)
    if (ex.mental?.stress_1_10 != null) stresses.push(ex.mental.stress_1_10)
  }

  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null)

  return {
    user_id: userId,
    log_date: logDate,
    calories: kcal > 0 ? Math.round(kcal) : null,
    protein_g: protein > 0 ? Math.round(protein) : null,
    carbs_g: carbs > 0 ? Math.round(carbs) : null,
    fat_g: fat > 0 ? Math.round(fat) : null,
    sleep_hours: sleepH,
    sleep_quality: sleepQ,
    mood_score: avg(moods),
    stress_level: avg(stresses),
    workouts_count: workoutCount,
    workout_duration_min: workoutMin > 0 ? Math.round(workoutMin) : null,
  }
}

/** Copy of the row with the subjective 1-10 scales dropped. */
function withoutScales(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload }
  for (const col of SCALE_COLUMNS) out[col] = null
  return out
}

/**
 * Write one aggregate row, updating in place when the day already has one.
 *
 * Deliberately read-then-write instead of `upsert`, so it needs no UNIQUE
 * constraint; the unique-violation branch handles the case where one exists and
 * a concurrent save won the race.
 */
export async function writeDailyAggregate(
  row: DailyAggregateRow,
  supabase: Supabase
): Promise<'inserted' | 'updated' | 'partial' | 'failed'> {
  const { data: existing, error: readError } = await supabase
    .from('daily_aggregates')
    .select('id')
    .eq('user_id', row.user_id)
    .eq('log_date', row.log_date)
    .maybeSingle()

  if (readError) {
    console.error(`[v0] daily_aggregates: read failed for ${row.log_date}:`, readError.message)
    return 'failed'
  }

  const payload: Record<string, unknown> = { ...row, updated_at: new Date().toISOString() }

  /** Run a write, retrying without the 1-10 scales if a CHECK constraint rejects them. */
  const attempt = async (
    write: (body: Record<string, unknown>) => Promise<{ error: { code?: string; message: string } | null }>,
    success: 'inserted' | 'updated'
  ): Promise<'inserted' | 'updated' | 'partial' | 'failed' | typeof RETRY_UNIQUE> => {
    const { error } = await write(payload)
    if (!error) return success
    if (error.code === UNIQUE_VIOLATION) return RETRY_UNIQUE
    if (error.code === CHECK_VIOLATION) {
      const { error: retryError } = await write(withoutScales(payload))
      if (!retryError) {
        console.warn(
          `[v0] daily_aggregates: ${row.log_date} stored without mood/sleep-quality/stress — the table still has 1-5 CHECK constraints (${CHECK_HINT})`
        )
        return 'partial'
      }
      console.error(`[v0] daily_aggregates: retry without scales failed for ${row.log_date}:`, retryError.message)
      return 'failed'
    }
    console.error(`[v0] daily_aggregates: write failed for ${row.log_date}:`, error.message)
    return 'failed'
  }

  if (existing?.id) {
    const result = await attempt(
      (body) => supabase.from('daily_aggregates').update(body).eq('id', existing.id),
      'updated'
    )
    return result === RETRY_UNIQUE ? 'failed' : result
  }

  const inserted = await attempt((body) => supabase.from('daily_aggregates').insert(body), 'inserted')
  if (inserted !== RETRY_UNIQUE) return inserted

  // Constraint present + a concurrent save inserted first: switch to updating it.
  const updated = await attempt(
    (body) =>
      supabase.from('daily_aggregates').update(body).eq('user_id', row.user_id).eq('log_date', row.log_date),
    'updated'
  )
  return updated === RETRY_UNIQUE ? 'failed' : updated
}

/** Sentinel: the write hit a unique violation and the caller should switch to updating. */
const RETRY_UNIQUE = 'retry-unique' as const

/**
 * Recompute a day's aggregate row from EVERY entry on that date.
 *
 * Rebuilding from all same-day entries means logging a day in pieces (half in
 * the morning, the rest at night) accumulates instead of the last paste
 * clobbering the row. Idempotent: re-running yields the same totals.
 */
export async function recomputeDailyAggregate(
  userId: string,
  effectiveDate: string,
  supabase: Supabase
): Promise<'inserted' | 'updated' | 'partial' | 'failed' | 'no-entries'> {
  // Pull a ±1 day window by created_at, then match on the true effective date
  // in JS (robust to the created_at/log_date timezone gap).
  const from = new Date(`${effectiveDate}T00:00:00.000Z`)
  from.setUTCDate(from.getUTCDate() - 1)
  const to = new Date(`${effectiveDate}T00:00:00.000Z`)
  to.setUTCDate(to.getUTCDate() + 2)

  const { data: rows, error } = await supabase
    .from('entries')
    .select('extracted_json, created_at')
    .eq('user_id', userId)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())

  if (error) {
    console.error(`[v0] daily_aggregates: entry read failed for ${effectiveDate}:`, error.message)
    return 'failed'
  }

  const dayEntries: ExtractedJSON[] = (rows || [])
    .filter(
      (r: any) =>
        ((r.extracted_json as ExtractedJSON)?.log_date || r.created_at.slice(0, 10)) === effectiveDate
    )
    .map((r: any) => (r.extracted_json as ExtractedJSON) || {})

  const aggregate = buildDailyAggregate(userId, effectiveDate, dayEntries)
  if (!aggregate) return 'no-entries'

  return writeDailyAggregate(aggregate, supabase)
}

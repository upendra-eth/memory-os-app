'use server'

/**
 * Manage weigh-in entries directly — list every one, correct a date, or delete
 * a stray duplicate.
 *
 * Weight lives inside `entries.extracted_json.body.weight_today_kg`, and an
 * entry can carry a full day of other data alongside it (workouts, food,
 * mood…). That means "delete this weigh-in" is only safe when the entry
 * contains NOTHING else — deleting a rich entry to fix one number would erase
 * everything else logged that day. `isWeightOnlyEntry()` draws that line, and
 * every mutation here re-checks it server-side rather than trusting the client.
 */

import { createClient } from '@/lib/supabase/server'
import type { ExtractedJSON } from '@/lib/extraction-schema'
import { quickLogWeight } from '@/app/entry-actions'

async function getAuthProfileId(): Promise<{ userId: string; supabase: any } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return null
  return { userId: profile.id, supabase }
}

/**
 * True when a value carries no real content: null/undefined, an array that's
 * empty (or all-empty), or an object whose every value is itself empty.
 *
 * The sanitizer that runs on every save (`sanitizeExtractedJSON`) always fills
 * in placeholder empty arrays — `nutrition: []`, `body.energy_curve: []` and
 * so on — even on an entry that only ever set one field. The shared
 * `isEmptyExtractedJSON` helper in lib/extraction-schema.ts checks emptiness
 * one level deep only (an object with one key, even `energy_curve: []`,
 * already reads as "has content" to it), which is fine for its own purpose
 * but wrongly marks a weight-only entry as non-empty here. This checks all
 * the way down instead, which is what "is there really nothing else here"
 * requires.
 */
function isDeepEmpty(v: unknown): boolean {
  if (v == null) return true
  if (Array.isArray(v)) return v.every(isDeepEmpty)
  if (typeof v === 'object') return Object.values(v).every(isDeepEmpty)
  return false // a primitive (string, number, boolean) is real content, even 0 or ''
}

/** True when the entry's only content is the weight reading — safe to hard-delete. */
function isWeightOnlyEntry(ex: ExtractedJSON): boolean {
  if (ex.body?.weight_today_kg == null) return false
  const rest: Record<string, unknown> = { ...ex, body: { ...ex.body } }
  delete (rest.body as Record<string, unknown>).weight_today_kg
  delete rest.log_date
  return isDeepEmpty(rest)
}

export interface WeightEntryRow {
  id: string
  date: string
  weightKg: number
  updatedAt: string
  /** True for the entry that wins for its date under the engine's last-edit-wins rule. */
  isEffective: boolean
  /** True when deleting this entry would only remove the weight reading (no other data). */
  deletable: boolean
}

/**
 * Every weigh-in, most recent date first. Entries are ordered by `updated_at`
 * — the real save instant — because that's the exact signal the analytics
 * engine uses to decide which entry "wins" for a date with more than one
 * reading, and this list needs to agree with it or "which one is effective"
 * would be a guess.
 */
export async function listWeightEntries(): Promise<WeightEntryRow[]> {
  const auth = await getAuthProfileId()
  if (!auth) return []

  const { data: rows, error } = await auth.supabase
    .from('entries')
    .select('id, extracted_json, created_at, updated_at')
    .eq('user_id', auth.userId)
    .order('updated_at', { ascending: true })

  if (error || !rows) {
    console.error('[v0] listWeightEntries failed:', error?.message)
    return []
  }

  const withWeight = rows.filter((r: any) => r.extracted_json?.body?.weight_today_kg != null)

  // Effective = the last (by updated_at, which is the array order here) entry
  // for its date — mirrors buildDays()'s "last non-null wins" exactly.
  const lastIndexForDate = new Map<string, number>()
  withWeight.forEach((r: any, i: number) => {
    const date = r.extracted_json?.log_date || r.created_at.slice(0, 10)
    lastIndexForDate.set(date, i)
  })

  const out: WeightEntryRow[] = withWeight.map((r: any, i: number) => {
    const date = r.extracted_json?.log_date || r.created_at.slice(0, 10)
    return {
      id: r.id,
      date,
      weightKg: r.extracted_json.body.weight_today_kg,
      updatedAt: r.updated_at,
      isEffective: lastIndexForDate.get(date) === i,
      deletable: isWeightOnlyEntry(r.extracted_json),
    }
  })

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.updatedAt < b.updatedAt ? 1 : -1))
}

/**
 * Correct a date's weight — just logs a fresh weight-only entry for it. This is
 * deliberately append-only, same as the quick-log widget: it never rewrites an
 * existing row, so it can never corrupt an entry that also holds other data.
 * The newest save wins per the engine's last-edit-wins rule.
 */
export async function correctWeightEntry(
  date: string,
  weightKg: number
): Promise<{ success: boolean; error?: string }> {
  const res = await quickLogWeight(weightKg, date)
  return { success: res.success, error: res.error }
}

/** Delete one weigh-in. Refuses unless the entry is weight-only, re-checked here regardless of what the client believes. */
export async function deleteWeightEntry(entryId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not signed in' }

  const { data: row, error: readError } = await auth.supabase
    .from('entries')
    .select('id, extracted_json')
    .eq('id', entryId)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (readError || !row) return { success: false, error: 'Entry not found' }
  if (!isWeightOnlyEntry(row.extracted_json as ExtractedJSON)) {
    return {
      success: false,
      error: 'This entry also holds other logged data (food, workouts…) — deleting it would lose that too. Log a correction for the date instead.',
    }
  }

  const { error: deleteError } = await auth.supabase
    .from('entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', auth.userId)

  if (deleteError) return { success: false, error: deleteError.message }
  return { success: true }
}

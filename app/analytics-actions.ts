'use server'

import { createClient } from '@/lib/supabase/server'
import type { ExtractedJSON } from '@/lib/extraction-schema'
import { computeAnalytics, type RawEntry } from '@/lib/analytics/engine'
import {
  DEFAULT_ANALYTICS_OPTIONS,
  RANGE_LABELS,
  type AnalyticsOptions,
  type AnalyticsPayload,
  type RangeKey,
} from '@/lib/analytics/types'

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
 * Everything the /analytics page needs, for any range, in one round trip.
 *
 * Reads raw entries rather than `daily_aggregates`: the JSON carries per-food
 * macros, per-set training logs and the source's own TDEE, none of which the
 * aggregate table stores — and analytics then work even on days whose aggregate
 * row was never written. All entries are fetched (they're small and a personal
 * log is in the hundreds, not millions) so "All time" and the previous-period
 * comparison need no second query.
 */
export async function getAnalytics(
  rangeKey: RangeKey = '90d',
  custom?: { start?: string; end?: string },
  options: AnalyticsOptions = DEFAULT_ANALYTICS_OPTIONS
): Promise<{ ok: true; data: AnalyticsPayload } | { ok: false; error: string }> {
  const auth = await getAuthProfileId()
  if (!auth) return { ok: false, error: 'Not signed in' }

  const [entriesRes, profileRes] = await Promise.all([
    auth.supabase
      .from('entries')
      .select('extracted_json, created_at, updated_at')
      // Backfilled entries for the same date all get the SAME created_at (noon
      // UTC — see saveEntry), so two corrections for one day can tie on it.
      // `updated_at` (the real save instant, always distinct) breaks the tie,
      // so the entry actually saved most recently is reliably the one the
      // engine treats as "latest" for that date.
      .order('created_at', { ascending: true })
      .order('updated_at', { ascending: true }),
    auth.supabase
      .from('user_profile')
      .select(
        'current_weight_kg, target_weight_kg, height_cm, gender, age, dob, activity_level, nutrition_goal, fitness_goal, updated_at'
      )
      .eq('id', auth.userId)
      .maybeSingle(),
  ])

  if (entriesRes.error) {
    console.error('[v0] analytics: entries query failed:', entriesRes.error)
    return { ok: false, error: 'Could not load your entries' }
  }

  const entries: RawEntry[] = (entriesRes.data ?? []).map((e: any) => ({
    extracted_json: (e.extracted_json as ExtractedJSON) ?? null,
    created_at: e.created_at as string,
  }))

  try {
    const data = computeAnalytics(
      entries,
      profileRes.data ?? null,
      rangeKey,
      rangeKey === 'custom' && custom?.start && custom?.end
        ? `${custom.start} → ${custom.end}`
        : RANGE_LABELS[rangeKey],
      custom,
      options
    )
    return { ok: true, data }
  } catch (e) {
    console.error('[v0] analytics: compute failed:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Analysis failed' }
  }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import type { Entry, DailyAggregate } from '@/lib/types'

/**
 * Get the current user's profile ID from auth session
 */
async function getAuthProfileId() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.error('[day-actions] Auth failed:', authError?.message || 'No user in session')
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) {
    console.error('[day-actions] No profile found for auth_user_id:', user.id, 'Error:', profileError?.message)

    // Auto-create a basic profile for authenticated users who skipped onboarding
    const email = user.email || ''
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'User'

    const { data: newProfile, error: insertError } = await supabase
      .from('user_profile')
      .insert({
        auth_user_id: user.id,
        email,
        display_name: displayName,
        age: 0,
        gender: 'other',
        height_cm: 0,
        current_weight_kg: 0,
        target_weight_kg: 0,
        activity_level: 'moderate',
        nutrition_goal: 'maintain',
        onboarding_completed: false,
      })
      .select('id')
      .single()

    if (insertError || !newProfile) {
      console.error('[day-actions] Failed to auto-create profile:', insertError?.message)
      return null
    }

    console.log('[day-actions] Auto-created profile for user:', user.id, '→', newProfile.id)
    return { userId: newProfile.id, supabase }
  }

  return { userId: profile.id, supabase }
}

/**
 * Fetch entries for a specific date
 */
export async function getEntriesForDate(
  date: string
): Promise<{ entries: Entry[]; error?: string }> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) return { entries: [], error: 'Not authenticated' }

    const { data: entries, error } = await auth.supabase
      .from('entries')
      .select('*')
      .eq('user_id', auth.userId)
      .gte('created_at', `${date}T00:00:00`)
      .lt('created_at', `${date}T23:59:59`)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching entries:', error)
      return { entries: [] }
    }

    return { entries: (entries || []) as Entry[] }
  } catch (error) {
    console.error('Error in getEntriesForDate:', error)
    return { entries: [] }
  }
}

/**
 * Fetch daily aggregate for a specific date
 */
export async function getDailyAggregate(
  date: string
): Promise<{ aggregate?: DailyAggregate; error?: string }> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) return { error: 'Not authenticated' }

    const { data: aggregate, error } = await auth.supabase
      .from('daily_aggregates')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('log_date', date)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching aggregate:', error)
      return { error: error.message }
    }

    return { aggregate: (aggregate || undefined) as DailyAggregate | undefined }
  } catch (error) {
    console.error('Error in getDailyAggregate:', error)
    return {}
  }
}

export interface DayDigest {
  digest_date: string
  morning_summary?: string
  afternoon_summary?: string
  evening_summary?: string
  full_day_digest?: string
  patterns_noticed?: string[]
}

/**
 * Fetch the nightly AI-generated digest for a date (Phase 9).
 * Returns undefined if no digest has been produced yet.
 */
export async function getDayDigest(
  date: string
): Promise<{ digest?: DayDigest }> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) return {}

    const { data: digest, error } = await auth.supabase
      .from('day_digests')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('digest_date', date)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching digest:', error)
      return {}
    }

    return { digest: (digest || undefined) as DayDigest | undefined }
  } catch (error) {
    console.error('Error in getDayDigest:', error)
    return {}
  }
}

/**
 * Get TDEE for user to calculate calorie surplus/deficit
 */
export async function getUserTDEE(): Promise<number | null> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) return null

    const { data: profile, error } = await auth.supabase
      .from('user_profile')
      .select('current_weight_kg, height_cm, age, gender, activity_level')
      .eq('id', auth.userId)
      .single()

    if (error || !profile) {
      return null
    }

    // Calculate TDEE using same formula as Phase 1
    const { calculateBMR, calculateTDEE } = await import('@/lib/health-metrics')
    const bmr = calculateBMR(
      profile.current_weight_kg || 70,
      profile.height_cm || 175,
      profile.age || 30,
      profile.gender || 'male'
    )
    const tdee = calculateTDEE(bmr, profile.activity_level || 'moderate')

    return tdee
  } catch (error) {
    console.error('Error calculating TDEE:', error)
    return null
  }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import type { Entry, DailyAggregate } from '@/lib/types'

/**
 * Fetch entries for a specific date
 */
export async function getEntriesForDate(
  userEmail: string,
  date: string
): Promise<{ entries: Entry[]; error?: string }> {
  try {
    const supabase = await createClient()

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profile')
      .select('id')
      .eq('email', userEmail)
      .single()

    if (profileError || !profile) {
      return { entries: [], error: 'User not found' }
    }

    // Fetch entries for the date
    const { data: entries, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', profile.id)
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
  userEmail: string,
  date: string
): Promise<{ aggregate?: DailyAggregate; error?: string }> {
  try {
    const supabase = await createClient()

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profile')
      .select('id')
      .eq('email', userEmail)
      .single()

    if (profileError || !profile) {
      return { error: 'User not found' }
    }

    // Fetch daily aggregate
    const { data: aggregate, error } = await supabase
      .from('daily_aggregates')
      .select('*')
      .eq('user_id', profile.id)
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
  userEmail: string,
  date: string
): Promise<{ digest?: DayDigest }> {
  try {
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('user_profile')
      .select('id')
      .eq('email', userEmail)
      .single()

    if (!profile) return {}

    const { data: digest, error } = await supabase
      .from('day_digests')
      .select('*')
      .eq('user_id', profile.id)
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
export async function getUserTDEE(userEmail: string): Promise<number | null> {
  try {
    const supabase = await createClient()

    const { data: profile, error } = await supabase
      .from('user_profile')
      .select('current_weight_kg, height_cm, age, gender, activity_level')
      .eq('email', userEmail)
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

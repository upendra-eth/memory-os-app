'use server'

import { createClient } from '@/lib/supabase/server'

export interface PendingQuestion {
  id: string
  question: string
  context: string
  expected_action: string
  options?: string[]
}

/**
 * Get the current user's profile ID from auth session
 */
async function getAuthProfileId() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.error('[questions-actions] Auth failed:', authError?.message || 'No user in session')
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) {
    console.error('[questions-actions] No profile found for auth_user_id:', user.id, 'Error:', profileError?.message)

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
      console.error('[questions-actions] Failed to auto-create profile:', insertError?.message)
      return null
    }

    console.log('[questions-actions] Auto-created profile for user:', user.id, '→', newProfile.id)
    return { userId: newProfile.id, supabase }
  }

  return { userId: profile.id, supabase }
}

export async function getPendingQuestions(): Promise<PendingQuestion[]> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) return []

    const { data, error } = await auth.supabase
      .from('ai_questions')
      .select('id, question, context, expected_action, options')
      .eq('user_id', auth.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('[v0] getPendingQuestions error:', error)
      return []
    }

    return (data ?? []) as PendingQuestion[]
  } catch (error) {
    console.error('[v0] getPendingQuestions exception:', error)
    return []
  }
}

export async function answerQuestion(
  questionId: string,
  answer: string
): Promise<{ success: boolean }> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) return { success: false }

    const { error } = await auth.supabase
      .from('ai_questions')
      .update({ status: 'answered', answer, answered_at: new Date().toISOString() })
      .eq('id', questionId)
      .eq('user_id', auth.userId)

    if (error) {
      console.error('[v0] answerQuestion error:', error)
      return { success: false }
    }
    return { success: true }
  } catch (error) {
    console.error('[v0] answerQuestion exception:', error)
    return { success: false }
  }
}

export async function snoozeQuestion(
  questionId: string,
  days: number = 7
): Promise<{ success: boolean }> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) return { success: false }

    const snoozeUntil = new Date()
    snoozeUntil.setDate(snoozeUntil.getDate() + days)

    const { error } = await auth.supabase
      .from('ai_questions')
      .update({ status: 'snoozed', snoozed_until: snoozeUntil.toISOString() })
      .eq('id', questionId)
      .eq('user_id', auth.userId)

    if (error) {
      console.error('[v0] snoozeQuestion error:', error)
      return { success: false }
    }
    return { success: true }
  } catch (error) {
    console.error('[v0] snoozeQuestion exception:', error)
    return { success: false }
  }
}

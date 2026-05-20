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

  if (authError || !user) return null

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) return null

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

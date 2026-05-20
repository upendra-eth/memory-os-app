'use server'

import { createClient } from '@/lib/supabase/server'

export interface PendingQuestion {
  id: string
  question: string
  context: string
  expected_action: string
  options?: string[]
}

export async function getPendingQuestions(userEmail: string): Promise<PendingQuestion[]> {
  try {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('user_profile')
      .select('id')
      .eq('email', userEmail)
      .single()

    if (!profile) return []

    const { data, error } = await supabase
      .from('ai_questions')
      .select('id, question, context, expected_action, options')
      .eq('user_id', profile.id)
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
  userEmail: string,
  questionId: string,
  answer: string
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('user_profile')
      .select('id')
      .eq('email', userEmail)
      .single()
    if (!profile) return { success: false }

    const { error } = await supabase
      .from('ai_questions')
      .update({ status: 'answered', answer, answered_at: new Date().toISOString() })
      .eq('id', questionId)
      .eq('user_id', profile.id)

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
  userEmail: string,
  questionId: string,
  days: number = 7
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('user_profile')
      .select('id')
      .eq('email', userEmail)
      .single()
    if (!profile) return { success: false }

    const snoozeUntil = new Date()
    snoozeUntil.setDate(snoozeUntil.getDate() + days)

    const { error } = await supabase
      .from('ai_questions')
      .update({ status: 'snoozed', snoozed_until: snoozeUntil.toISOString() })
      .eq('id', questionId)
      .eq('user_id', profile.id)

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

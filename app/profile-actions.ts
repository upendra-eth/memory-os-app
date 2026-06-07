'use server'

import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getProfileExtractorPrompt } from '@/lib/prompts/profile-extractor'
import { calculateCompleteness, selectNextPrompt } from '@/lib/profile-prompts'
import { enforceAiLimit } from '@/lib/rate-limit'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

async function getAuthProfile() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: profile } = await supabase
    .from('user_profile')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  return profile ? { profile, supabase, authUserId: user.id } : null
}

/**
 * Get the full profile for the current user
 */
export async function getFullProfile() {
  const auth = await getAuthProfile()
  if (!auth) return null
  return auth.profile
}

/**
 * Update profile fields
 */
export async function updateProfileFields(
  fields: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await getAuthProfile()
    if (!auth) return { success: false, error: 'Not authenticated' }

    // Calculate completeness
    const updatedProfile = { ...auth.profile, ...fields }
    const completeness = calculateCompleteness(updatedProfile)

    const { error } = await auth.supabase
      .from('user_profile')
      .update({
        ...fields,
        profile_completeness_score: completeness,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.profile.id)

    if (error) {
      console.error('[v0] Profile update error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('[v0] updateProfileFields error:', error)
    return { success: false, error: 'Failed to update profile' }
  }
}

/**
 * Process natural language profile input via Gemini
 */
export async function extractProfileFromChat(
  message: string
): Promise<{
  success: boolean
  extractedFields?: Record<string, any>
  error?: string
}> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'Gemini API key not configured' }
  }

  try {
    const auth = await getAuthProfile()
    if (!auth) return { success: false, error: 'Not authenticated' }

    const rl = await enforceAiLimit()
    if (!rl.allowed) return { success: false, error: rl.error }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    const prompt = getProfileExtractorPrompt(message, auth.profile)
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    let cleanText = responseText.trim()
    if (cleanText.startsWith('```json')) cleanText = cleanText.slice(7)
    if (cleanText.startsWith('```')) cleanText = cleanText.slice(3)
    if (cleanText.endsWith('```')) cleanText = cleanText.slice(0, -3)
    cleanText = cleanText.trim()

    const extracted = JSON.parse(cleanText)

    // For array fields, merge with existing
    const arrayFields = ['health_conditions', 'medications', 'allergies', 'financial_goals', 'career_goals', 'mental_goals']
    for (const field of arrayFields) {
      if (extracted[field] && Array.isArray(extracted[field])) {
        const existing = auth.profile[field] || []
        const merged = [...new Set([...existing, ...extracted[field]])]
        extracted[field] = merged
      }
    }

    return { success: true, extractedFields: extracted }
  } catch (error) {
    console.error('[v0] extractProfileFromChat error:', error)
    return { success: false, error: 'Failed to extract profile data' }
  }
}

/**
 * Save extracted profile fields from chat
 */
export async function saveExtractedProfile(
  fields: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  return updateProfileFields(fields)
}

/**
 * Get the next daily profile prompt
 */
export async function getDailyProfilePrompt(): Promise<{
  prompt?: { text: string; emoji: string; targetField: string; category: string }
  error?: string
}> {
  try {
    const auth = await getAuthProfile()
    if (!auth) return { error: 'Not authenticated' }

    // Get recently asked prompts (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: recentPrompts } = await auth.supabase
      .from('profile_prompts')
      .select('target_field')
      .eq('user_id', auth.profile.id)
      .gte('created_at', sevenDaysAgo.toISOString())

    const recentFields = (recentPrompts || []).map((p: any) => p.target_field)

    const nextPrompt = selectNextPrompt(auth.profile, recentFields)
    if (!nextPrompt) return {}

    // Record that we're showing this prompt
    await auth.supabase.from('profile_prompts').insert({
      user_id: auth.profile.id,
      prompt_text: nextPrompt.text,
      prompt_category: nextPrompt.category,
      target_field: nextPrompt.targetField,
      status: 'pending',
    })

    return {
      prompt: {
        text: nextPrompt.text,
        emoji: nextPrompt.emoji,
        targetField: nextPrompt.targetField,
        category: nextPrompt.category,
      },
    }
  } catch (error) {
    console.error('[v0] getDailyProfilePrompt error:', error)
    return { error: 'Failed to get prompt' }
  }
}

/**
 * Answer a daily profile prompt
 */
export async function answerProfilePrompt(
  targetField: string,
  answer: string,
  extractedValue: any
): Promise<{ success: boolean }> {
  try {
    const auth = await getAuthProfile()
    if (!auth) return { success: false }

    // Update the prompt status
    await auth.supabase
      .from('profile_prompts')
      .update({
        status: 'answered',
        answer,
        answered_at: new Date().toISOString(),
      })
      .eq('user_id', auth.profile.id)
      .eq('target_field', targetField)
      .eq('status', 'pending')

    // Update the profile field
    await updateProfileFields({ [targetField]: extractedValue })

    return { success: true }
  } catch (error) {
    console.error('[v0] answerProfilePrompt error:', error)
    return { success: false }
  }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import type { UserProfile, Gender, ActivityLevel, NutritionGoal } from '@/lib/types'

export interface OnboardingFormData {
  display_name: string
  age: number
  gender: Gender
  height_cm: number
  current_weight_kg: number
  target_weight_kg: number
  activity_level: ActivityLevel
  nutrition_goal: NutritionGoal
  fitness_goal?: string
  health_conditions?: string[]
  medications?: string[]
  allergies?: string[]
}

/**
 * Create or update user profile during onboarding.
 * Uses auth session to link profile to the authenticated user.
 */
export async function saveUserProfile(data: OnboardingFormData): Promise<{
  success: boolean
  profile?: UserProfile
  error?: string
}> {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const email = user.email || ''

    // Check if user profile already exists
    const { data: existingProfile } = await supabase
      .from('user_profile')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    let profile: UserProfile

    if (existingProfile) {
      // Update existing profile
      const { data: updated, error: updateError } = await supabase
        .from('user_profile')
        .update({
          display_name: data.display_name,
          age: data.age,
          gender: data.gender,
          height_cm: data.height_cm,
          current_weight_kg: data.current_weight_kg,
          target_weight_kg: data.target_weight_kg,
          activity_level: data.activity_level,
          nutrition_goal: data.nutrition_goal,
          fitness_goal: data.fitness_goal,
          health_conditions: data.health_conditions || [],
          medications: data.medications || [],
          allergies: data.allergies || [],
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProfile.id)
        .select()
        .single()

      if (updateError) {
        console.error('Update error:', updateError)
        return { success: false, error: 'Failed to update profile' }
      }

      profile = updated as UserProfile
    } else {
      // Create new profile linked to auth user
      const { data: created, error: insertError } = await supabase
        .from('user_profile')
        .insert({
          auth_user_id: user.id,
          email,
          display_name: data.display_name,
          age: data.age,
          gender: data.gender,
          height_cm: data.height_cm,
          current_weight_kg: data.current_weight_kg,
          target_weight_kg: data.target_weight_kg,
          activity_level: data.activity_level,
          nutrition_goal: data.nutrition_goal,
          fitness_goal: data.fitness_goal,
          health_conditions: data.health_conditions || [],
          medications: data.medications || [],
          allergies: data.allergies || [],
          onboarding_completed: true,
        })
        .select()
        .single()

      if (insertError) {
        console.error('Insert error:', insertError)
        return { success: false, error: 'Failed to create profile' }
      }

      profile = created as UserProfile
    }

    return { success: true, profile }
  } catch (error) {
    console.error('Error saving profile:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An error occurred',
    }
  }
}

/**
 * Get user profile using auth session
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return null
    }

    const { data: profile, error } = await supabase
      .from('user_profile')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Profile doesn't exist
      }
      throw error
    }

    return profile as UserProfile
  } catch (error) {
    console.error('Error fetching profile:', error)
    return null
  }
}

/**
 * Check if onboarding is completed for the current auth user
 */
export async function isOnboardingCompleted(): Promise<boolean> {
  const profile = await getUserProfile()
  return profile?.onboarding_completed || false
}

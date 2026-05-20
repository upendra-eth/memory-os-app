import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Get the currently authenticated user from the server-side session.
 * Returns the Supabase auth user object.
 * Redirects to /auth/login if no session exists.
 */
export async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/auth/login')
  }

  return user
}

/**
 * Get the user's profile from the database, linked to their auth session.
 * Returns null if no profile exists (user needs onboarding).
 */
export async function getAuthProfile() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/auth/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profile')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[v0] Error fetching profile:', profileError)
  }

  return { user, profile }
}

/**
 * Get user profile ID from auth session (for use in server actions).
 * Returns the user_profile.id UUID needed for queries.
 */
export async function getProfileId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Not authenticated')
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError || !profile) {
    throw new Error('Profile not found')
  }

  return profile.id
}

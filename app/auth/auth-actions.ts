'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export async function signInWithPassword(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  const redirectTo = formData.get('redirectTo') as string
  redirect(redirectTo || '/dashboard')
}

export async function signUpWithPassword(formData: FormData) {
  const supabase = await createClient()
  const headersList = await headers()
  const origin = headersList.get('origin') || 'http://localhost:3000'

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const displayName = formData.get('displayName') as string

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        full_name: displayName,
      },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  // If Supabase is configured to require email verification, signUp() returns
  // a user but no session. Don't redirect — the signup page will show a
  // "check your email" state. Once they click the link, /auth/callback
  // exchanges the code, creates the session, and routes to /onboarding.
  if (data.user && !data.session) {
    return { needsVerification: true, email }
  }

  // Verification disabled in Supabase — user is logged in immediately.
  redirect('/onboarding')
}

// OAuth (Google/GitHub) is initiated from the browser client in the login and
// signup pages — see app/auth/login/page.tsx. Doing it client-side persists the
// PKCE code verifier reliably so /auth/callback can exchange the code. Running
// signInWithOAuth from a server action dropped the verifier and broke the flow.

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

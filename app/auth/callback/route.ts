import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // The OAuth provider (or Supabase) can redirect back with an error instead
  // of a code — surface it instead of silently bouncing to login.
  const providerError = searchParams.get('error_description') || searchParams.get('error')
  if (providerError) {
    console.error('[v0] OAuth callback returned provider error:', providerError)
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(providerError)}`,
    )
  }

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      // Most commonly a missing PKCE code-verifier cookie. Log it so we can see
      // the real reason rather than swallowing it.
      console.error('[v0] exchangeCodeForSession failed:', error.message)
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(error.message)}`,
      )
    }

    if (data.user) {
      // Check if this user has a profile already
      const { data: profile } = await supabase
        .from('user_profile')
        .select('id')
        .eq('auth_user_id', data.user.id)
        .single()

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      const baseUrl = isLocalEnv
        ? origin
        : forwardedHost
          ? `https://${forwardedHost}`
          : origin

      if (!profile) {
        // New user via social login — redirect to onboarding
        return NextResponse.redirect(`${baseUrl}/onboarding`)
      }

      // Existing user — go to dashboard (or the requested next path)
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
  }

  // No code and no error — unexpected. Send back to login.
  console.error('[v0] OAuth callback hit with neither code nor error param')
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`)
}

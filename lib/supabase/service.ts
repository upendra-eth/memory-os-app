import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS, so it is ONLY for trusted
 * server contexts that scope every query by user_id themselves (e.g. the MCP
 * endpoint, which authenticates via a personal token rather than a cookie
 * session). Never expose this to the browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

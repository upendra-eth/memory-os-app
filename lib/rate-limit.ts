import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isAdminEmail } from '@/lib/admin'

/** Default daily AI-call cap per user. Override via AI_DAILY_LIMIT env. */
export const DEFAULT_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 40

export interface LimitResult {
  allowed: boolean
  error?: string
  remaining?: number
  limit?: number
}

/**
 * Gate one AI (Gemini) operation for the current user. Call at the start of any
 * server action / route that makes a Gemini request. Admins are unlimited.
 * Counting/limits are read+written with the SERVICE role so users cannot tamper
 * with their own counters (the table is read-only under RLS).
 */
export async function enforceAiLimit(): Promise<LimitResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { allowed: false, error: 'Not signed in.' }
  if (isAdminEmail(user.email)) return { allowed: true }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return { allowed: false, error: 'Profile not found.' }
  const userId = profile.id as string

  const db = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: limitRow }, { data: usageRow }] = await Promise.all([
    db.from('ai_rate_limits').select('daily_limit').eq('user_id', userId).maybeSingle(),
    db.from('ai_usage').select('count').eq('user_id', userId).eq('usage_date', today).maybeSingle(),
  ])
  const limit = limitRow?.daily_limit ?? DEFAULT_DAILY_LIMIT
  const used = usageRow?.count ?? 0

  if (used >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      error: `Daily AI limit reached (${limit}/day) to keep costs down. It resets tomorrow.`,
    }
  }

  // Best-effort increment. Read+upsert can race under heavy concurrency, but
  // that's acceptable for this single-user-scale cost guard.
  await db
    .from('ai_usage')
    .upsert({ user_id: userId, usage_date: today, count: used + 1 }, { onConflict: 'user_id,usage_date' })

  return { allowed: true, limit, remaining: limit - used - 1 }
}

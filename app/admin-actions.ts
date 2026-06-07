'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isAdminEmail } from '@/lib/admin'
import { DEFAULT_DAILY_LIMIT } from '@/lib/rate-limit'

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return isAdminEmail(user?.email)
}

export async function amIAdmin(): Promise<boolean> {
  return requireAdmin()
}

export interface UserLimitInfo {
  email: string
  userId: string
  daily_limit: number | null
  effective_limit: number
  default_limit: number
  used_today: number
}

export async function lookupUser(email: string): Promise<{ success: boolean; info?: UserLimitInfo; error?: string }> {
  if (!(await requireAdmin())) return { success: false, error: 'Not authorized.' }
  if (!email.trim()) return { success: false, error: 'Enter an email.' }

  const db = createServiceClient()
  const { data: profile } = await db
    .from('user_profile')
    .select('id, email')
    .ilike('email', email.trim())
    .maybeSingle()
  if (!profile) return { success: false, error: 'No user found with that email.' }

  const today = new Date().toISOString().slice(0, 10)
  const [{ data: limitRow }, { data: usageRow }] = await Promise.all([
    db.from('ai_rate_limits').select('daily_limit').eq('user_id', profile.id).maybeSingle(),
    db.from('ai_usage').select('count').eq('user_id', profile.id).eq('usage_date', today).maybeSingle(),
  ])

  const daily_limit = limitRow?.daily_limit ?? null
  return {
    success: true,
    info: {
      email: profile.email,
      userId: profile.id,
      daily_limit,
      effective_limit: daily_limit ?? DEFAULT_DAILY_LIMIT,
      default_limit: DEFAULT_DAILY_LIMIT,
      used_today: usageRow?.count ?? 0,
    },
  }
}

/** Set (or with limit=null, clear) a user's custom daily AI limit. */
export async function setUserLimit(email: string, limit: number | null): Promise<{ success: boolean; error?: string }> {
  if (!(await requireAdmin())) return { success: false, error: 'Not authorized.' }

  const db = createServiceClient()
  const { data: profile } = await db
    .from('user_profile')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle()
  if (!profile) return { success: false, error: 'No user found with that email.' }

  if (limit === null) {
    await db.from('ai_rate_limits').delete().eq('user_id', profile.id)
  } else {
    if (!Number.isFinite(limit) || limit < 0) return { success: false, error: 'Limit must be 0 or more.' }
    await db
      .from('ai_rate_limits')
      .upsert({ user_id: profile.id, daily_limit: Math.floor(limit), updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  }
  return { success: true }
}

/** Reset a user's usage counter for today (e.g. to un-block someone). */
export async function resetUserUsageToday(email: string): Promise<{ success: boolean; error?: string }> {
  if (!(await requireAdmin())) return { success: false, error: 'Not authorized.' }
  const db = createServiceClient()
  const { data: profile } = await db.from('user_profile').select('id').ilike('email', email.trim()).maybeSingle()
  if (!profile) return { success: false, error: 'No user found with that email.' }
  const today = new Date().toISOString().slice(0, 10)
  await db.from('ai_usage').upsert({ user_id: profile.id, usage_date: today, count: 0 }, { onConflict: 'user_id,usage_date' })
  return { success: true }
}

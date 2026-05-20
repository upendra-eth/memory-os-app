'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Resolve the current auth session to a user_profile.id.
 * Returns null if unauthenticated or no profile row exists.
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
  return { userId: profile.id as string, supabase }
}

export async function saveLifeLog(content: Record<string, unknown>) {
  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not authenticated' }

  const { data, error } = await auth.supabase
    .from('life_logs')
    .insert({ content, user_id: auth.userId })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/explorer')

  return { success: true, data }
}

export async function getRecentLogs(days: number = 14) {
  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not authenticated', logs: [] }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const { data, error } = await auth.supabase
    .from('life_logs')
    .select('*')
    .eq('user_id', auth.userId)
    .gte('created_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    return { success: false, error: error.message, logs: [] }
  }

  return { success: true, logs: data }
}

export async function getAllLogs(page: number = 1, limit: number = 20) {
  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not authenticated', logs: [], total: 0 }

  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await auth.supabase
    .from('life_logs')
    .select('*', { count: 'exact' })
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    return { success: false, error: error.message, logs: [], total: 0 }
  }

  return { success: true, logs: data, total: count ?? 0 }
}

export async function deleteLog(id: string) {
  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not authenticated' }

  const { error } = await auth.supabase
    .from('life_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/explorer')

  return { success: true }
}

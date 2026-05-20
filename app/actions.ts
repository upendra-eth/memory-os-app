'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveLifeLog(content: Record<string, unknown>) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('life_logs')
    .insert({ content })
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
  const supabase = await createClient()
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  
  const { data, error } = await supabase
    .from('life_logs')
    .select('*')
    .gte('created_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false })
  
  if (error) {
    return { success: false, error: error.message, logs: [] }
  }
  
  return { success: true, logs: data }
}

export async function getAllLogs(page: number = 1, limit: number = 20) {
  const supabase = await createClient()
  
  const from = (page - 1) * limit
  const to = from + limit - 1
  
  const { data, error, count } = await supabase
    .from('life_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  
  if (error) {
    return { success: false, error: error.message, logs: [], total: 0 }
  }
  
  return { success: true, logs: data, total: count ?? 0 }
}

export async function deleteLog(id: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('life_logs')
    .delete()
    .eq('id', id)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  revalidatePath('/')
  revalidatePath('/explorer')
  
  return { success: true }
}

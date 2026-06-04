'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import {
  reportNormalizePrompt,
  issueStructurePrompt,
  type HealthReportJSON,
  type HealthIssueJSON,
} from '@/lib/prompts/health'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

async function getAuthProfileId(): Promise<{ userId: string; supabase: Awaited<ReturnType<typeof createClient>> } | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return null
  return { userId: profile.id, supabase }
}

/** Pull the first JSON object out of pasted text (handles ```json fences and prose). */
function extractJson(text: string): any | null {
  if (!text) return null
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

async function geminiJson(prompt: string): Promise<any | null> {
  if (!GEMINI_API_KEY) return null
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const result = await model.generateContent(prompt)
    return extractJson(result.response.text())
  } catch (e) {
    console.error('[v0] gemini json error:', e)
    return null
  }
}

// ---- Health reports -------------------------------------------------------

export interface HealthReport {
  id: string
  test_name: string
  test_date: string
  report_type: string
  markers: HealthReportJSON['markers']
  notable: string[]
  summary: string
  created_at: string
}

function rowToReport(row: any): HealthReport {
  const results = (row.results as Record<string, unknown>) || {}
  return {
    id: row.id,
    test_name: row.test_name || 'Health Report',
    test_date: row.test_date,
    report_type: (results.report_type as string) || 'lab',
    markers: (results.markers as HealthReportJSON['markers']) || [],
    notable: (results.notable as string[]) || [],
    summary: row.ai_analysis || '',
    created_at: row.created_at,
  }
}

/**
 * Save a pasted health report (lab / checkup / body-composition). Parses the
 * pasted JSON directly; falls back to Gemini normalization if it isn't clean.
 */
export async function saveHealthReport(paste: string): Promise<{ success: boolean; report?: HealthReport; error?: string }> {
  if (!paste.trim()) return { success: false, error: 'Please paste your report.' }

  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not signed in, or profile not set up yet.' }
  const { userId, supabase } = auth

  let parsed = extractJson(paste) as Partial<HealthReportJSON> | null
  if (!parsed || !Array.isArray(parsed.markers)) {
    parsed = (await geminiJson(reportNormalizePrompt(paste))) as Partial<HealthReportJSON> | null
  }
  if (!parsed) {
    return { success: false, error: "Couldn't read that report. Paste the JSON block from ChatGPT, or the raw report text." }
  }

  const results = {
    report_type: parsed.report_type || 'lab',
    markers: Array.isArray(parsed.markers) ? parsed.markers : [],
    notable: Array.isArray(parsed.notable) ? parsed.notable : [],
  }

  const { data, error } = await supabase
    .from('lab_results')
    .insert({
      user_id: userId,
      test_name: parsed.test_name || 'Health Report',
      test_date: parsed.test_date || new Date().toISOString().split('T')[0],
      results,
      ai_analysis: parsed.summary || '',
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[v0] saveHealthReport insert error:', error?.message)
    return { success: false, error: 'Failed to save report.' }
  }
  return { success: true, report: rowToReport(data) }
}

export async function getHealthReports(): Promise<HealthReport[]> {
  const auth = await getAuthProfileId()
  if (!auth) return []
  const { userId, supabase } = auth
  const { data } = await supabase
    .from('lab_results')
    .select('*')
    .eq('user_id', userId)
    .order('test_date', { ascending: false })
    .limit(100)
  return (data || []).map(rowToReport)
}

export async function deleteHealthReport(id: string): Promise<{ success: boolean }> {
  const auth = await getAuthProfileId()
  if (!auth) return { success: false }
  await auth.supabase.from('lab_results').delete().eq('id', id).eq('user_id', auth.userId)
  return { success: true }
}

// ---- Ongoing issues -------------------------------------------------------

export interface IssueUpdate {
  at: string
  note: string
  severity_1_10?: number | null
  status?: string | null
}

export interface HealthIssue {
  id: string
  title: string
  category: string | null
  description: string | null
  severity_1_10: number | null
  status: string
  started_on: string | null
  updates: IssueUpdate[]
  created_at: string
  updated_at: string
}

/**
 * Log an ongoing issue from free text (or a pasted JSON block). Gemini
 * structures it into a title/category/severity when not already JSON.
 */
export async function saveHealthIssue(text: string): Promise<{ success: boolean; issue?: HealthIssue; error?: string }> {
  if (!text.trim()) return { success: false, error: 'Please describe the issue.' }

  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not signed in, or profile not set up yet.' }
  const { userId, supabase } = auth

  let parsed = extractJson(text) as Partial<HealthIssueJSON> | null
  if (!parsed || !parsed.title) {
    parsed = (await geminiJson(issueStructurePrompt(text))) as Partial<HealthIssueJSON> | null
  }
  // Final fallback: store the raw text as the description so nothing is lost.
  const title = parsed?.title || text.trim().split('\n')[0].slice(0, 80)

  const { data, error } = await supabase
    .from('health_issues')
    .insert({
      user_id: userId,
      title,
      category: parsed?.category || 'other',
      description: parsed?.description || text.trim(),
      severity_1_10: typeof parsed?.severity_1_10 === 'number' ? parsed.severity_1_10 : null,
      started_on: parsed?.started_on || null,
      status: 'active',
      updates: [],
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[v0] saveHealthIssue insert error:', error?.message)
    return { success: false, error: 'Failed to save issue.' }
  }
  return { success: true, issue: data as HealthIssue }
}

export async function getHealthIssues(): Promise<HealthIssue[]> {
  const auth = await getAuthProfileId()
  if (!auth) return []
  const { userId, supabase } = auth
  const { data } = await supabase
    .from('health_issues')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100)
  return (data || []) as HealthIssue[]
}

/** Append a dated update to an issue and optionally change its status/severity. */
export async function updateHealthIssue(
  id: string,
  update: { note?: string; status?: string; severity_1_10?: number | null },
): Promise<{ success: boolean; issue?: HealthIssue; error?: string }> {
  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not signed in.' }
  const { userId, supabase } = auth

  const { data: current } = await supabase
    .from('health_issues')
    .select('updates')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (!current) return { success: false, error: 'Issue not found.' }

  const updates: IssueUpdate[] = Array.isArray(current.updates) ? current.updates : []
  if (update.note || update.status || typeof update.severity_1_10 === 'number') {
    updates.push({
      at: new Date().toISOString(),
      note: update.note || '',
      severity_1_10: update.severity_1_10 ?? null,
      status: update.status ?? null,
    })
  }

  const patch: Record<string, unknown> = { updates, updated_at: new Date().toISOString() }
  if (update.status) patch.status = update.status
  if (typeof update.severity_1_10 === 'number') patch.severity_1_10 = update.severity_1_10

  const { data, error } = await supabase
    .from('health_issues')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error || !data) return { success: false, error: 'Failed to update issue.' }
  return { success: true, issue: data as HealthIssue }
}

export async function deleteHealthIssue(id: string): Promise<{ success: boolean }> {
  const auth = await getAuthProfileId()
  if (!auth) return { success: false }
  await auth.supabase.from('health_issues').delete().eq('id', id).eq('user_id', auth.userId)
  return { success: true }
}

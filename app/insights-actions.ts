'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import type { ExtractedJSON } from '@/lib/extraction-schema'
import { getReviewPrompt } from '@/lib/prompts/review'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

async function getAuthProfileId(): Promise<{ userId: string; supabase: any } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return null
  return { userId: profile.id, supabase }
}

function effectiveDate(ex: ExtractedJSON | undefined, createdAt: string): string {
  return ex?.log_date || createdAt.slice(0, 10)
}

// ===========================================================================
// HABITS & STREAKS
// ===========================================================================

export interface HabitStat {
  name: string
  done: number
  skipped: number
  consistency: number // 0-100
  currentStreak: number
}

export interface HabitsData {
  loggingStreak: number
  longestStreak: number
  daysLogged: number
  /** date (YYYY-MM-DD) → day rating 1-10 (for heatmap colouring). undefined value = logged but unrated */
  heatmap: { date: string; rating: number | null }[]
  habits: HabitStat[]
}

export async function getHabitsData(): Promise<HabitsData> {
  const auth = await getAuthProfileId()
  if (!auth) return { loggingStreak: 0, longestStreak: 0, daysLogged: 0, heatmap: [], habits: [] }

  const since = new Date()
  since.setDate(since.getDate() - 180)

  const { data: entries } = await auth.supabase
    .from('entries')
    .select('extracted_json, created_at')
    .eq('user_id', auth.userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  if (!entries) return { loggingStreak: 0, longestStreak: 0, daysLogged: 0, heatmap: [], habits: [] }

  const ratingByDate = new Map<string, number | null>()
  // habit name → sorted unique dates it was 'done'
  const habitDone = new Map<string, Set<string>>()
  const habitSkipped = new Map<string, Set<string>>()

  for (const e of entries) {
    const ex = (e.extracted_json as ExtractedJSON) || {}
    const date = effectiveDate(ex, e.created_at)
    if (!ratingByDate.has(date)) ratingByDate.set(date, ex.reflection?.rating_1_10 ?? null)
    else if (ratingByDate.get(date) == null && ex.reflection?.rating_1_10 != null)
      ratingByDate.set(date, ex.reflection.rating_1_10)

    for (const h of ex.habits || []) {
      const name = h.name.trim()
      if (!name) continue
      const target = h.status === 'done' ? habitDone : habitSkipped
      if (!target.has(name)) target.set(name, new Set())
      target.get(name)!.add(date)
    }
  }

  const loggedDates = Array.from(ratingByDate.keys()).sort()

  // Streaks (consecutive calendar days)
  const streaks = computeStreaks(loggedDates)

  // Build last-98-day heatmap grid (14 weeks)
  const heatmap: { date: string; rating: number | null }[] = []
  const today = new Date()
  for (let i = 97; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    heatmap.push({ date: key, rating: ratingByDate.has(key) ? ratingByDate.get(key)! : null })
  }
  // Mark days with no entry distinctly: rating stays null AND not in ratingByDate.
  // We encode "not logged" as rating -1 for the UI.
  for (const cell of heatmap) {
    if (!ratingByDate.has(cell.date)) cell.rating = -1
  }

  // Per-habit stats
  const allHabitNames = new Set([...habitDone.keys(), ...habitSkipped.keys()])
  const habits: HabitStat[] = Array.from(allHabitNames)
    .map((name) => {
      const done = habitDone.get(name)?.size ?? 0
      const skipped = habitSkipped.get(name)?.size ?? 0
      const total = done + skipped
      const doneDates = Array.from(habitDone.get(name) ?? []).sort()
      return {
        name,
        done,
        skipped,
        consistency: total > 0 ? Math.round((done / total) * 100) : 0,
        currentStreak: computeStreaks(doneDates).current,
      }
    })
    .sort((a, b) => b.done - a.done)

  return {
    loggingStreak: streaks.current,
    longestStreak: streaks.longest,
    daysLogged: loggedDates.length,
    heatmap,
    habits,
  }
}

/** Current (ending today/yesterday) and longest run of consecutive calendar days. */
function computeStreaks(sortedDates: string[]): { current: number; longest: number } {
  if (sortedDates.length === 0) return { current: 0, longest: 0 }
  const dayMs = 86400000
  let longest = 1
  let run = 1
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]).getTime()
    const cur = new Date(sortedDates[i]).getTime()
    if (Math.round((cur - prev) / dayMs) === 1) run++
    else run = 1
    longest = Math.max(longest, run)
  }
  // Current streak only counts if the last logged day is today or yesterday
  const last = new Date(sortedDates[sortedDates.length - 1]).getTime()
  const todayMid = new Date(new Date().toISOString().slice(0, 10)).getTime()
  const gap = Math.round((todayMid - last) / dayMs)
  let current = 0
  if (gap <= 1) {
    current = 1
    for (let i = sortedDates.length - 1; i > 0; i--) {
      const prev = new Date(sortedDates[i - 1]).getTime()
      const cur = new Date(sortedDates[i]).getTime()
      if (Math.round((cur - prev) / dayMs) === 1) current++
      else break
    }
  }
  return { current, longest }
}

// ===========================================================================
// CORRELATIONS
// ===========================================================================

export interface Correlation {
  a: string
  b: string
  r: number
  n: number
  sentence: string
}

const METRICS: { key: string; label: string }[] = [
  { key: 'sleep_hours', label: 'sleep' },
  { key: 'sleep_quality', label: 'sleep quality' },
  { key: 'mood_score', label: 'mood' },
  { key: 'stress_level', label: 'stress' },
  { key: 'calories', label: 'calories' },
  { key: 'protein_g', label: 'protein' },
  { key: 'workout_duration_min', label: 'training minutes' },
  { key: 'workouts_count', label: 'workouts' },
]

export async function getCorrelations(): Promise<{ n: number; correlations: Correlation[] }> {
  const auth = await getAuthProfileId()
  if (!auth) return { n: 0, correlations: [] }

  const { data: rows } = await auth.supabase
    .from('daily_aggregates')
    .select('*')
    .eq('user_id', auth.userId)
    .order('log_date', { ascending: true })

  if (!rows || rows.length < 5) return { n: rows?.length ?? 0, correlations: [] }

  const out: Correlation[] = []
  for (let i = 0; i < METRICS.length; i++) {
    for (let j = i + 1; j < METRICS.length; j++) {
      const m1 = METRICS[i]
      const m2 = METRICS[j]
      const pairs = rows
        .map((r: any) => [r[m1.key], r[m2.key]])
        .filter(([x, y]: any[]) => typeof x === 'number' && typeof y === 'number') as [number, number][]
      if (pairs.length < 5) continue
      const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]))
      if (Number.isNaN(r) || Math.abs(r) < 0.35) continue
      out.push({
        a: m1.label,
        b: m2.label,
        r: Math.round(r * 100) / 100,
        n: pairs.length,
        sentence: phraseCorrelation(m1.label, m2.label, r),
      })
    }
  }
  out.sort((p, q) => Math.abs(q.r) - Math.abs(p.r))
  return { n: rows.length, correlations: out.slice(0, 10) }
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return NaN
  return num / Math.sqrt(dx * dy)
}

function phraseCorrelation(a: string, b: string, r: number): string {
  const strength = Math.abs(r) >= 0.6 ? 'strongly' : Math.abs(r) >= 0.45 ? 'tends to' : 'somewhat'
  const dir = r > 0 ? 'higher' : 'lower'
  return `On days with more ${a}, your ${b} ${strength === 'tends to' ? 'tends to be' : `is ${strength}`} ${dir}.`
}

// ===========================================================================
// MIND & MOOD
// ===========================================================================

/** ChatGPT's analysis of a day — its insights/ideas/decisions/questions/problems. */
export type ThoughtKind = 'insight' | 'idea' | 'decision' | 'question' | 'problem'
export interface Thought {
  text: string
  kind: ThoughtKind
  date: string
}

export interface MindData {
  mentalSeries: { date: string; stress?: number; anxiety?: number; focus?: number; motivation?: number }[]
  emotions: { feeling: string; count: number; avgIntensity: number; triggers: string[] }[]
  thoughts: Thought[]
  selfTalk: { text: string; type: string; date: string }[]
  ruminations: { date: string; note: string }[]
}

export async function getMindData(): Promise<MindData> {
  const empty: MindData = { mentalSeries: [], emotions: [], thoughts: [], selfTalk: [], ruminations: [] }
  const auth = await getAuthProfileId()
  if (!auth) return empty

  const since = new Date()
  since.setDate(since.getDate() - 90)

  const { data: entries } = await auth.supabase
    .from('entries')
    .select('extracted_json, created_at')
    .eq('user_id', auth.userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  if (!entries) return empty

  const mentalByDate = new Map<string, { stress?: number; anxiety?: number; focus?: number; motivation?: number }>()
  const emotionMap = new Map<string, { count: number; sum: number; triggers: Set<string> }>()
  const thoughts: Thought[] = []
  const selfTalk: { text: string; type: string; date: string }[] = []
  const ruminations: { date: string; note: string }[] = []

  for (const e of entries) {
    const ex = (e.extracted_json as ExtractedJSON) || {}
    const date = effectiveDate(ex, e.created_at)

    if (ex.mental) {
      const cur = mentalByDate.get(date) || {}
      mentalByDate.set(date, {
        stress: ex.mental.stress_1_10 ?? cur.stress,
        anxiety: ex.mental.anxiety_1_10 ?? cur.anxiety,
        focus: ex.mental.focus_1_10 ?? cur.focus,
        motivation: ex.mental.motivation_1_10 ?? cur.motivation,
      })
      if (ex.mental.rumination_note) ruminations.push({ date, note: ex.mental.rumination_note })
    }

    for (const em of ex.emotions || []) {
      const key = em.feeling.trim().toLowerCase()
      if (!key) continue
      const cur = emotionMap.get(key) || { count: 0, sum: 0, triggers: new Set<string>() }
      cur.count += 1
      cur.sum += em.intensity_1_10 || 0
      if (em.trigger) cur.triggers.add(em.trigger)
      emotionMap.set(key, cur)
    }

    for (const st of ex.self_talk || []) {
      if (st.text) selfTalk.push({ text: st.text, type: st.type, date })
    }

    // ChatGPT's analysis lives in cognition — surface insights/ideas/decisions/etc.
    const cog = ex.cognition
    if (cog) {
      const kinds: [ThoughtKind, string[] | undefined][] = [
        ['insight', cog.insights],
        ['idea', cog.ideas],
        ['decision', cog.decisions],
        ['question', cog.questions],
        ['problem', cog.problems],
      ]
      for (const [kind, list] of kinds) {
        for (const text of list || []) {
          if (text) thoughts.push({ text, kind, date })
        }
      }
    }
  }

  const mentalSeries = Array.from(mentalByDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }))

  const emotions = Array.from(emotionMap.entries())
    .map(([feeling, v]) => ({
      feeling,
      count: v.count,
      avgIntensity: Math.round((v.sum / v.count) * 10) / 10,
      triggers: Array.from(v.triggers).slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count)

  return {
    mentalSeries,
    emotions,
    thoughts: thoughts.reverse(),
    selfTalk: selfTalk.reverse(),
    ruminations: ruminations.reverse(),
  }
}

// ===========================================================================
// WEEKLY / MONTHLY AI REVIEW
// ===========================================================================

export async function generateReview(rangeDays: 7 | 30): Promise<{ success: boolean; review?: string; error?: string }> {
  if (!GEMINI_API_KEY) return { success: false, error: 'Gemini API key not configured' }
  const auth = await getAuthProfileId()
  if (!auth) return { success: false, error: 'Not authenticated' }

  const since = new Date()
  since.setDate(since.getDate() - rangeDays)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data: aggs } = await auth.supabase
    .from('daily_aggregates')
    .select('*')
    .eq('user_id', auth.userId)
    .gte('log_date', sinceStr)
    .order('log_date', { ascending: true })

  const { data: entries } = await auth.supabase
    .from('entries')
    .select('extracted_json, created_at')
    .eq('user_id', auth.userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  if ((!aggs || aggs.length === 0) && (!entries || entries.length === 0)) {
    return { success: false, error: 'Not enough data in this period yet. Log a few days first.' }
  }

  // Compact qualitative highlights (avoid dumping raw entries → keep tokens low)
  const wins: string[] = []
  const blockers: string[] = []
  const lessons: string[] = []
  const highs: string[] = []
  for (const e of entries || []) {
    const ex = (e.extracted_json as ExtractedJSON) || {}
    if (ex.work?.wins) wins.push(...ex.work.wins)
    if (ex.work?.blockers) blockers.push(...ex.work.blockers)
    if (ex.reflection?.lesson) lessons.push(ex.reflection.lesson)
    if (ex.reflection?.high) highs.push(ex.reflection.high)
  }

  const avg = (key: string) => {
    const vals = (aggs || []).map((a: any) => a[key]).filter((v: any) => typeof v === 'number')
    return vals.length ? Math.round((vals.reduce((s: number, v: number) => s + v, 0) / vals.length) * 10) / 10 : null
  }

  const summary = {
    period_days: rangeDays,
    days_logged: aggs?.length ?? 0,
    avg_calories: avg('calories'),
    avg_protein_g: avg('protein_g'),
    avg_sleep_hours: avg('sleep_hours'),
    avg_mood_1_10: avg('mood_score'),
    avg_stress_1_10: avg('stress_level'),
    total_workouts: (aggs || []).reduce((s: number, a: any) => s + (a.workouts_count || 0), 0),
    wins: wins.slice(0, 12),
    blockers: blockers.slice(0, 10),
    lessons: lessons.slice(0, 10),
    highlights: highs.slice(0, 10),
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const result = await model.generateContent(getReviewPrompt(rangeDays === 7 ? 'week' : 'month', summary))
    return { success: true, review: result.response.text().trim() }
  } catch (e) {
    console.error('[insights-actions] review generation error:', e)
    return { success: false, error: e instanceof Error ? e.message : 'Failed to generate review' }
  }
}

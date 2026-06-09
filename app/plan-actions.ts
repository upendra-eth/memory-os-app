'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { exercisePlanPrompt, type ExercisePlan } from '@/lib/prompts/plan'
import { enforceAiLimit } from '@/lib/rate-limit'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

async function getAuth(): Promise<{ userId: string; supabase: Awaited<ReturnType<typeof createClient>> } | null> {
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

function extractJson(text: string): any | null {
  if (!text) return null
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

// ---- Exercise plan --------------------------------------------------------

export interface SavedPlan {
  id: string
  goals: string
  days_per_week: number
  equipment: string
  plan: ExercisePlan
  created_at: string
}

export async function getActivePlan(): Promise<SavedPlan | null> {
  const auth = await getAuth()
  if (!auth) return null
  const { data } = await auth.supabase
    .from('exercise_plans')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as SavedPlan) || null
}

/**
 * Save a schedule the user built elsewhere and converted to our JSON via the
 * SCHEDULE_COPY_PROMPT. Parses the pasted JSON directly (no AI cost); if it
 * isn't valid JSON, falls back to a rate-limited Gemini coercion.
 */
export async function saveImportedPlan(paste: string): Promise<{ success: boolean; plan?: SavedPlan; error?: string }> {
  if (!paste.trim()) return { success: false, error: 'Paste your schedule JSON first.' }
  const auth = await getAuth()
  if (!auth) return { success: false, error: 'Not signed in.' }
  const { userId, supabase } = auth

  let parsed = extractJson(paste)
  if (!parsed || !Array.isArray(parsed.weekly)) {
    // Fallback: let Gemini coerce free-form text into the shape (counts against AI limit).
    const { enforceAiLimit: enforce } = await import('@/lib/rate-limit')
    const rl = await enforce()
    if (!rl.allowed) return { success: false, error: rl.error }
    if (GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
        const result = await model.generateContent(
          `Convert this workout schedule into JSON {summary, weekly:[{day,focus,exercises:[{name,sets,reps,notes}]}] (7 entries Mon-Sun, rest days empty), tips:[]}. Return ONLY JSON.\n\n${paste}`,
        )
        parsed = extractJson(result.response.text())
      } catch (e) {
        console.error('[v0] saveImportedPlan gemini error:', e)
      }
    }
  }
  if (!parsed || !Array.isArray(parsed.weekly)) {
    return { success: false, error: "Couldn't read that. Use the “Copy prompt” button, run it in ChatGPT, and paste the JSON it returns." }
  }

  const plan: ExercisePlan = {
    summary: parsed.summary || 'Imported schedule',
    weekly: parsed.weekly,
    tips: Array.isArray(parsed.tips) ? parsed.tips : [],
  }

  await supabase.from('exercise_plans').update({ active: false }).eq('user_id', userId).eq('active', true)
  const { data, error } = await supabase
    .from('exercise_plans')
    .insert({ user_id: userId, goals: 'Imported schedule', days_per_week: plan.weekly.filter((d) => d.exercises?.length).length, equipment: '', plan, active: true })
    .select()
    .single()
  if (error || !data) return { success: false, error: 'Failed to save schedule.' }
  return { success: true, plan: data as SavedPlan }
}

export async function generateAndSavePlan(opts: {
  goals: string
  daysPerWeek: number
  equipment: string
}): Promise<{ success: boolean; plan?: SavedPlan; error?: string }> {
  if (!opts.goals.trim()) return { success: false, error: 'Describe your goal first.' }
  if (!GEMINI_API_KEY) return { success: false, error: 'AI is not configured.' }

  const rl = await enforceAiLimit()
  if (!rl.allowed) return { success: false, error: rl.error }

  const auth = await getAuth()
  if (!auth) return { success: false, error: 'Not signed in.' }
  const { userId, supabase } = auth

  // Pull a little profile context to personalize.
  const { data: profile } = await supabase
    .from('user_profile')
    .select('age, gender, current_weight_kg, height_cm, activity_level, fitness_goal')
    .eq('id', userId)
    .single()
  const profileStr = profile
    ? `age ${profile.age ?? '?'}, ${profile.gender ?? '?'}, ${profile.current_weight_kg ?? '?'}kg, ${profile.height_cm ?? '?'}cm, activity ${profile.activity_level ?? '?'}`
    : undefined

  let plan: ExercisePlan | null = null
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const result = await model.generateContent(
      exercisePlanPrompt({ goals: opts.goals, daysPerWeek: opts.daysPerWeek, equipment: opts.equipment, profile: profileStr }),
    )
    const parsed = extractJson(result.response.text())
    if (parsed && Array.isArray(parsed.weekly)) {
      plan = {
        summary: parsed.summary || '',
        weekly: parsed.weekly,
        tips: Array.isArray(parsed.tips) ? parsed.tips : [],
      }
    }
  } catch (e) {
    console.error('[v0] generateAndSavePlan gemini error:', e)
  }
  if (!plan) return { success: false, error: 'Could not generate a plan. Try again.' }

  // Deactivate older plans, then insert the new active one.
  await supabase.from('exercise_plans').update({ active: false }).eq('user_id', userId).eq('active', true)
  const { data, error } = await supabase
    .from('exercise_plans')
    .insert({
      user_id: userId,
      goals: opts.goals,
      days_per_week: opts.daysPerWeek,
      equipment: opts.equipment,
      plan,
      active: true,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[v0] generateAndSavePlan insert error:', error?.message)
    return { success: false, error: 'Failed to save plan.' }
  }
  return { success: true, plan: data as SavedPlan }
}

// ---- Habits ---------------------------------------------------------------

export interface Habit {
  id: string
  title: string
  emoji: string | null
  completions: string[]
  created_at: string
}

export async function getHabits(): Promise<Habit[]> {
  const auth = await getAuth()
  if (!auth) return []
  const { data } = await auth.supabase
    .from('habits')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('archived', false)
    .order('created_at', { ascending: true })
  return (data || []).map((h: any) => ({
    id: h.id,
    title: h.title,
    emoji: h.emoji,
    completions: Array.isArray(h.completions) ? h.completions : [],
    created_at: h.created_at,
  }))
}

export async function addHabit(title: string, emoji?: string): Promise<{ success: boolean; habit?: Habit }> {
  const auth = await getAuth()
  if (!auth || !title.trim()) return { success: false }
  const { data } = await auth.supabase
    .from('habits')
    .insert({ user_id: auth.userId, title: title.trim(), emoji: emoji || null, completions: [] })
    .select()
    .single()
  if (!data) return { success: false }
  return { success: true, habit: { id: data.id, title: data.title, emoji: data.emoji, completions: [], created_at: data.created_at } }
}

/** Toggle whether a habit is done for `day` (YYYY-MM-DD, client-local). */
export async function toggleHabitDay(id: string, day: string): Promise<{ success: boolean; completions?: string[] }> {
  const auth = await getAuth()
  if (!auth) return { success: false }
  const { data: row } = await auth.supabase
    .from('habits')
    .select('completions')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single()
  if (!row) return { success: false }
  const set = new Set<string>(Array.isArray(row.completions) ? row.completions : [])
  if (set.has(day)) set.delete(day)
  else set.add(day)
  const completions = Array.from(set).sort()
  await auth.supabase.from('habits').update({ completions }).eq('id', id).eq('user_id', auth.userId)
  return { success: true, completions }
}

export async function deleteHabit(id: string): Promise<{ success: boolean }> {
  const auth = await getAuth()
  if (!auth) return { success: false }
  await auth.supabase.from('habits').delete().eq('id', id).eq('user_id', auth.userId)
  return { success: true }
}

// ---- Tasks ----------------------------------------------------------------

export interface Task {
  id: string
  title: string
  task_date: string | null
  done: boolean
  created_at: string
}

/** Today's tasks plus any earlier unfinished ones (so nothing silently drops). */
export async function getTasks(today: string): Promise<Task[]> {
  const auth = await getAuth()
  if (!auth) return []
  const { data } = await auth.supabase
    .from('tasks')
    .select('*')
    .eq('user_id', auth.userId)
    .or(`task_date.eq.${today},and(done.eq.false,task_date.lte.${today})`)
    .order('created_at', { ascending: true })
  return (data || []) as Task[]
}

export async function addTask(title: string, day: string): Promise<{ success: boolean; task?: Task }> {
  const auth = await getAuth()
  if (!auth || !title.trim()) return { success: false }
  const { data } = await auth.supabase
    .from('tasks')
    .insert({ user_id: auth.userId, title: title.trim(), task_date: day, done: false })
    .select()
    .single()
  if (!data) return { success: false }
  return { success: true, task: data as Task }
}

export async function toggleTask(id: string, done: boolean): Promise<{ success: boolean }> {
  const auth = await getAuth()
  if (!auth) return { success: false }
  await auth.supabase.from('tasks').update({ done }).eq('id', id).eq('user_id', auth.userId)
  return { success: true }
}

export async function deleteTask(id: string): Promise<{ success: boolean }> {
  const auth = await getAuth()
  if (!auth) return { success: false }
  await auth.supabase.from('tasks').delete().eq('id', id).eq('user_id', auth.userId)
  return { success: true }
}

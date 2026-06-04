'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

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

/** Read the user's saved city (stored in user_profile.location). */
export async function getProfileCity(): Promise<string | null> {
  const auth = await getAuth()
  if (!auth) return null
  const { data } = await auth.supabase
    .from('user_profile')
    .select('location')
    .eq('id', auth.userId)
    .single()
  return (data?.location as string) || null
}

export async function saveCity(city: string): Promise<{ success: boolean }> {
  const auth = await getAuth()
  if (!auth) return { success: false }
  await auth.supabase
    .from('user_profile')
    .update({ location: city.trim(), updated_at: new Date().toISOString() })
    .eq('id', auth.userId)
  return { success: true }
}

export interface DailyBrief {
  topic: 'personal_growth' | 'health' | 'time_management'
  topic_label: string
  title: string
  article: string
  takeaways: string[]
  micro_action: string
  food: { name: string; why: string; local_note: string; how_to_use: string }
}

const TOPICS = [
  { key: 'personal_growth', label: 'Personal Growth' },
  { key: 'health', label: 'Health & Body' },
  { key: 'time_management', label: 'Time Management' },
] as const

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Generate a fresh daily brief: a short practical article on a rotating topic
 * plus a localized, seasonal "food to discover" suggestion. Topic rotates by
 * the date so the user gets variety across days.
 */
export async function generateDailyBrief(city?: string): Promise<{ success: boolean; brief?: DailyBrief; error?: string }> {
  if (!GEMINI_API_KEY) return { success: false, error: 'AI is not configured.' }

  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const topic = TOPICS[dayOfYear % TOPICS.length]
  const month = MONTHS[now.getMonth()]
  const where = city?.trim() ? city.trim() : 'the user’s region'

  const prompt = `You are the daily "Discover" writer for a personal-growth & health app. Write ONE fresh, specific, practical brief for today (${month}).

Today's focus topic: ${topic.label}.

Return ONLY a single JSON object, no prose, EXACTLY:
{
  "title": "punchy, specific title (max ~8 words)",
  "article": "130-180 words, practical and evidence-informed, friendly second person. One concrete idea the reader probably doesn't know, with the why and how. No fluff, no medical claims.",
  "takeaways": ["3 short bullet takeaways"],
  "micro_action": "one tiny action to do today (one sentence)",
  "food": {
    "name": "an underrated, genuinely nutritious food that is seasonal/available around ${where} in ${month}",
    "why": "1-2 sentences on its standout nutrients/benefits",
    "local_note": "where/how to find it around ${where} and that it's good this time of year",
    "how_to_use": "one simple way to eat it"
  }
}

Make it different from generic advice. Prefer lesser-known foods over obvious ones (not just 'spinach' or 'almonds'). Keep it encouraging and non-preachy. Output only the JSON.`

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
    const result = await model.generateContent(prompt)
    const parsed = extractJson(result.response.text())
    if (!parsed) return { success: false, error: 'Could not generate today’s brief. Try again.' }

    return {
      success: true,
      brief: {
        topic: topic.key,
        topic_label: topic.label,
        title: parsed.title || 'Today’s Brief',
        article: parsed.article || '',
        takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways.slice(0, 4) : [],
        micro_action: parsed.micro_action || '',
        food: {
          name: parsed.food?.name || '',
          why: parsed.food?.why || '',
          local_note: parsed.food?.local_note || '',
          how_to_use: parsed.food?.how_to_use || '',
        },
      },
    }
  } catch (e) {
    console.error('[v0] generateDailyBrief error:', e)
    return { success: false, error: 'AI request failed. Try again.' }
  }
}

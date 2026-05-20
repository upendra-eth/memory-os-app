// Supabase Edge Function — runs on Deno, not Node.
// Deploy:   supabase functions deploy generate-day-digest --no-verify-jwt
// Schedule: see supabase/sql/cron.sql (Phase 9 — nightly 23:45 IST)
//
// Generates an AI day digest for every user that has at least one entry today
// and upserts it into day_digests.

// @ts-ignore — Deno imports work at runtime in Supabase
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — Deno imports work at runtime in Supabase
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1'

// @ts-ignore — Deno global
declare const Deno: { env: { get: (k: string) => string | undefined }; serve: (h: (r: Request) => Response | Promise<Response>) => void }

const dayDigestPrompt = (entries: string, profile: string) => `
You are summarizing a user's life from their logged entries for a personal life-logging app.
Create a concise but insightful daily digest that captures the day's essence.

User Profile:
${profile}

Today's Log Entries:
${entries}

Generate a JSON digest:
{
  "morning_summary": "What happened/was planned in the morning (1 sentence)",
  "afternoon_summary": "Afternoon activities and mood (1 sentence)",
  "evening_summary": "Evening reflections and sleep prep (1 sentence)",
  "full_day_digest": "Complete narrative summary (2-3 sentences)",
  "patterns_noticed": ["Pattern 1", "Pattern 2"]
}
`

function stripFences(text: string): string {
  let t = text.trim()
  if (t.startsWith('```json')) t = t.slice(7)
  if (t.startsWith('```')) t = t.slice(3)
  if (t.endsWith('```')) t = t.slice(0, -3)
  return t.trim()
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), { status: 500 })
  }

  // Allow caller to override the date (defaults to today UTC); IST cron fires at 23:45 IST = 18:15 UTC.
  let date: string
  try {
    const body = await req.json().catch(() => ({}))
    date = body.date ?? new Date().toISOString().split('T')[0]
  } catch {
    date = new Date().toISOString().split('T')[0]
  }

  const { data: users } = await supabase
    .from('user_profile')
    .select('id, display_name, fitness_goal, nutrition_goal')

  if (!users || users.length === 0) return new Response(JSON.stringify({ processed: 0 }))

  const genAI = new GoogleGenerativeAI(geminiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

  let processed = 0
  for (const user of users as Array<{ id: string; display_name?: string; fitness_goal?: string; nutrition_goal?: string }>) {
    const { data: entries } = await supabase
      .from('entries')
      .select('narrative_text, extracted_json, created_at')
      .eq('user_id', user.id)
      .gte('created_at', `${date}T00:00:00`)
      .lt('created_at', `${date}T23:59:59`)
      .order('created_at', { ascending: true })

    if (!entries || entries.length === 0) continue

    const entriesText = entries
      .map((e) => `[${new Date(e.created_at).toISOString()}] ${e.narrative_text}`)
      .join('\n\n')

    const profileText = `Name: ${user.display_name ?? 'User'}\nGoals: ${user.fitness_goal ?? 'none'} / ${user.nutrition_goal ?? 'none'}`

    try {
      const result = await model.generateContent(dayDigestPrompt(entriesText, profileText))
      const parsed = JSON.parse(stripFences(result.response.text()))

      await supabase.from('day_digests').upsert(
        {
          user_id: user.id,
          digest_date: date,
          morning_summary: parsed.morning_summary ?? null,
          afternoon_summary: parsed.afternoon_summary ?? null,
          evening_summary: parsed.evening_summary ?? null,
          full_day_digest: parsed.full_day_digest ?? null,
          patterns_noticed: parsed.patterns_noticed ?? [],
        },
        { onConflict: 'user_id,digest_date' }
      )
      processed++
    } catch (err) {
      console.error(`Digest failed for user ${user.id}:`, err)
    }
  }

  return new Response(JSON.stringify({ processed, date }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

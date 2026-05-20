// Supabase Edge Function — Phase 11 weekly contextual questions.
// Deploy:   supabase functions deploy generate-questions --no-verify-jwt
// Schedule: see supabase/sql/cron.sql (Sunday 09:00 IST)
//
// For each user: looks at profile completeness + last 7 days of entries,
// asks Gemini to propose 1-3 questions, and inserts them into ai_questions
// with status='pending'. Skips users that already have ≥3 pending questions.

// @ts-ignore — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — Deno runtime
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.1'

// @ts-ignore
declare const Deno: { env: { get: (k: string) => string | undefined }; serve: (h: (r: Request) => Response | Promise<Response>) => void }

const weeklyQuestionPrompt = (gaps: string[], recentEntries: string) => `
You are generating contextual health questions for a personal life-logging app.
Based on the user's profile gaps and recent entries, suggest 1-3 specific, actionable questions.

Profile Gaps (incomplete fields): ${gaps.join(', ') || 'none'}

Recent Entries Summary (last 7 days):
${recentEntries}

Return JSON only:
[
  { "question": "...", "context": "...", "expected_action": "new_entry|update_profile|view_dashboard", "options": ["..."] }
]

Provide an "options" array (3-5 short choices) when the question has a small answer set; omit or use [] otherwise.
`

function stripFences(text: string): string {
  let t = text.trim()
  if (t.startsWith('```json')) t = t.slice(7)
  if (t.startsWith('```')) t = t.slice(3)
  if (t.endsWith('```')) t = t.slice(0, -3)
  return t.trim()
}

function profileGaps(profile: Record<string, unknown>): string[] {
  const fields = [
    'age', 'gender', 'height_cm', 'current_weight_kg', 'activity_level',
    'fitness_goal', 'nutrition_goal', 'sleep_target_hours',
  ]
  return fields.filter((f) => profile[f] == null || profile[f] === '')
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), { status: 500 })
  }

  const { data: users } = await supabase.from('user_profile').select('*')
  if (!users) return new Response(JSON.stringify({ processed: 0 }))

  const genAI = new GoogleGenerativeAI(geminiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffIso = cutoff.toISOString()

  let processed = 0
  for (const user of users as Array<Record<string, unknown> & { id: string }>) {
    const { count: pendingCount } = await supabase
      .from('ai_questions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')

    if ((pendingCount ?? 0) >= 3) continue

    const { data: entries } = await supabase
      .from('entries')
      .select('summary, created_at')
      .eq('user_id', user.id)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(20)

    const summary = (entries ?? [])
      .map((e) => `- [${new Date(e.created_at).toISOString().slice(0, 10)}] ${e.summary ?? ''}`)
      .join('\n') || 'No entries in the last 7 days.'

    try {
      const result = await model.generateContent(weeklyQuestionPrompt(profileGaps(user), summary))
      const parsed = JSON.parse(stripFences(result.response.text())) as Array<{
        question: string
        context: string
        expected_action: string
        options?: string[]
      }>

      if (!Array.isArray(parsed) || parsed.length === 0) continue

      const rows = parsed.slice(0, 3).map((q) => ({
        user_id: user.id,
        question: q.question,
        context: q.context,
        expected_action: q.expected_action,
        options: q.options ?? [],
        status: 'pending',
      }))

      await supabase.from('ai_questions').insert(rows)
      processed++
    } catch (err) {
      console.error(`Questions failed for user ${user.id}:`, err)
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

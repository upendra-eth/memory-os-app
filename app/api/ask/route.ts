import { searchEntries, generateAnswer } from '@/lib/rag'
import { formatEntriesForContext } from '@/lib/rag-format'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get profile ID
    const { data: profile } = await supabase
      .from('user_profile')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { question, history } = await req.json()

    if (!question) {
      return Response.json(
        { error: 'Question is required' },
        { status: 400 }
      )
    }

    // Format the recent conversation turns so follow-up questions have context.
    const conversationHistory = Array.isArray(history)
      ? history
          .slice(-6)
          .map((m: { role: string; content: string }) =>
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`,
          )
          .join('\n')
      : ''

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) {
      return Response.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      )
    }

    // Search for relevant entries using profile ID
    const entries = await searchEntries(profile.id, question, 20)
    const context = formatEntriesForContext(entries)

    // Pull in health reports and active issues so the assistant can reason over
    // the user's whole health picture, not just daily logs.
    const [{ data: reports }, { data: issues }] = await Promise.all([
      supabase
        .from('lab_results')
        .select('test_name, test_date, results, ai_analysis')
        .eq('user_id', profile.id)
        .order('test_date', { ascending: false })
        .limit(8),
      supabase
        .from('health_issues')
        .select('title, category, status, severity_1_10, description, started_on')
        .eq('user_id', profile.id)
        .neq('status', 'resolved')
        .order('updated_at', { ascending: false })
        .limit(20),
    ])

    const reportsBlock = (reports || []).length
      ? '\n\nHealth Reports:\n' +
        (reports || [])
          .map((r: any) => {
            const markers = Array.isArray(r.results?.markers)
              ? r.results.markers
                  .map((m: any) => `${m.name}: ${m.value ?? '—'}${m.unit ? ' ' + m.unit : ''}${m.flag && m.flag !== 'normal' ? ` (${m.flag})` : ''}`)
                  .join('; ')
              : ''
            return `[${r.test_date || '?'}] ${r.test_name}: ${markers}${r.ai_analysis ? ` — ${r.ai_analysis}` : ''}`
          })
          .join('\n')
      : ''

    const issuesBlock = (issues || []).length
      ? '\n\nActive Health Issues:\n' +
        (issues || [])
          .map((i: any) => `${i.title} (${i.category || 'other'}, ${i.status}${typeof i.severity_1_10 === 'number' ? `, severity ${i.severity_1_10}/10` : ''})${i.description ? `: ${i.description}` : ''}`)
          .join('\n')
      : ''

    const fullContext = `User: ${profile?.display_name || 'User'}\nGoals: ${profile?.fitness_goal || 'Not specified'}\n\nRecent Life Logs:\n${context}${reportsBlock}${issuesBlock}`

    // Generate answer using Gemini
    const answer = await generateAnswer(question, fullContext, apiKey, conversationHistory)

    // Save to ask_history
    await supabase.from('ask_history').insert({
      user_id: profile.id,
      question,
      answer,
      citations: entries.slice(0, 5).map((e) => ({ date: e.created_at, id: e.id })),
    })

    return Response.json({
      answer,
      citations: entries.slice(0, 5).map((e) => ({
        date: e.created_at,
        excerpt: e.narrative_text?.substring(0, 100),
      })),
    })
  } catch (error) {
    console.error('Ask API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate answer' },
      { status: 500 }
    )
  }
}

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

    const { question } = await req.json()

    if (!question) {
      return Response.json(
        { error: 'Question is required' },
        { status: 400 }
      )
    }

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

    const fullContext = `User: ${profile?.display_name || 'User'}\nGoals: ${profile?.fitness_goal || 'Not specified'}\n\nRecent Life Logs:\n${context}`

    // Generate answer using Gemini
    const answer = await generateAnswer(question, fullContext, apiKey)

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

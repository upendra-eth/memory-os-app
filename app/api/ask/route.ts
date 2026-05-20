import { searchEntries, generateAnswer } from '@/lib/rag'
import { formatEntriesForContext } from '@/lib/rag-format'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { question, userId } = await req.json()

    if (!question || !userId) {
      return Response.json(
        { error: 'Question and userId are required' },
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

    // Search for relevant entries
    const entries = await searchEntries(userId, question, 20)
    const context = formatEntriesForContext(entries)

    // Get user profile for additional context
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('user_profile')
      .select('*')
      .eq('id', userId)
      .single()

    const fullContext = `User: ${profile?.display_name || 'User'}\nGoals: ${profile?.fitness_goal || 'Not specified'}\n\nRecent Life Logs:\n${context}`

    // Generate answer using Gemini
    const answer = await generateAnswer(question, fullContext, apiKey)

    // Save to ask_history
    await supabase.from('ask_history').insert({
      user_id: userId,
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

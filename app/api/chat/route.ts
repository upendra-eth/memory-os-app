import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import type { GeminiResponse } from '@/lib/types'

export const maxDuration = 60

const SYSTEM_PROMPT = `You are a UI Orchestrator for a health and fitness tracking app called Memory OS. 
Analyze the user's life logs and their question carefully.

IMPORTANT: You must ONLY return valid JSON in one of these two formats:

1. For data that benefits from visualization (trends, comparisons, progress over time):
{
  "type": "chart",
  "chartType": "line" | "bar" | "area",
  "title": "Chart title",
  "data": [{ "name": "Label", "value": 123 }, ...],
  "xKey": "name",
  "yKey": "value"
}

2. For insights, summaries, or text-based analysis:
{
  "type": "summary",
  "text": "Your detailed analysis here...",
  "highlights": ["Key point 1", "Key point 2"]
}

Rules:
- Use "chart" when showing trends, progress, comparisons, or time-series data
- Use "summary" for general insights, recommendations, or when data is insufficient for visualization
- For chart data, ensure all data points have consistent keys
- Be specific and actionable in your analysis
- Reference actual data from the logs when available
- If no relevant data exists, provide a helpful summary explaining what data would be needed

Strictly return ONLY the JSON object, no additional text or markdown.`

export async function POST(req: Request) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { question } = await req.json()

    if (!question || typeof question !== 'string') {
      return Response.json({ error: 'Question is required' }, { status: 400 })
    }

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) {
      return Response.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      )
    }

    // Fetch logs from the last 14 days (RLS ensures only this user's data)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 14)

    const { data: logs, error: dbError } = await supabase
      .from('life_logs')
      .select('*')
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })

    if (dbError) {
      return Response.json({ error: 'Failed to fetch logs' }, { status: 500 })
    }

    const logsContext = logs && logs.length > 0
      ? `Here are the user's life logs from the last 14 days:\n\n${JSON.stringify(logs, null, 2)}`
      : 'No logs found in the last 14 days.'

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // Create the prompt with system instruction
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${logsContext}\n\nUser's question: ${question}`

    // Call Gemini API
    const result = await model.generateContent(fullPrompt)
    const responseText = result.response.text()

    // Parse the response
    let response: GeminiResponse
    try {
      // Clean the response text - remove markdown code blocks if present
      let cleanText = responseText.trim()
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.slice(7)
      }
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.slice(3)
      }
      if (cleanText.endsWith('```')) {
        cleanText = cleanText.slice(0, -3)
      }
      cleanText = cleanText.trim()
      
      response = JSON.parse(cleanText) as GeminiResponse
    } catch {
      // If parsing fails, wrap the response as a summary
      response = {
        type: 'summary',
        text: responseText,
      }
    }

    return Response.json({ response, logsCount: logs?.length ?? 0 })
  } catch (error) {
    console.error('Chat API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    )
  }
}

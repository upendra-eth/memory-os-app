'use server'

import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { SearchResult } from '@/lib/rag-format'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

async function embedQuestion(question: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
    const result = await model.embedContent(question)
    return result.embedding.values || null
  } catch (error) {
    console.error('Question embedding error:', error)
    return null
  }
}

export async function searchEntries(
  userId: string,
  question: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const supabase = await createClient()

  const queryEmbedding = await embedQuestion(question)

  if (queryEmbedding) {
    const { data: matches, error: rpcError } = await supabase.rpc('match_entries', {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_count: limit,
    })

    if (!rpcError && matches) {
      return (matches as Array<Record<string, unknown> & { similarity: number }>).map((m) => ({
        id: m.id as string,
        created_at: m.created_at as string,
        narrative_text: (m.narrative_text as string) ?? '',
        extracted_json: (m.extracted_json as Record<string, unknown>) ?? {},
        relevance_score: m.similarity,
      }))
    }

    console.warn('Vector search failed, falling back to keyword search:', rpcError?.message)
  }

  return keywordSearch(supabase, userId, question, limit)
}

async function keywordSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  question: string,
  limit: number
): Promise<SearchResult[]> {
  const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3)

  const { data: entries, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !entries) {
    console.error('Search error:', error)
    return []
  }

  return entries
    .map((entry) => {
      let score = 0

      if (entry.narrative_text) {
        keywords.forEach((kw) => {
          const count = (entry.narrative_text.toLowerCase().match(new RegExp(kw, 'g')) || []).length
          score += count * 2
        })
      }

      if (entry.extracted_json) {
        const jsonStr = JSON.stringify(entry.extracted_json).toLowerCase()
        keywords.forEach((kw) => {
          const count = (jsonStr.match(new RegExp(kw, 'g')) || []).length
          score += count
        })
      }

      const daysOld = (Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24)
      score += Math.max(0, 5 - daysOld * 0.1)

      return { ...entry, relevance_score: score }
    })
    .filter((e) => e.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit) as SearchResult[]
}

export async function generateAnswer(
  question: string,
  context: string,
  apiKey: string,
  conversationHistory: string = ''
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

  const { askPrompt } = await import('@/lib/prompts/ask')
  const prompt = askPrompt(question, context, conversationHistory)

  const result = await model.generateContent(prompt)
  return result.response.text()
}

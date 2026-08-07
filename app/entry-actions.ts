'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { getNormalizerPrompt } from '@/lib/prompts/normalizer'
import type { ExtractedJSON } from '@/lib/extraction-schema'
import { sanitizeExtractedJSON, isEmptyExtractedJSON } from '@/lib/extraction-schema'
import { parseThreeSectionPaste } from '@/lib/parse-entry'
import { enforceAiLimit } from '@/lib/rate-limit'
import { entryNutrition, recomputeDailyAggregate, recordEntities } from '@/lib/entry-side-effects'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

/**
 * Get the current user's profile ID from auth session
 */
async function getAuthProfileId(): Promise<{ userId: string; supabase: any } | null> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.error('[entry-actions] Auth failed:', authError?.message || 'No user in session')
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) {
    console.error('[entry-actions] No profile found for auth_user_id:', user.id, 'Error:', profileError?.message)

    // Auto-create a basic profile for authenticated users who skipped onboarding
    // (common with Google OAuth sign-in)
    const email = user.email || ''
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'User'

    const { data: newProfile, error: insertError } = await supabase
      .from('user_profile')
      .insert({
        auth_user_id: user.id,
        email,
        display_name: displayName,
        age: 0,
        gender: 'other',
        height_cm: 0,
        current_weight_kg: 0,
        target_weight_kg: 0,
        activity_level: 'moderate',
        nutrition_goal: 'maintain',
        onboarding_completed: false,
      })
      .select('id')
      .single()

    if (insertError || !newProfile) {
      console.error('[entry-actions] Failed to auto-create profile:', insertError?.message)
      return null
    }

    console.log('[entry-actions] Auto-created profile for user:', user.id, '→', newProfile.id)
    return { userId: newProfile.id, supabase }
  }

  return { userId: profile.id, supabase }
}

/**
 * Get list of known entities from database
 */
export async function getKnownEntities(): Promise<Record<string, string[]>> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) return { people: [], foods: [], exercises: [], places: [] }

    const { data: entities, error } = await auth.supabase
      .from('entities')
      .select('entity_type, entity_name')
      .eq('user_id', auth.userId)

    if (error) {
      console.error('Error fetching entities:', error)
      return { people: [], foods: [], exercises: [], places: [] }
    }

    const grouped: Record<string, string[]> = {
      people: [],
      foods: [],
      exercises: [],
      places: [],
    }

    entities?.forEach((e: any) => {
      const type = e.entity_type
      if (grouped[type]) {
        grouped[type].push(e.entity_name)
      }
    })

    return grouped
  } catch (error) {
    console.error('Error getting known entities:', error)
    return { people: [], foods: [], exercises: [], places: [] }
  }
}

/**
 * Tolerantly extract a JSON object from an LLM response.
 * Handles markdown fences, leading/trailing prose, and falls back to slicing
 * the outermost { ... } if a direct parse fails. Throws if nothing parses.
 */
function parseJsonFromModel(responseText: string): unknown {
  let text = responseText.trim()

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  try {
    return JSON.parse(text)
  } catch {
    // Fall back to the substring between the first { and the last }
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first !== -1 && last > first) {
      return JSON.parse(text.slice(first, last + 1))
    }
    throw new Error('Model response did not contain valid JSON')
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Call Gemini normalizer to convert EXTRACTED text to JSON.
 *
 * Hardened: requests JSON output mode, retries on transient failures with
 * backoff, tolerantly parses the response, and runs it through the schema
 * sanitizer so callers always receive a well-formed ExtractedJSON.
 */
export async function normalizeWithGemini(
  extractedText: string,
  knownEntities: Record<string, string[]>
): Promise<{
  success: boolean
  data?: ExtractedJSON
  error?: string
}> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'Gemini API key not configured' }
  }

  if (!extractedText.trim()) {
    return { success: false, error: 'Nothing to normalize (empty EXTRACTED section)' }
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      // Force the model to emit a single JSON object — no markdown, no prose.
      responseMimeType: 'application/json',
      temperature: 0,
    },
  })

  const prompt = getNormalizerPrompt(extractedText, knownEntities)
  const MAX_ATTEMPTS = 3
  let lastError = 'Normalization failed'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent(prompt)
      const parsed = parseJsonFromModel(result.response.text())
      const data = sanitizeExtractedJSON(parsed)

      if (isEmptyExtractedJSON(data)) {
        // Parsed fine but the model extracted nothing — usually a content issue,
        // not transient, so don't burn retries on it.
        return {
          success: false,
          error: 'Gemini could not extract any structured data from the EXTRACTED section',
        }
      }

      return { success: true, data }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Normalization failed'
      console.error(`[entry-actions] Gemini normalization attempt ${attempt}/${MAX_ATTEMPTS} failed:`, lastError)
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 600) // 600ms, 1200ms backoff
      }
    }
  }

  return { success: false, error: lastError }
}

/**
 * Generate embedding for entry text using Gemini
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    console.error('Gemini API key not configured')
    return []
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })

    const result = await model.embedContent(text)
    return result.embedding.values || []
  } catch (error) {
    console.error('Embedding error:', error)
    return []
  }
}

/**
 * Save entry to database with all related data.
 * Uses auth session to determine user — no email parameter needed.
 */
export async function saveEntry(params: {
  rawText: string
  narrative: string
  extractedJson: ExtractedJSON
  /** YYYY-MM-DD the entry is FOR. Wins over the date in the paste; defaults to today. */
  logDate?: string
}): Promise<{
  success: boolean
  entryId?: string
  logDate?: string
  error?: string
}> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) {
      return { success: false, error: 'Not authenticated or profile not found' }
    }

    const { userId, supabase } = auth

    // Defense-in-depth: even if a caller passes raw model output, store a clean shape.
    const extractedJson = sanitizeExtractedJSON(params.extractedJson)

    // Resolve the day this entry is ABOUT. Precedence: explicit picker date →
    // date parsed from the paste → today. This is what keeps backfilled entries
    // from all collapsing onto today.
    const todayStr = new Date().toISOString().slice(0, 10)
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const effectiveDate =
      (params.logDate && dateRe.test(params.logDate) && params.logDate) ||
      extractedJson.log_date ||
      todayStr
    extractedJson.log_date = effectiveDate
    // created_at carries the date so existing created_at-ordered queries (timeline,
    // day view, recency) stay correct. Today → real timestamp; backfill → noon UTC
    // (safe inside the day for any timezone) to preserve chronological position.
    const createdAt = effectiveDate === todayStr ? new Date().toISOString() : `${effectiveDate}T12:00:00.000Z`

    // Generate embedding (degrades gracefully to null if Gemini is unavailable)
    const embedding = await generateEmbedding(params.narrative)

    // Generate summary
    const summary = generateSummary(extractedJson)

    // Prepare entry data
    const entryData = {
      user_id: userId,
      raw_text: params.rawText,
      normalized_text: params.narrative,
      narrative_text: params.narrative,
      extracted_json: extractedJson,
      summary,
      embedding: embedding.length > 0 ? embedding : null,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    }

    // Insert entry
    const { data: entry, error: insertError } = await supabase
      .from('entries')
      .insert(entryData)
      .select()
      .single()

    if (insertError || !entry) {
      console.error('[entry-actions] Insert entry error:', JSON.stringify(insertError, null, 2))
      return { success: false, error: 'Failed to save entry' }
    }

    // The entry row is now persisted. Everything below is a best-effort
    // side-effect — a failure here must NOT lose the user's saved entry, so
    // each block is isolated and only logs on error.
    if (extractedJson.entities) {
      try {
        await recordEntities(userId, extractedJson.entities, supabase)
      } catch (e) {
        console.error('[v0] recordEntities failed (entry still saved):', e)
      }
    }

    try {
      // Recompute the WHOLE day from every entry on this date, so logging a day
      // in pieces (half now, rest later) sums correctly instead of overwriting.
      await recomputeDailyAggregate(userId, effectiveDate, supabase)
    } catch (e) {
      console.error('[v0] recomputeDailyAggregate failed (entry still saved):', e)
    }

    return { success: true, entryId: entry.id, logDate: effectiveDate }
  } catch (error) {
    console.error('Save entry error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save entry',
    }
  }
}

/**
 * One-shot entry pipeline: parse → fetch known entities → normalize → save.
 *
 * This is the preferred entry point for the UI: it collapses what used to be
 * three separate client→server round trips into a single server action, so the
 * normalized JSON never leaves the server and a network blip mid-flow can't
 * strand the user between steps. Returns a `step` hint so the UI can show where
 * a failure happened.
 */
export async function processAndSaveEntry(
  fullPaste: string,
  logDate?: string
): Promise<{
  success: boolean
  entryId?: string
  summary?: string
  logDate?: string
  error?: string
  step?: 'parse' | 'normalize' | 'save'
}> {
  if (!fullPaste.trim()) {
    return { success: false, error: 'Please paste content', step: 'parse' }
  }

  const parsed = parseThreeSectionPaste(fullPaste)
  if (!parsed.extracted.trim()) {
    return {
      success: false,
      step: 'parse',
      error:
        'No EXTRACTED section found. Expected format: === RAW === ... === NARRATIVE === ... === EXTRACTED === ...',
    }
  }

  const rl = await enforceAiLimit()
  if (!rl.allowed) {
    return { success: false, step: 'normalize', error: rl.error || 'AI limit reached' }
  }

  const knownEntities = await getKnownEntities()

  const normResult = await normalizeWithGemini(parsed.extracted, knownEntities)
  if (!normResult.success || !normResult.data) {
    return { success: false, step: 'normalize', error: normResult.error || 'Normalization failed' }
  }

  const saveResult = await saveEntry({
    rawText: parsed.raw,
    narrative: parsed.narrative,
    extractedJson: normResult.data,
    logDate,
  })

  if (!saveResult.success) {
    return { success: false, step: 'save', error: saveResult.error || 'Failed to save entry' }
  }

  return {
    success: true,
    entryId: saveResult.entryId,
    summary: generateSummary(normResult.data),
    logDate: saveResult.logDate,
  }
}

/**
 * What's already logged for a given day — powers the "you've already logged X
 * for this day, your new entry will be added" hint in the Add form.
 */
export async function getDayLogStatus(date: string): Promise<{
  entryCount: number
  kcal: number | null
  workouts: number | null
  summaries: string[]
}> {
  const empty = { entryCount: 0, kcal: null, workouts: null, summaries: [] as string[] }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return empty
  const auth = await getAuthProfileId()
  if (!auth) return empty
  const { userId, supabase } = auth

  const from = new Date(date + 'T00:00:00.000Z')
  from.setUTCDate(from.getUTCDate() - 1)
  const to = new Date(date + 'T00:00:00.000Z')
  to.setUTCDate(to.getUTCDate() + 2)

  const { data: rows } = await supabase
    .from('entries')
    .select('extracted_json, summary, created_at')
    .eq('user_id', userId)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())
    .order('created_at', { ascending: true })

  const dayRows = (rows || []).filter(
    (r: any) => ((r.extracted_json as ExtractedJSON)?.log_date || r.created_at.slice(0, 10)) === date
  )

  // Computed from the day's entries we already have in hand rather than read
  // back from daily_aggregates — one fewer round trip, and the hint stays
  // correct even if the aggregate row for the day was never written.
  let kcal = 0
  let workouts = 0
  for (const r of dayRows) {
    const ex = (r.extracted_json as ExtractedJSON) || {}
    kcal += entryNutrition(ex).kcal
    workouts += (ex.workouts?.length || 0) + (ex.cardio?.length || 0)
  }

  return {
    entryCount: dayRows.length,
    kcal: kcal > 0 ? Math.round(kcal) : null,
    workouts: dayRows.length > 0 ? workouts : null,
    summaries: dayRows.map((r: any) => r.summary).filter(Boolean).slice(0, 3),
  }
}

/**
 * Generate a summary from extracted JSON
 */
function generateSummary(extracted: ExtractedJSON): string {
  const parts: string[] = []

  if (extracted.body?.weight_today_kg) {
    parts.push(`Weight: ${extracted.body.weight_today_kg}kg`)
  }
  if (extracted.body?.sleep_hours) {
    parts.push(`Sleep: ${extracted.body.sleep_hours}h`)
  }
  if (extracted.nutrition && extracted.nutrition.length > 0) {
    const totalKcal = extracted.nutrition.reduce((sum, n) => sum + (n.est_kcal || 0), 0)
    parts.push(`Nutrition: ${totalKcal} kcal`)
  }
  if (extracted.workouts && extracted.workouts.length > 0) {
    parts.push(`Workouts: ${extracted.workouts.length}`)
  }
  if (extracted.mental?.stress_1_10) {
    parts.push(`Stress: ${extracted.mental.stress_1_10}/10`)
  }

  return parts.join(' | ') || 'Entry logged'
}

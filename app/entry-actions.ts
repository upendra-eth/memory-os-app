'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { getNormalizerPrompt } from '@/lib/prompts/normalizer'
import type { ExtractedJSON } from '@/lib/extraction-schema'
import { detectMedical, buildMedicalAuditItems } from '@/lib/entity-detection'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

/**
 * Get the current user's profile ID from auth session
 */
async function getAuthProfileId(): Promise<{ userId: string; supabase: any } | null> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) {
    return null
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
 * Call Gemini normalizer to convert EXTRACTED text to JSON
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

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    const prompt = getNormalizerPrompt(extractedText, knownEntities)

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // Parse JSON response
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

    const extracted: ExtractedJSON = JSON.parse(cleanText)
    return { success: true, data: extracted }
  } catch (error) {
    console.error('Gemini normalization error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Normalization failed',
    }
  }
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
    const model = genAI.getGenerativeModel({ model: 'embedding-001' })

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
}): Promise<{
  success: boolean
  entryId?: string
  auditCount?: number
  error?: string
}> {
  try {
    const auth = await getAuthProfileId()
    if (!auth) {
      return { success: false, error: 'Not authenticated or profile not found' }
    }

    const { userId, supabase } = auth

    // Generate embedding
    const embedding = await generateEmbedding(params.narrative)

    // Generate summary
    const summary = generateSummary(params.extractedJson)

    // Prepare entry data
    const entryData = {
      user_id: userId,
      raw_text: params.rawText,
      normalized_text: params.narrative,
      narrative_text: params.narrative,
      extracted_json: params.extractedJson,
      summary,
      embedding: embedding.length > 0 ? embedding : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Insert entry
    const { data: entry, error: insertError } = await supabase
      .from('entries')
      .insert(entryData)
      .select()
      .single()

    if (insertError || !entry) {
      return { success: false, error: 'Failed to save entry' }
    }

    // Process entities
    if (params.extractedJson.entities) {
      await processEntities(userId, params.extractedJson.entities, supabase)
    }

    // Create audit items
    let auditCount = 0
    if (params.extractedJson.audit && params.extractedJson.audit.length > 0) {
      auditCount = await createAuditItems(userId, entry.id, params.extractedJson.audit, supabase)
    }

    // Phase 12: medical detector — flag medications / conditions / symptoms for profile sync
    if (params.narrative.trim()) {
      const detection = await detectMedical(params.narrative)
      const medicalItems = buildMedicalAuditItems(userId, entry.id, detection)
      if (medicalItems.length > 0) {
        const { error: medErr } = await supabase.from('audit_items').insert(medicalItems)
        if (!medErr) auditCount += medicalItems.length
        else console.error('[v0] Medical audit insert error:', medErr)
      }
    }

    // Update daily aggregates
    await updateDailyAggregates(userId, params.extractedJson, supabase)

    return { success: true, entryId: entry.id, auditCount }
  } catch (error) {
    console.error('Save entry error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save entry',
    }
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

/**
 * Process entities (people, foods, exercises, places)
 */
async function processEntities(
  userId: string,
  entities: any,
  supabase: any
): Promise<void> {
  const allEntities = [
    ...(entities.people || []).map((e: string) => ({ name: e, type: 'person' })),
    ...(entities.foods || []).map((e: string) => ({ name: e, type: 'food' })),
    ...(entities.exercises || []).map((e: string) => ({ name: e, type: 'exercise' })),
    ...(entities.places || []).map((e: string) => ({ name: e, type: 'place' })),
  ]

  for (const entity of allEntities) {
    // Upsert entity
    await supabase
      .from('entities')
      .upsert(
        {
          user_id: userId,
          entity_type: entity.type,
          entity_name: entity.name,
          mention_count: 1,
        },
        {
          onConflict: ['user_id', 'entity_type', 'entity_name'],
        }
      )
  }
}

/**
 * Create audit items from extracted data
 */
async function createAuditItems(
  userId: string,
  entryId: string,
  auditItems: any[],
  supabase: any
): Promise<number> {
  try {
    const itemsToInsert = auditItems.map((item) => ({
      user_id: userId,
      entry_id: entryId,
      audit_type: item.reason,
      status: 'pending',
      suggested_value: { field: item.field, reason: item.reason },
    }))

    const { data, error } = await supabase.from('audit_items').insert(itemsToInsert)

    if (error) {
      console.error('Audit insert error:', error)
      return 0
    }

    return itemsToInsert.length
  } catch (error) {
    console.error('Create audit items error:', error)
    return 0
  }
}

/**
 * Update daily aggregates based on entry data
 */
async function updateDailyAggregates(userId: string, extracted: ExtractedJSON, supabase: any): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]

    const calories = extracted.nutrition?.reduce((sum, n) => sum + (n.est_kcal || 0), 0) || 0
    const moodScore =
      extracted.emotions && extracted.emotions.length > 0
        ? Math.round(extracted.emotions.reduce((sum, e) => sum + e.intensity_1_10, 0) / extracted.emotions.length)
        : null
    const stressLevel = extracted.mental?.stress_1_10 || null

    const aggregateData = {
      user_id: userId,
      log_date: today,
      calories: calories > 0 ? calories : null,
      sleep_hours: extracted.body?.sleep_hours || null,
      sleep_quality: extracted.body?.sleep_quality_1_10 || null,
      mood_score: moodScore,
      stress_level: stressLevel,
      workouts_count: (extracted.workouts?.length || 0) + (extracted.cardio?.length || 0),
    }

    await supabase.from('daily_aggregates').upsert(aggregateData, {
      onConflict: ['user_id', 'log_date'],
    })
  } catch (error) {
    console.error('Update daily aggregates error:', error)
  }
}

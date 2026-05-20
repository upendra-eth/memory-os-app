import { GoogleGenerativeAI } from '@google/generative-ai'
import { medicalDetectorPrompt } from '@/lib/prompts/ask'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

export interface MedicalDetection {
  medications: Array<{ name: string; dosage?: string; frequency?: string }>
  conditions: string[]
  symptoms: string[]
  tests_visits: string[]
}

const EMPTY: MedicalDetection = { medications: [], conditions: [], symptoms: [], tests_visits: [] }

export async function detectMedical(narrative: string): Promise<MedicalDetection> {
  if (!GEMINI_API_KEY || !narrative.trim()) return EMPTY

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    const result = await model.generateContent(medicalDetectorPrompt(narrative))
    let text = result.response.text().trim()

    if (text.startsWith('```json')) text = text.slice(7)
    if (text.startsWith('```')) text = text.slice(3)
    if (text.endsWith('```')) text = text.slice(0, -3)
    text = text.trim()

    const parsed = JSON.parse(text) as Partial<MedicalDetection>
    return {
      medications: parsed.medications ?? [],
      conditions: parsed.conditions ?? [],
      symptoms: parsed.symptoms ?? [],
      tests_visits: parsed.tests_visits ?? [],
    }
  } catch (error) {
    console.error('[v0] Medical detection error:', error)
    return EMPTY
  }
}

export function buildMedicalAuditItems(
  userId: string,
  entryId: string,
  detection: MedicalDetection
) {
  const items: Array<{
    user_id: string
    entry_id: string
    audit_type: string
    status: string
    suggested_value: Record<string, unknown>
  }> = []

  detection.medications.forEach((m) =>
    items.push({
      user_id: userId,
      entry_id: entryId,
      audit_type: 'profile_sync',
      status: 'pending',
      suggested_value: { kind: 'medication', ...m },
    })
  )
  detection.conditions.forEach((c) =>
    items.push({
      user_id: userId,
      entry_id: entryId,
      audit_type: 'profile_sync',
      status: 'pending',
      suggested_value: { kind: 'condition', name: c },
    })
  )
  detection.symptoms.forEach((s) =>
    items.push({
      user_id: userId,
      entry_id: entryId,
      audit_type: 'profile_sync',
      status: 'pending',
      suggested_value: { kind: 'symptom', name: s },
    })
  )
  detection.tests_visits.forEach((t) =>
    items.push({
      user_id: userId,
      entry_id: entryId,
      audit_type: 'profile_sync',
      status: 'pending',
      suggested_value: { kind: 'test_or_visit', name: t },
    })
  )

  return items
}

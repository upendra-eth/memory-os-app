export const askPrompt = (question: string, relevantContext: string): string => `
You are a personal health assistant analyzing user's life logs. 
Use the provided life log context to answer the user's question accurately.

IMPORTANT: 
- Always cite the specific dates or entry information you're referring to
- If data is insufficient, suggest what information would help
- Be conversational but concise
- Focus on patterns and trends over isolated data points

User Profile Context:
${relevantContext}

User Question: ${question}

Provide a helpful, personalized answer based on the life logs above.
Include specific dates when referencing data. Format citations as [Date: YYYY-MM-DD].
`

export const weeklyQuestionPrompt = (gaps: string[], recentEntries: string): string => `
You are generating contextual health questions for a personal life-logging app.
Based on the user's profile gaps and recent entries, suggest 1-3 specific, actionable questions
that would help them understand their patterns better.

Profile Gaps (incomplete fields): ${gaps.join(', ')}

Recent Entries Summary (last 7 days):
${recentEntries}

Generate 1-3 questions in JSON format:
[
  {
    "question": "Clear, specific question",
    "context": "Why this matters based on their data",
    "expected_action": "new_entry | update_profile | view_dashboard"
  }
]

Questions should be encouraging, not pushy. Focus on areas with data gaps or interesting patterns.
`

export const dayDigestPrompt = (entries: string, profile: string): string => `
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
  "patterns_noticed": ["Pattern 1", "Pattern 2"] - highlight 1-2 interesting patterns
}
`

export const labExtractPrompt = (): string => `
You are extracting health metrics from a lab report image.
Extract all test markers and their values, including reference ranges if visible.

Return JSON:
{
  "test_name": "Full test name (e.g., 'Complete Blood Count')",
  "test_date": "YYYY-MM-DD if visible, otherwise null",
  "markers": [
    {
      "name": "Marker name",
      "value": number,
      "unit": "unit of measurement",
      "reference_min": number or null,
      "reference_max": number or null
    }
  ]
}
`

export const labAnalyzePrompt = (markers: string, profile: string): string => `
You are analyzing lab results for a personal health context.
DO NOT DIAGNOSE. Provide educational context based on typical ranges.

Markers:
${markers}

User Profile:
${profile}

Provide brief analysis:
{
  "summary": "Overall picture in plain language",
  "notable_markers": ["Marker 1 status", "Marker 2 status"],
  "lifestyle_notes": "How sleep/diet/exercise might affect these",
  "next_steps": "Suggest discussing with doctor if any markers are unusual"
}

IMPORTANT: End with "Discuss with your doctor for personalized interpretation."
`

export const medicalDetectorPrompt = (narrative: string): string => `
You are scanning a life log entry for potential health-related information to alert the user about.
Extract mentions of:
- Medications or supplements (with dosage if stated)
- Medical conditions or symptoms (recurring or acute)
- Allergies or intolerances
- Medical tests or doctor visits

Return JSON:
{
  "medications": [{"name": "...", "dosage": "...", "frequency": "..."}],
  "conditions": ["condition 1", "condition 2"],
  "symptoms": ["symptom 1", "symptom 2"],
  "tests_visits": ["test/visit type"]
}

Text to analyze:
${narrative}

Return only valid JSON with empty arrays if nothing detected.
`

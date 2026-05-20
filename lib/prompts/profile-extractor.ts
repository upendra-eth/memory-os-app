/**
 * Gemini prompt for extracting structured profile data from natural language.
 */
export function getProfileExtractorPrompt(userMessage: string, existingProfile: Record<string, any>): string {
  return `You are a profile data extractor for a personal health & life-tracking app called Memory OS.

The user is providing information about themselves in natural language. Extract ALL structured fields from their message and return a JSON object containing ONLY the fields they mentioned.

EXISTING PROFILE (for context — do NOT repeat unchanged values):
${JSON.stringify(existingProfile, null, 2)}

USER'S MESSAGE:
"${userMessage}"

EXTRACTABLE FIELDS (return only fields mentioned by the user):
{
  "display_name": "string — user's name",
  "age": "number",
  "gender": "'male' | 'female' | 'other'",
  "height_cm": "number — convert from feet/inches if needed",
  "current_weight_kg": "number — convert from lbs if needed",
  "target_weight_kg": "number — convert from lbs if needed",
  "activity_level": "'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'",
  "nutrition_goal": "'lose_weight' | 'maintain' | 'gain_muscle'",
  "fitness_goal": "string",
  "health_conditions": ["array of condition strings"],
  "medications": ["array of medication strings"],
  "allergies": ["array of allergy strings"],
  "occupation": "string",
  "work_type": "'remote' | 'hybrid' | 'office'",
  "commute_min": "number — minutes",
  "sleep_schedule_wake": "HH:MM format",
  "sleep_schedule_bed": "HH:MM format",
  "sedentary_hours": "number",
  "screen_time_hours": "number",
  "diet_preference": "'omnivore' | 'vegetarian' | 'vegan' | 'keto' | 'paleo' | 'other'",
  "stress_baseline_1_10": "number 1-10",
  "personality_type": "string (MBTI, etc)",
  "therapy_status": "'active' | 'past' | 'considering' | 'never'",
  "location": "string — City, Country",
  "timezone": "string — e.g. Asia/Kolkata"
}

RULES:
1. ONLY return fields that the user explicitly mentioned or implied.
2. Convert units: feet/inches → cm, lbs → kg, etc.
3. Parse times like "6am" → "06:00", "10:30 PM" → "22:30".
4. For arrays (conditions, meds, allergies), APPEND to existing values — don't replace.
5. If the user mentions something that updates an existing field, include the new value.
6. Return VALID JSON only, no markdown, no explanation.
7. Start with { and end with }.`
}

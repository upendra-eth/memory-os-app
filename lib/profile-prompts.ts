/**
 * Curated profile prompt library for progressive data collection.
 * Each prompt targets a specific profile field.
 */

export interface ProfilePrompt {
  text: string
  category: 'identity' | 'health' | 'lifestyle' | 'goals' | 'mental' | 'body'
  targetField: string
  emoji: string
}

export const PROFILE_PROMPTS: ProfilePrompt[] = [
  // Identity
  { text: "What's your occupation or what field do you work in?", category: 'identity', targetField: 'occupation', emoji: '💼' },
  { text: "Do you work remotely, in an office, or hybrid?", category: 'identity', targetField: 'work_type', emoji: '🏠' },
  { text: "What city and country do you live in?", category: 'identity', targetField: 'location', emoji: '📍' },
  { text: "How long is your daily commute (in minutes)?", category: 'identity', targetField: 'commute_min', emoji: '🚗' },

  // Body
  { text: "What time do you usually wake up?", category: 'body', targetField: 'sleep_schedule_wake', emoji: '⏰' },
  { text: "What time do you usually go to bed?", category: 'body', targetField: 'sleep_schedule_bed', emoji: '🌙' },
  { text: "How many hours per day do you spend sitting?", category: 'body', targetField: 'sedentary_hours', emoji: '🪑' },
  { text: "How many hours of screen time do you average daily?", category: 'body', targetField: 'screen_time_hours', emoji: '📱' },

  // Health
  { text: "Do you have any health conditions we should know about?", category: 'health', targetField: 'health_conditions', emoji: '🏥' },
  { text: "Are you currently taking any medications or supplements?", category: 'health', targetField: 'medications', emoji: '💊' },
  { text: "Do you have any food allergies or intolerances?", category: 'health', targetField: 'allergies', emoji: '⚠️' },
  { text: "Have you had any surgeries in the past?", category: 'health', targetField: 'surgeries', emoji: '🔪' },
  { text: "Is there any significant health history in your family?", category: 'health', targetField: 'family_health_history', emoji: '🧬' },

  // Lifestyle
  { text: "What's your dietary preference? (omnivore, vegetarian, vegan, keto, etc.)", category: 'lifestyle', targetField: 'diet_preference', emoji: '🥗' },

  // Mental
  { text: "On a scale of 1-10, what's your typical daily stress level?", category: 'mental', targetField: 'stress_baseline_1_10', emoji: '🧠' },
  { text: "Do you know your personality type? (MBTI, Enneagram, etc.)", category: 'mental', targetField: 'personality_type', emoji: '🎭' },
  { text: "Have you ever tried therapy or counseling?", category: 'mental', targetField: 'therapy_status', emoji: '🗣️' },

  // Goals
  { text: "What's your main fitness goal right now?", category: 'goals', targetField: 'fitness_goal', emoji: '🏋️' },
  { text: "What career goals are you working towards?", category: 'goals', targetField: 'career_goals', emoji: '🎯' },
  { text: "Any mental health or mindfulness goals?", category: 'goals', targetField: 'mental_goals', emoji: '🧘' },
  { text: "What financial goals are on your radar?", category: 'goals', targetField: 'financial_goals', emoji: '💰' },
]

/**
 * Select the best prompt for a user based on their profile gaps.
 * Returns null if all fields are filled.
 */
export function selectNextPrompt(
  profile: Record<string, any>,
  recentlyAskedFields: string[]
): ProfilePrompt | null {
  // Find prompts for empty fields, excluding recently asked
  const emptyFieldPrompts = PROFILE_PROMPTS.filter((p) => {
    const value = profile[p.targetField]
    const isEmpty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)

    const recentlyAsked = recentlyAskedFields.includes(p.targetField)

    return isEmpty && !recentlyAsked
  })

  if (emptyFieldPrompts.length === 0) return null

  // Rotate through categories for variety
  const categories = ['identity', 'body', 'health', 'lifestyle', 'mental', 'goals']
  const lastCategory = recentlyAskedFields.length > 0
    ? PROFILE_PROMPTS.find((p) => p.targetField === recentlyAskedFields[recentlyAskedFields.length - 1])?.category
    : null

  // Try to pick from a different category than the last one
  const differentCategoryPrompts = emptyFieldPrompts.filter((p) => p.category !== lastCategory)
  const pool = differentCategoryPrompts.length > 0 ? differentCategoryPrompts : emptyFieldPrompts

  // Pick randomly from the pool
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Calculate profile completeness score (0-100)
 */
export function calculateCompleteness(profile: Record<string, any>): number {
  const fields = PROFILE_PROMPTS.map((p) => p.targetField)
  // Add core fields
  const allFields = [
    'display_name', 'age', 'gender', 'height_cm', 'current_weight_kg',
    'activity_level', 'nutrition_goal',
    ...fields,
  ]

  const uniqueFields = [...new Set(allFields)]
  let filled = 0

  for (const field of uniqueFields) {
    const value = profile[field]
    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !(Array.isArray(value) && value.length === 0)
    ) {
      filled++
    }
  }

  return Math.round((filled / uniqueFields.length) * 100)
}

/**
 * Complete extraction schema for 20 life dimensions
 * This matches the structure Gemini produces and what entries.extracted_json stores
 */

export interface EnergyPoint {
  time_of_day: string
  level: number
}

export interface Body {
  sleep_hours?: number
  sleep_quality_1_10?: number
  energy_curve?: EnergyPoint[]
  hydration_l?: number
  digestion_note?: string
  weight_today_kg?: number
}

export interface Nutrition {
  item: string
  portion: string
  est_kcal: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  fiber_g?: number
  meal_type?: string
  time?: string
}

export interface Workout {
  exercise: string
  sets?: number
  reps?: number
  weight_kg?: number
  rpe_1_10?: number
  muscles?: string[]
  kcal_burned?: number
  met_used?: number
  notes?: string
}

export interface Cardio {
  type: string
  duration_min: number
  distance_km?: number
  avg_hr?: number
  kcal_burned?: number
}

export interface Symptom {
  name: string
  location?: string
  intensity_1_10: number
  duration_min?: number
  trigger?: string
}

export interface Emotion {
  feeling: string
  intensity_1_10: number
  trigger?: string
  duration_min?: number
}

export interface Mental {
  stress_1_10?: number
  anxiety_1_10?: number
  focus_1_10?: number
  motivation_1_10?: number
  rumination_note?: string
}

export interface Cognition {
  ideas?: string[]
  insights?: string[]
  questions?: string[]
  decisions?: string[]
  problems?: string[]
}

export interface SelfTalk {
  text: string
  type: 'belief' | 'distortion' | 'identity'
}

export interface WorkItem {
  tasks_done?: string[]
  tasks_pending?: string[]
  meetings?: Array<{
    with: string
    topic: string
    outcome: string
  }>
  wins?: string[]
  blockers?: string[]
  learnings?: string[]
  deep_work_min?: number
}

export interface Input {
  type: 'book' | 'podcast' | 'article' | 'conversation' | 'video'
  name: string
  takeaway?: string
}

export interface Social {
  person: string
  relationship?: string
  mode: 'in_person' | 'call' | 'text' | 'video'
  quality_1_10?: number
  topic?: string
  support_direction?: 'gave' | 'received' | 'mutual'
}

export interface Habit {
  name: string
  status: 'done' | 'skipped'
}

export interface Context {
  location?: string
  weather?: string
  screen_time_min?: number
}

export interface Value {
  type: 'gratitude' | 'meditation' | 'purpose'
  note: string
}

export interface Goal {
  name: string
  status: 'progressed' | 'revised' | 'set_for_tomorrow'
  note?: string
}

export interface Reflection {
  rating_1_10: number
  high: string
  low: string
  lesson: string
}

export interface MoneyItem {
  type: 'expense' | 'income' | 'decision'
  amount: number
  currency: string
  note?: string
}

export interface Entities {
  people?: string[]
  places?: string[]
  foods?: string[]
  exercises?: string[]
}

export interface AuditItem {
  field: string
  reason: 'guessed' | 'ambiguous_name' | 'missing_qty' | 'new_entity' | 'profile_sync'
  note?: string
}

export interface ExtractedJSON {
  body?: Body
  nutrition?: Nutrition[]
  workouts?: Workout[]
  cardio?: Cardio[]
  symptoms?: Symptom[]
  emotions?: Emotion[]
  mental?: Mental
  cognition?: Cognition
  self_talk?: SelfTalk[]
  work?: WorkItem
  inputs?: Input[]
  social?: Social[]
  habits?: Habit[]
  context?: Context
  values?: Value[]
  goals?: Goal[]
  reflection?: Reflection
  money?: MoneyItem[]
  entities?: Entities
  audit?: AuditItem[]
}

/**
 * Validate extracted JSON structure
 */
export function validateExtractedJSON(data: unknown): data is ExtractedJSON {
  if (typeof data !== 'object' || data === null) return false
  // Basic validation - check if it's a reasonable object
  return true
}

/**
 * Get empty template for extracted JSON
 */
export function getEmptyExtractedJSON(): ExtractedJSON {
  return {
    body: {},
    nutrition: [],
    workouts: [],
    cardio: [],
    symptoms: [],
    emotions: [],
    mental: {},
    cognition: {},
    self_talk: [],
    work: {},
    inputs: [],
    social: [],
    habits: [],
    context: {},
    values: [],
    goals: [],
    money: [],
    entities: {},
    audit: [],
  }
}

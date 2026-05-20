// Legacy types
export interface LifeLog {
  id: string
  content: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface GeminiChartResponse {
  type: 'chart'
  chartType: 'line' | 'bar' | 'area' | 'pie'
  title?: string
  data: Array<Record<string, unknown>>
  xKey?: string
  yKey?: string
  dataKeys?: string[]
}

export interface GeminiSummaryResponse {
  type: 'summary'
  text: string
  highlights?: string[]
}

export type GeminiResponse = GeminiChartResponse | GeminiSummaryResponse

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  response?: GeminiResponse
  timestamp: Date
}

// User Profile Types
export type Gender = 'male' | 'female' | 'other'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type NutritionGoal = 'lose_weight' | 'maintain' | 'gain_muscle'

export interface UserProfile {
  id: string
  email: string
  display_name?: string
  age?: number
  gender?: Gender
  height_cm?: number
  current_weight_kg?: number
  target_weight_kg?: number
  activity_level?: ActivityLevel
  health_conditions?: string[]
  medications?: string[]
  allergies?: string[]
  nutrition_goal?: NutritionGoal
  fitness_goal?: string
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

// Health Metrics
export interface HealthMetrics {
  bmi: number
  bmr: number
  tdee: number
  ideal_weight_range: { min: number; max: number }
  daily_protein_g: number
  daily_calories: number
}

// Entry Types
export interface Entry {
  id: string
  user_id: string
  raw_text: string
  normalized_text?: string
  narrative_text?: string
  extracted_json?: Record<string, unknown>
  embedding?: number[]
  summary?: string
  created_at: string
  updated_at: string
}

export interface DailyAggregate {
  id: string
  user_id: string
  log_date: string
  calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  sleep_hours?: number
  sleep_quality?: number
  mood_score?: number
  energy_level?: number
  stress_level?: number
  workouts_count?: number
  workout_duration_min?: number
  workout_intensity?: string
  created_at: string
  updated_at: string
}

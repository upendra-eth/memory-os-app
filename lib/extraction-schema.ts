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

/** One logged set within a workout — preserves per-set progression. */
export interface WorkoutSet {
  weight_kg?: number
  reps?: number
  assist_kg?: number // assistance load for assisted movements (e.g. assisted pull-ups)
  rpe_1_10?: number
}

export interface Workout {
  exercise: string
  /** Per-set log: the source of truth for progressive overload. */
  set_log?: WorkoutSet[]
  sets?: number // summary count (derived from set_log when present)
  reps?: number // top-set reps (summary)
  weight_kg?: number // top-set weight (summary)
  rpe_1_10?: number
  muscles?: string[]
  duration_min?: number
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

/** Day-level nutrition totals, as computed by the source (ChatGPT) — not recomputed. */
export interface DailyTotals {
  kcal?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  fiber_g?: number
}

/** Energy in vs out for the day. balance_kcal negative = deficit, positive = surplus. */
export interface EnergyBalance {
  tdee_kcal?: number
  intake_kcal?: number
  workout_kcal_burned?: number
  balance_kcal?: number
  status?: 'deficit' | 'surplus' | 'maintenance'
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
  /** The calendar date this entry is ABOUT (YYYY-MM-DD), not when it was saved. */
  log_date?: string
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
  daily_totals?: DailyTotals
  energy_balance?: EnergyBalance
  entities?: Entities
  audit?: AuditItem[]
}

/**
 * Validate extracted JSON structure.
 * A valid payload is a non-null, non-array object. Every field is optional, so we
 * only reject things that can't possibly be an ExtractedJSON (primitives, arrays, null).
 */
export function validateExtractedJSON(data: unknown): data is ExtractedJSON {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
}

// ---------------------------------------------------------------------------
// Sanitizer — coerces whatever Gemini returns into a safe, well-typed shape.
// LLM output drifts (strings where numbers belong, "null" strings, scales out
// of range, objects where arrays belong). The sanitizer is the contract that
// guarantees the rest of the pipeline only ever sees clean data.
// ---------------------------------------------------------------------------

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (trimmed === '' || trimmed.toLowerCase() === 'null') return undefined
    const parsed = Number.parseFloat(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/** Number clamped to a 1-10 scale; undefined if not parseable. */
function scale(v: unknown): number | undefined {
  const n = num(v)
  if (n === undefined) return undefined
  return Math.min(10, Math.max(1, Math.round(n)))
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return undefined
  return trimmed
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => str(x)).filter((x): x is string => x !== undefined)
}

/** Map an array of raw items through a mapper, dropping anything that maps to null. */
function objArray<T>(v: unknown, map: (item: any) => T | null): T[] {
  if (!Array.isArray(v)) return []
  const out: T[] = []
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue
    const mapped = map(item)
    if (mapped !== null) out.push(mapped)
  }
  return out
}

/** Keep `v` only if it's one of the allowed literals, else fall back. */
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

/** Drop a key from an object if its value is undefined (keeps payloads compact). */
function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k]
  }
  return obj
}

/**
 * Coerce arbitrary parsed JSON into a valid ExtractedJSON.
 * Never throws — unknown/invalid input yields an empty-but-valid object.
 * Array items missing their required identifier (e.g. a nutrition row with no
 * `item`) are dropped rather than saved as garbage.
 */
export function sanitizeExtractedJSON(data: unknown): ExtractedJSON {
  const d = (validateExtractedJSON(data) ? data : {}) as Record<string, any>
  const out: ExtractedJSON = {}

  // Accept an explicit YYYY-MM-DD date; ignore anything malformed.
  const logDate = str(d.log_date) ?? str(d.date)
  if (logDate && /^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    out.log_date = logDate
  }

  if (d.body && typeof d.body === 'object') {
    out.body = compact({
      sleep_hours: num(d.body.sleep_hours),
      sleep_quality_1_10: scale(d.body.sleep_quality_1_10),
      energy_curve: objArray<EnergyPoint>(d.body.energy_curve, (i) => {
        const t = str(i.time_of_day)
        const level = scale(i.level)
        return t && level !== undefined ? { time_of_day: t, level } : null
      }),
      hydration_l: num(d.body.hydration_l),
      digestion_note: str(d.body.digestion_note),
      weight_today_kg: num(d.body.weight_today_kg),
    })
  }

  out.nutrition = objArray<Nutrition>(d.nutrition, (i) => {
    const item = str(i.item)
    if (!item) return null
    return compact({
      item,
      portion: str(i.portion) ?? '',
      est_kcal: num(i.est_kcal) ?? 0,
      protein_g: num(i.protein_g),
      carbs_g: num(i.carbs_g),
      fat_g: num(i.fat_g),
      fiber_g: num(i.fiber_g),
      meal_type: str(i.meal_type),
      time: str(i.time),
    }) as Nutrition
  })

  out.workouts = objArray<Workout>(d.workouts, (i) => {
    const exercise = str(i.exercise)
    if (!exercise) return null

    const setLog = objArray<WorkoutSet>(i.set_log, (s) => {
      const set = compact({
        weight_kg: num(s.weight_kg),
        reps: num(s.reps),
        assist_kg: num(s.assist_kg),
        rpe_1_10: scale(s.rpe_1_10),
      })
      // Drop empty set rows
      return Object.keys(set).length > 0 ? (set as WorkoutSet) : null
    })

    // Derive summary fields from the set log when the model didn't supply them.
    // Top set = heaviest weight logged (ties broken by reps).
    const topSet = setLog.reduce<WorkoutSet | null>((best, s) => {
      if (s.weight_kg === undefined) return best
      if (!best || (best.weight_kg ?? 0) < s.weight_kg) return s
      return best
    }, null)

    return compact({
      exercise,
      set_log: setLog.length > 0 ? setLog : undefined,
      sets: num(i.sets) ?? (setLog.length > 0 ? setLog.length : undefined),
      reps: num(i.reps) ?? topSet?.reps,
      weight_kg: num(i.weight_kg) ?? topSet?.weight_kg,
      rpe_1_10: scale(i.rpe_1_10),
      muscles: strArray(i.muscles),
      duration_min: num(i.duration_min),
      kcal_burned: num(i.kcal_burned),
      met_used: num(i.met_used),
      notes: str(i.notes),
    }) as Workout
  })

  out.cardio = objArray<Cardio>(d.cardio, (i) => {
    const type = str(i.type)
    const duration = num(i.duration_min)
    if (!type || duration === undefined) return null
    return compact({
      type,
      duration_min: duration,
      distance_km: num(i.distance_km),
      avg_hr: num(i.avg_hr),
      kcal_burned: num(i.kcal_burned),
    }) as Cardio
  })

  out.symptoms = objArray<Symptom>(d.symptoms, (i) => {
    const name = str(i.name)
    const intensity = scale(i.intensity_1_10)
    if (!name || intensity === undefined) return null
    return compact({
      name,
      location: str(i.location),
      intensity_1_10: intensity,
      duration_min: num(i.duration_min),
      trigger: str(i.trigger),
    }) as Symptom
  })

  out.emotions = objArray<Emotion>(d.emotions, (i) => {
    const feeling = str(i.feeling)
    const intensity = scale(i.intensity_1_10)
    if (!feeling || intensity === undefined) return null
    return compact({
      feeling,
      intensity_1_10: intensity,
      trigger: str(i.trigger),
      duration_min: num(i.duration_min),
    }) as Emotion
  })

  if (d.mental && typeof d.mental === 'object') {
    out.mental = compact({
      stress_1_10: scale(d.mental.stress_1_10),
      anxiety_1_10: scale(d.mental.anxiety_1_10),
      focus_1_10: scale(d.mental.focus_1_10),
      motivation_1_10: scale(d.mental.motivation_1_10),
      rumination_note: str(d.mental.rumination_note),
    })
  }

  if (d.cognition && typeof d.cognition === 'object') {
    out.cognition = {
      ideas: strArray(d.cognition.ideas),
      insights: strArray(d.cognition.insights),
      questions: strArray(d.cognition.questions),
      decisions: strArray(d.cognition.decisions),
      problems: strArray(d.cognition.problems),
    }
  }

  out.self_talk = objArray<SelfTalk>(d.self_talk, (i) => {
    const text = str(i.text)
    if (!text) return null
    return { text, type: oneOf(i.type, ['belief', 'distortion', 'identity'] as const, 'belief') }
  })

  if (d.work && typeof d.work === 'object') {
    out.work = compact({
      tasks_done: strArray(d.work.tasks_done),
      tasks_pending: strArray(d.work.tasks_pending),
      meetings: objArray(d.work.meetings, (m) => ({
        with: str(m.with) ?? '',
        topic: str(m.topic) ?? '',
        outcome: str(m.outcome) ?? '',
      })),
      wins: strArray(d.work.wins),
      blockers: strArray(d.work.blockers),
      learnings: strArray(d.work.learnings),
      deep_work_min: num(d.work.deep_work_min),
    })
  }

  out.inputs = objArray<Input>(d.inputs, (i) => {
    const name = str(i.name)
    if (!name) return null
    return compact({
      type: oneOf(i.type, ['book', 'podcast', 'article', 'conversation', 'video'] as const, 'article'),
      name,
      takeaway: str(i.takeaway),
    }) as Input
  })

  out.social = objArray<Social>(d.social, (i) => {
    const person = str(i.person)
    if (!person) return null
    return compact({
      person,
      relationship: str(i.relationship),
      mode: oneOf(i.mode, ['in_person', 'call', 'text', 'video'] as const, 'in_person'),
      quality_1_10: scale(i.quality_1_10),
      topic: str(i.topic),
      support_direction: i.support_direction
        ? oneOf(i.support_direction, ['gave', 'received', 'mutual'] as const, 'mutual')
        : undefined,
    }) as Social
  })

  out.habits = objArray<Habit>(d.habits, (i) => {
    const name = str(i.name)
    if (!name) return null
    return { name, status: oneOf(i.status, ['done', 'skipped'] as const, 'done') }
  })

  if (d.context && typeof d.context === 'object') {
    out.context = compact({
      location: str(d.context.location),
      weather: str(d.context.weather),
      screen_time_min: num(d.context.screen_time_min),
    })
  }

  out.values = objArray<Value>(d.values, (i) => {
    const note = str(i.note)
    if (!note) return null
    return { type: oneOf(i.type, ['gratitude', 'meditation', 'purpose'] as const, 'gratitude'), note }
  })

  out.goals = objArray<Goal>(d.goals, (i) => {
    const name = str(i.name)
    if (!name) return null
    return compact({
      name,
      status: oneOf(i.status, ['progressed', 'revised', 'set_for_tomorrow'] as const, 'progressed'),
      note: str(i.note),
    }) as Goal
  })

  if (d.reflection && typeof d.reflection === 'object') {
    const rating = scale(d.reflection.rating_1_10)
    if (rating !== undefined) {
      out.reflection = {
        rating_1_10: rating,
        high: str(d.reflection.high) ?? '',
        low: str(d.reflection.low) ?? '',
        lesson: str(d.reflection.lesson) ?? '',
      }
    }
  }

  out.money = objArray<MoneyItem>(d.money, (i) => {
    const amount = num(i.amount)
    if (amount === undefined) return null
    return compact({
      type: oneOf(i.type, ['expense', 'income', 'decision'] as const, 'expense'),
      amount,
      currency: str(i.currency) ?? 'INR',
      note: str(i.note),
    }) as MoneyItem
  })

  if (d.daily_totals && typeof d.daily_totals === 'object') {
    out.daily_totals = compact({
      kcal: num(d.daily_totals.kcal),
      protein_g: num(d.daily_totals.protein_g),
      carbs_g: num(d.daily_totals.carbs_g),
      fat_g: num(d.daily_totals.fat_g),
      fiber_g: num(d.daily_totals.fiber_g),
    })
  }

  if (d.energy_balance && typeof d.energy_balance === 'object') {
    out.energy_balance = compact({
      tdee_kcal: num(d.energy_balance.tdee_kcal),
      intake_kcal: num(d.energy_balance.intake_kcal),
      workout_kcal_burned: num(d.energy_balance.workout_kcal_burned),
      balance_kcal: num(d.energy_balance.balance_kcal),
      status: d.energy_balance.status
        ? oneOf(d.energy_balance.status, ['deficit', 'surplus', 'maintenance'] as const, 'maintenance')
        : undefined,
    })
  }

  if (d.entities && typeof d.entities === 'object') {
    out.entities = {
      people: strArray(d.entities.people),
      places: strArray(d.entities.places),
      foods: strArray(d.entities.foods),
      exercises: strArray(d.entities.exercises),
    }
  }

  out.audit = dedupeAudit(
    objArray<AuditItem>(d.audit, (i) => {
      const field = str(i.field)
      if (!field) return null
      return compact({
        field,
        reason: oneOf(
          i.reason,
          ['guessed', 'ambiguous_name', 'missing_qty', 'new_entity', 'profile_sync'] as const,
          'guessed'
        ),
        note: str(i.note),
      }) as AuditItem
    })
  )

  return out
}

/**
 * Collapse audit items to at most one per item/field-group, deterministically.
 * The LLM tends to flag every sub-field of one food (est_kcal, protein_g, carbs_g…)
 * as separate audits, which floods the inbox. We group by the container path up to
 * its array index (e.g. `nutrition.2.protein_g` → `nutrition.2`) and keep one,
 * preferring the more actionable reason. Caps the total to avoid runaway lists.
 */
function dedupeAudit(items: AuditItem[]): AuditItem[] {
  const REASON_RANK: Record<string, number> = {
    new_entity: 5,
    ambiguous_name: 4,
    profile_sync: 3,
    missing_qty: 2,
    guessed: 1,
  }
  const groupKey = (field: string) => {
    const m = field.match(/^(\w+\.\d+)\b/) // container.index → group all its sub-fields
    return m ? m[1] : field
  }
  const best = new Map<string, AuditItem>()
  for (const item of items) {
    const key = `${groupKey(item.field)}|${item.reason}`
    const cur = best.get(key)
    if (!cur || (REASON_RANK[item.reason] ?? 0) > (REASON_RANK[cur.reason] ?? 0)) {
      // Keep one per (group, reason); generalize the field to the group path.
      best.set(key, { ...item, field: groupKey(item.field) })
    }
  }
  return Array.from(best.values()).slice(0, 8)
}

/** True when a sanitized payload carries no actual logged data (Gemini returned nothing useful). */
export function isEmptyExtractedJSON(data: ExtractedJSON): boolean {
  return Object.values(data).every((v) => {
    if (v === undefined || v === null) return true
    if (Array.isArray(v)) return v.length === 0
    if (typeof v === 'object') return Object.keys(v).length === 0
    return false
  })
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

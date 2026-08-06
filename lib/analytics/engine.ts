/**
 * Analytics compute engine — pure functions, no I/O.
 *
 * Everything is derived from `entries.extracted_json` rather than the
 * `daily_aggregates` table: the raw JSON carries per-food macros, per-set
 * training logs and the source's own energy-balance numbers, none of which
 * survive aggregation. It also means analytics work even when the aggregate
 * upsert hasn't run for a day.
 *
 * ENERGY MODEL (stated once, used everywhere):
 *   maintenance = the day's logged `energy_balance.tdee_kcal`, else the
 *                 profile's Mifflin-St Jeor BMR × activity multiplier.
 *   balance     = intake − maintenance.
 * Training burn is reported separately and NOT subtracted again: an
 * activity-adjusted TDEE already contains it, and the pasted
 * `energy_balance.balance_kcal` is inconsistent about this (sometimes it
 * subtracts the workout a second time), so we recompute rather than trust it.
 * The honest number — `trueMaintenanceKcal` — is reverse-engineered from the
 * user's own intake and weight trend and needs no formula at all.
 */

import type { ExtractedJSON, Workout } from '@/lib/extraction-schema'
import {
  calculateBMI,
  calculateBMR,
  calculateDailyCalories,
  calculateDailyProtein,
  calculateTDEE,
  getBMICategory,
  getIdealWeightRange,
} from '@/lib/health-metrics'
import type { ActivityLevel, Gender } from '@/lib/types'
import {
  KCAL_PER_KG,
  type AnalyticsPayload,
  type AnalyticsProfile,
  type Correlation,
  type CoverageStat,
  type DayPoint,
  type DayTypeAnalysis,
  type DayTypeStat,
  type EnergyAnalysis,
  type ExerciseStat,
  type Finding,
  type FoodStat,
  type GapAnalysis,
  type MonthlyPoint,
  type MuscleStat,
  type NutritionAnalysis,
  type PeriodSummary,
  type RangeKey,
  type RecoveryAnalysis,
  type TrainingAnalysis,
  type WeekdayStat,
  type WeeklyPoint,
  type WeightAnalysis,
} from './types'

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

const nums = (a: (number | null | undefined)[]): number[] =>
  a.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

const sum = (a: (number | null | undefined)[]): number => nums(a).reduce((s, v) => s + v, 0)

const mean = (a: (number | null | undefined)[]): number | null => {
  const v = nums(a)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

const round = (v: number | null, dp = 0): number | null => {
  if (v === null || !Number.isFinite(v)) return null
  const f = 10 ** dp
  return Math.round(v * f) / f
}

const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0)

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const isoDate = (d: Date): string => d.toISOString().slice(0, 10)

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return isoDate(d)
}

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86400000)

const shortLabel = (iso: string): string =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00.000Z`).getUTCDay()

/** Monday-anchored week start for an ISO date. */
const weekStartOf = (iso: string): string => {
  const wd = weekdayOf(iso)
  return addDays(iso, wd === 0 ? -6 : 1 - wd)
}

/** Least-squares fit of y over x. Returns null when the fit is undefined. */
function linreg(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  const slope = num / den
  return { slope, intercept: my - slope * mx }
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return NaN
  return num / Math.sqrt(dx * dy)
}

const epley1RM = (weightKg: number, reps: number): number => Math.round(weightKg * (1 + reps / 30))

// ---------------------------------------------------------------------------
// Name canonicalisation
// ---------------------------------------------------------------------------

const EXERCISE_ABBREV: Record<string, string> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  sldl: 'stiff leg deadlift',
  bw: 'bodyweight',
  cg: 'close grip',
  wg: 'wide grip',
}

const singular = (w: string): string =>
  w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w

/**
 * Collapse the spelling variants the normalizer emits ("Leg Press" / "leg press"
 * / "Leg-Press") onto one key, so an exercise's history isn't split three ways.
 * Mirrors the matcher in [app/workout/page.tsx] — kept local so the engine has
 * no client-component dependency.
 */
function normExercise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[/_\-,.()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .flatMap((w) => (EXERCISE_ABBREV[w] || w).split(' '))
    .map(singular)
    .join(' ')
}

const titleCase = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * Muscle tags arrive wildly inconsistent ("chest_upper", "Upper Chest",
 * "anterior deltoid", "Front Delts"), so per-muscle volume is only meaningful
 * after folding them into a fixed set of groups. Order matters: the first
 * matching pattern wins.
 */
const MUSCLE_GROUPS: { group: string; test: RegExp }[] = [
  { group: 'Chest', test: /chest|pec/ },
  { group: 'Back', test: /lat|back|rhomboid|trap|teres|erector/ },
  { group: 'Shoulders', test: /delt|shoulder|rotator/ },
  { group: 'Arms', test: /bicep|tricep|brachi|forearm|elbow/ },
  { group: 'Legs', test: /quad|hamstring|glute|calf|calves|adductor|abductor|leg|hip/ },
  { group: 'Core', test: /core|abs|abdominal|oblique|stabili|posture|balance/ },
  { group: 'Cardio', test: /cardio|heart|conditioning|endurance/ },
  { group: 'Full body', test: /full.?body|total.?body|warmup|warm.?up/ },
]

function muscleGroup(raw: string): string {
  const s = raw.toLowerCase().replace(/[_\-]+/g, ' ')
  for (const { group, test } of MUSCLE_GROUPS) if (test.test(s)) return group
  return 'Other'
}

/** Push / pull classification for the balance ratio, from the muscle tag. */
function pushPullOf(raw: string): 'push' | 'pull' | null {
  const s = raw.toLowerCase().replace(/[_\-]+/g, ' ')
  if (/rear delt|posterior delt|rear deltoid/.test(s)) return 'pull'
  if (/chest|pec|tricep|front delt|anterior delt|side delt|lateral delt|shoulder|press/.test(s)) return 'push'
  if (/lat|back|rhomboid|trap|bicep|brachi|teres|row|pull/.test(s)) return 'pull'
  return null
}

function upperLowerOf(raw: string): 'upper' | 'lower' | null {
  const g = muscleGroup(raw)
  if (g === 'Legs') return 'lower'
  if (['Chest', 'Back', 'Shoulders', 'Arms'].includes(g)) return 'upper'
  return null
}

// ---------------------------------------------------------------------------
// Entry → day series
// ---------------------------------------------------------------------------

export interface RawEntry {
  extracted_json: ExtractedJSON | null
  created_at: string
}

/** The calendar date an entry is ABOUT: its captured log_date, else its save date. */
const effectiveDate = (ex: ExtractedJSON | null, createdAt: string): string =>
  ex?.log_date || createdAt.slice(0, 10)

/** Intake for one entry: the source's day-total if it gave one, else summed items. */
function entryIntake(ex: ExtractedJSON) {
  const items = (key: 'est_kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g') =>
    ex.nutrition?.reduce((s, n) => s + (n[key] ?? 0), 0) ?? 0
  const hasItems = (ex.nutrition?.length ?? 0) > 0
  const kcal = ex.daily_totals?.kcal ?? ex.energy_balance?.intake_kcal ?? (hasItems ? items('est_kcal') : null)
  return {
    kcal: kcal && kcal > 0 ? kcal : null,
    protein: ex.daily_totals?.protein_g ?? (hasItems ? items('protein_g') : null),
    carbs: ex.daily_totals?.carbs_g ?? (hasItems ? items('carbs_g') : null),
    fat: ex.daily_totals?.fat_g ?? (hasItems ? items('fat_g') : null),
    fiber: ex.daily_totals?.fiber_g ?? (hasItems ? items('fiber_g') : null),
  }
}

/** Sets, reps and tonnage for one workout, preferring the per-set log. */
function workoutVolume(w: Workout): { sets: number; reps: number; volumeKg: number; topWeight: number | null; e1rm: number | null } {
  let sets = 0
  let reps = 0
  let volumeKg = 0
  let topWeight: number | null = null
  let e1rm: number | null = null

  if (w.set_log?.length) {
    for (const s of w.set_log) {
      sets += 1
      reps += s.reps ?? 0
      // Assisted movements carry negative load; net it out so assisted pull-ups
      // don't inflate tonnage.
      const load = (s.weight_kg ?? 0) - (s.assist_kg ?? 0)
      if (s.reps && load > 0) volumeKg += load * s.reps
      if (s.weight_kg != null && (topWeight === null || s.weight_kg > topWeight)) topWeight = s.weight_kg
      if (s.weight_kg && s.reps) {
        const est = epley1RM(s.weight_kg - (s.assist_kg ?? 0), s.reps)
        if (e1rm === null || est > e1rm) e1rm = est
      }
    }
  } else {
    sets = w.sets ?? 0
    reps = (w.sets ?? 0) * (w.reps ?? 0)
    if (w.weight_kg && w.reps) {
      volumeKg = (w.sets ?? 1) * w.reps * w.weight_kg
      e1rm = epley1RM(w.weight_kg, w.reps)
    }
    topWeight = w.weight_kg ?? null
  }
  return { sets, reps, volumeKg, topWeight, e1rm }
}

/**
 * Build one row per calendar day between `start` and `end` inclusive — including
 * days with no entry, which are exactly the days the diagnostics care about.
 */
function buildDays(
  entries: RawEntry[],
  start: string,
  end: string,
  fallbackMaintenance: number | null
): DayPoint[] {
  const byDate = new Map<string, ExtractedJSON[]>()
  for (const e of entries) {
    const date = effectiveDate(e.extracted_json, e.created_at)
    if (date < start || date > end) continue
    const list = byDate.get(date) ?? []
    list.push(e.extracted_json ?? {})
    byDate.set(date, list)
  }

  const out: DayPoint[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const exs = byDate.get(d) ?? []
    const day: DayPoint = {
      date: d,
      label: shortLabel(d),
      weekday: weekdayOf(d),
      logged: exs.length > 0,
      entries: exs.length,
      intakeKcal: null,
      maintenanceKcal: fallbackMaintenance,
      burnKcal: null,
      balanceKcal: null,
      loggedBalanceKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      weightKg: null,
      weightTrendKg: null,
      sleepH: null,
      sleepQuality: null,
      hydrationL: null,
      mood: null,
      stress: null,
      anxiety: null,
      focus: null,
      motivation: null,
      dayRating: null,
      trained: false,
      workoutCount: 0,
      workoutMin: null,
      cardioMin: null,
      cardioKm: null,
      sets: 0,
      reps: 0,
      volumeKg: 0,
      exercises: [],
      symptomCount: 0,
      symptomPeak: null,
      habitsDone: 0,
      habitsSkipped: 0,
      screenMin: null,
      deepWorkMin: null,
      mealCount: 0,
    }

    if (!exs.length) {
      out.push(day)
      continue
    }

    // A day can be logged in several pastes: sums accumulate, point-in-time
    // states (weight, sleep, mood) take the first non-null seen.
    let intake = 0
    let protein = 0
    let carbs = 0
    let fat = 0
    let fiber = 0
    let sawIntake = false
    let sawMacro = false
    let burn = 0
    let sawBurn = false
    let workoutMin = 0
    let cardioMin = 0
    let cardioKm = 0
    let loggedMaintenance: number | null = null
    let loggedBalance: number | null = null
    const moods: number[] = []
    const stresses: number[] = []
    const anxieties: number[] = []
    const focuses: number[] = []
    const motivations: number[] = []
    const symptomIntensities: number[] = []
    const exerciseNames = new Set<string>()

    for (const ex of exs) {
      const n = entryIntake(ex)
      if (n.kcal != null) {
        intake += n.kcal
        sawIntake = true
      }
      if (n.protein != null || n.carbs != null || n.fat != null) {
        protein += n.protein ?? 0
        carbs += n.carbs ?? 0
        fat += n.fat ?? 0
        fiber += n.fiber ?? 0
        sawMacro = true
      }
      day.mealCount += ex.nutrition?.length ?? 0

      const eb = ex.energy_balance
      if (eb?.tdee_kcal != null && loggedMaintenance === null) loggedMaintenance = eb.tdee_kcal
      if (eb?.balance_kcal != null && loggedBalance === null) loggedBalance = eb.balance_kcal
      if (eb?.workout_kcal_burned != null) {
        burn += eb.workout_kcal_burned
        sawBurn = true
      }

      for (const w of ex.workouts ?? []) {
        day.workoutCount += 1
        const v = workoutVolume(w)
        day.sets += v.sets
        day.reps += v.reps
        day.volumeKg += v.volumeKg
        workoutMin += w.duration_min ?? 0
        if (!sawBurn && w.kcal_burned != null) burn += w.kcal_burned
        exerciseNames.add(w.exercise)
      }
      for (const c of ex.cardio ?? []) {
        day.workoutCount += 1
        cardioMin += c.duration_min ?? 0
        cardioKm += c.distance_km ?? 0
        if (!sawBurn && c.kcal_burned != null) burn += c.kcal_burned
      }

      const b = ex.body
      if (b?.weight_today_kg != null && day.weightKg === null) day.weightKg = b.weight_today_kg
      if (b?.sleep_hours != null && day.sleepH === null) day.sleepH = b.sleep_hours
      if (b?.sleep_quality_1_10 != null && day.sleepQuality === null) day.sleepQuality = b.sleep_quality_1_10
      if (b?.hydration_l != null) day.hydrationL = (day.hydrationL ?? 0) + b.hydration_l

      const m = ex.mental
      if (m?.stress_1_10 != null) stresses.push(m.stress_1_10)
      if (m?.anxiety_1_10 != null) anxieties.push(m.anxiety_1_10)
      if (m?.focus_1_10 != null) focuses.push(m.focus_1_10)
      if (m?.motivation_1_10 != null) motivations.push(m.motivation_1_10)

      if (ex.emotions?.length)
        moods.push(ex.emotions.reduce((s, e) => s + e.intensity_1_10, 0) / ex.emotions.length)
      if (ex.reflection?.rating_1_10 != null && day.dayRating === null) day.dayRating = ex.reflection.rating_1_10

      for (const s of ex.symptoms ?? []) {
        day.symptomCount += 1
        symptomIntensities.push(s.intensity_1_10)
      }
      for (const h of ex.habits ?? []) {
        if (h.status === 'done') day.habitsDone += 1
        else day.habitsSkipped += 1
      }
      if (ex.context?.screen_time_min != null) day.screenMin = (day.screenMin ?? 0) + ex.context.screen_time_min
      if (ex.work?.deep_work_min != null) day.deepWorkMin = (day.deepWorkMin ?? 0) + ex.work.deep_work_min
    }

    day.intakeKcal = sawIntake ? Math.round(intake) : null
    if (sawMacro) {
      day.proteinG = Math.round(protein)
      day.carbsG = Math.round(carbs)
      day.fatG = Math.round(fat)
      day.fiberG = fiber > 0 ? Math.round(fiber) : null
    }
    day.burnKcal = sawBurn || burn > 0 ? Math.round(burn) : null
    day.maintenanceKcal = loggedMaintenance ?? fallbackMaintenance
    day.loggedBalanceKcal = loggedBalance
    day.balanceKcal =
      day.intakeKcal != null && day.maintenanceKcal != null ? Math.round(day.intakeKcal - day.maintenanceKcal) : null
    day.workoutMin = workoutMin > 0 ? Math.round(workoutMin) : null
    day.cardioMin = cardioMin > 0 ? Math.round(cardioMin) : null
    day.cardioKm = cardioKm > 0 ? Math.round(cardioKm * 10) / 10 : null
    day.trained = day.workoutCount > 0
    day.volumeKg = Math.round(day.volumeKg)
    day.exercises = Array.from(exerciseNames)
    day.mood = round(mean(moods), 1)
    day.stress = round(mean(stresses), 1)
    day.anxiety = round(mean(anxieties), 1)
    day.focus = round(mean(focuses), 1)
    day.motivation = round(mean(motivations), 1)
    day.symptomPeak = symptomIntensities.length ? Math.max(...symptomIntensities) : null

    out.push(day)
  }

  attachWeightTrend(out)
  return out
}

/**
 * 7-day centred moving average over logged weights, carried across gaps.
 * With weight logged only a handful of times, a raw line looks like noise; the
 * trend line is what any weight decision should be read off.
 */
function attachWeightTrend(days: DayPoint[]): void {
  const observed = days.map((d, i) => ({ i, w: d.weightKg })).filter((o) => o.w != null) as { i: number; w: number }[]
  if (observed.length === 0) return
  days.forEach((day, idx) => {
    const window = observed.filter((o) => Math.abs(o.i - idx) <= 3)
    if (window.length === 0) return
    day.weightTrendKg = round(window.reduce((s, o) => s + o.w, 0) / window.length, 2)
  })
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function summarise(days: DayPoint[], bodyWeightKg: number | null): PeriodSummary {
  const logged = days.filter((d) => d.logged)
  const withFood = days.filter((d) => d.intakeKcal != null)
  const trained = days.filter((d) => d.trained)
  const weights = days.filter((d) => d.weightKg != null)
  const avgProtein = mean(days.map((d) => d.proteinG))
  const fit = weightFit(days)

  return {
    days: days.length,
    daysLogged: logged.length,
    daysWithFood: withFood.length,
    daysTrained: trained.length,
    trainingPerWeek: days.length ? round((trained.length / days.length) * 7, 1) : null,
    trainingPerWeekLogged: logged.length ? round((trained.length / logged.length) * 7, 1) : null,
    avgIntakeKcal: round(mean(days.map((d) => d.intakeKcal))),
    avgMaintenanceKcal: round(mean(days.map((d) => d.maintenanceKcal))),
    avgBalanceKcal: round(mean(days.map((d) => d.balanceKcal))),
    totalBalanceKcal: withFood.length ? Math.round(sum(days.map((d) => d.balanceKcal))) : null,
    avgBurnKcal: round(mean(days.map((d) => d.burnKcal))),
    avgProteinG: round(avgProtein),
    proteinPerKg: avgProtein != null && bodyWeightKg ? round(avgProtein / bodyWeightKg, 2) : null,
    avgCarbsG: round(mean(days.map((d) => d.carbsG))),
    avgFatG: round(mean(days.map((d) => d.fatG))),
    avgFiberG: round(mean(days.map((d) => d.fiberG))),
    avgSleepH: round(mean(days.map((d) => d.sleepH)), 1),
    avgMood: round(mean(days.map((d) => d.mood)), 1),
    avgStress: round(mean(days.map((d) => d.stress)), 1),
    avgDayRating: round(mean(days.map((d) => d.dayRating)), 1),
    totalVolumeKg: Math.round(sum(days.map((d) => d.volumeKg))),
    totalSets: Math.round(sum(days.map((d) => d.sets))),
    weightStartKg: weights.length ? weights[0].weightKg : null,
    weightEndKg: weights.length ? weights[weights.length - 1].weightKg : null,
    weightChangeKg:
      weights.length >= 2 ? round((weights[weights.length - 1].weightKg ?? 0) - (weights[0].weightKg ?? 0), 2) : null,
    weightRateKgPerWeek: fit ? round(fit.slope * 7, 3) : null,
  }
}

/** Least-squares fit of weight against day index (kg/day). Needs ≥ 3 points. */
function weightFit(days: DayPoint[]): { slope: number; intercept: number; n: number; spanDays: number } | null {
  const pts = days
    .map((d, i) => ({ i, w: d.weightKg }))
    .filter((p): p is { i: number; w: number } => p.w != null)
  if (pts.length < 3) return null
  const fit = linreg(
    pts.map((p) => p.i),
    pts.map((p) => p.w)
  )
  if (!fit) return null
  return { ...fit, n: pts.length, spanDays: pts[pts.length - 1].i - pts[0].i }
}

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------

function analyseEnergy(days: DayPoint[]): EnergyAnalysis {
  let running = 0
  let sawAny = false
  const series = days.map((d) => {
    if (d.balanceKcal != null) {
      running += d.balanceKcal
      sawAny = true
    }
    return {
      date: d.date,
      label: d.label,
      intake: d.intakeKcal,
      maintenance: d.maintenanceKcal,
      burn: d.burnKcal,
      balance: d.balanceKcal,
      cumulative: sawAny ? Math.round(running) : null,
      trained: d.trained,
    }
  })

  const balanced = days.filter((d) => d.balanceKcal != null)
  const surplus = balanced.filter((d) => (d.balanceKcal as number) > 0)
  const deficit = balanced.filter((d) => (d.balanceKcal as number) < 0)
  const rank = (asc: boolean) =>
    [...balanced]
      .sort((a, b) => ((a.balanceKcal as number) - (b.balanceKcal as number)) * (asc ? 1 : -1))
      .slice(0, 8)
      .map((d) => ({
        date: d.date,
        label: d.label,
        balance: d.balanceKcal as number,
        intake: d.intakeKcal,
        trained: d.trained,
      }))

  return {
    series,
    cumulativeKcal: sawAny ? Math.round(running) : null,
    predictedWeightChangeKg: sawAny ? round(running / KCAL_PER_KG, 2) : null,
    surplusDays: surplus.length,
    deficitDays: deficit.length,
    surplusTotalKcal: Math.round(sum(surplus.map((d) => d.balanceKcal))),
    deficitTotalKcal: Math.round(sum(deficit.map((d) => d.balanceKcal))),
    worstDays: rank(false),
    bestDays: rank(true),
  }
}

// ---------------------------------------------------------------------------
// Weight — the causal story
// ---------------------------------------------------------------------------

/**
 * Split an observed weight change into lean vs fat mass.
 *
 * This is an ESTIMATE from published partitioning ranges, not a measurement —
 * only a DEXA/BIA scan measures composition. The heuristic uses the three
 * levers that actually drive partitioning: rate of change, resistance-training
 * frequency, and protein intake. Confidence is never better than 'medium'.
 */
function estimateComposition(
  changeKg: number,
  ratePerWeek: number,
  trainingPerWeek: number,
  proteinPerKg: number | null,
  bodyWeightKg: number | null
): WeightAnalysis['composition'] {
  if (Math.abs(changeKg) < 0.3) return null
  const trains = trainingPerWeek >= 3
  const highProtein = (proteinPerKg ?? 0) >= 1.6
  const okProtein = (proteinPerKg ?? 0) >= 1.2
  const gaining = changeKg > 0

  let leanShare: number
  let reasoning: string

  if (gaining) {
    const fastGain = ratePerWeek > 0.5
    if (trains && highProtein && !fastGain) {
      leanShare = 0.4
      reasoning = `Gaining slowly (${ratePerWeek.toFixed(2)} kg/wk) while lifting ${trainingPerWeek.toFixed(1)}×/wk on ${(proteinPerKg ?? 0).toFixed(1)} g/kg protein — the partitioning window where a real share of the gain is lean tissue.`
    } else if (trains && okProtein) {
      leanShare = 0.25
      reasoning = fastGain
        ? `Gaining fast (${ratePerWeek.toFixed(2)} kg/wk). Muscle can't be built at that speed — past roughly 0.5 kg/wk the extra is mostly fat.`
        : `Training is there but protein (${(proteinPerKg ?? 0).toFixed(1)} g/kg) is under 1.6 g/kg, which caps how much of the gain can be lean.`
    } else {
      leanShare = 0.1
      reasoning = trains
        ? `Protein is too low to support lean gain, so almost all of this is fat.`
        : `Only ${trainingPerWeek.toFixed(1)} resistance sessions a week. Without a training stimulus a surplus goes to fat.`
    }
  } else {
    const fastLoss = bodyWeightKg ? Math.abs(ratePerWeek) > bodyWeightKg * 0.01 : Math.abs(ratePerWeek) > 0.9
    if (trains && highProtein && !fastLoss) {
      leanShare = 0.1
      reasoning = `Losing at a controlled ${Math.abs(ratePerWeek).toFixed(2)} kg/wk with ${trainingPerWeek.toFixed(1)} sessions/wk and ${(proteinPerKg ?? 0).toFixed(1)} g/kg protein — conditions that protect muscle, so most of the loss is fat.`
    } else if (trains || okProtein) {
      leanShare = 0.25
      reasoning = fastLoss
        ? `Losing fast (${Math.abs(ratePerWeek).toFixed(2)} kg/wk). Above ~1% of bodyweight a week, lean mass starts going with the fat.`
        : `Either training or protein is short of the muscle-sparing threshold, so some of the loss is lean tissue.`
    } else {
      leanShare = 0.35
      reasoning = `Little resistance training and low protein while losing weight — a meaningful share of this is muscle, not fat.`
    }
  }

  return {
    changeKg: round(changeKg, 2) as number,
    leanKg: round(changeKg * leanShare, 2) as number,
    fatKg: round(changeKg * (1 - leanShare), 2) as number,
    leanShare: Math.round(leanShare * 100),
    confidence: (proteinPerKg != null && trainingPerWeek > 0 ? 'medium' : 'low') as 'low' | 'medium',
    reasoning,
  }
}

function analyseWeight(
  days: DayPoint[],
  summary: PeriodSummary,
  energy: EnergyAnalysis,
  profile: AnalyticsProfile
): WeightAnalysis {
  const fit = weightFit(days)
  const observed = days.filter((d) => d.weightKg != null)
  const firstKg = observed.length ? (observed[0].weightKg as number) : null

  // The energy-predicted line: start at the first real observation and walk it
  // forward by cumulative balance / 7700 so the two lines are directly comparable.
  const baseCumulative =
    observed.length && energy.series.length
      ? energy.series.find((s) => s.date === observed[0].date)?.cumulative ?? 0
      : 0

  const series = days.map((d, i) => {
    const cum = energy.series[i]?.cumulative
    const predicted =
      firstKg != null && cum != null && d.date >= (observed[0]?.date ?? d.date)
        ? round(firstKg + (cum - baseCumulative) / KCAL_PER_KG, 2)
        : null
    return { date: d.date, label: d.label, weight: d.weightKg, trend: d.weightTrendKg, predicted }
  })

  const rateKgPerWeek = fit ? round(fit.slope * 7, 3) : null
  const fittedChangeKg = fit ? round(fit.slope * (days.length - 1), 2) : null

  // The number that needs no BMR formula: maintenance implied by the user's own
  // intake and their own weight trend.
  const avgIntake = summary.avgIntakeKcal
  const trueMaintenanceKcal =
    avgIntake != null && fit && fit.n >= 3 && fit.spanDays >= 10
      ? Math.round(avgIntake - fit.slope * KCAL_PER_KG)
      : null
  const assumedMaintenanceKcal = summary.avgMaintenanceKcal

  const composition =
    fittedChangeKg != null && rateKgPerWeek != null
      ? estimateComposition(
          fittedChangeKg,
          rateKgPerWeek,
          summary.trainingPerWeek ?? 0,
          summary.proteinPerKg,
          profile.weightKg
        )
      : null

  // Physically-impossible move check: a swing far bigger than the energy maths
  // allows, over a short span, is water / glycogen / gut content — not tissue.
  let waterWeightNote: string | null = null
  if (observed.length >= 2) {
    for (let i = 1; i < observed.length; i++) {
      const gapDays = daysBetween(observed[i - 1].date, observed[i].date)
      const delta = (observed[i].weightKg as number) - (observed[i - 1].weightKg as number)
      if (gapDays > 0 && gapDays <= 4 && Math.abs(delta) >= 1.2) {
        waterWeightNote = `Your weight moved ${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg in ${gapDays} day${gapDays > 1 ? 's' : ''} (${shortLabel(observed[i - 1].date)} → ${shortLabel(observed[i].date)}). That is far too fast to be fat or muscle — ${Math.abs(delta).toFixed(1)} kg of tissue is ~${Math.round(Math.abs(delta) * KCAL_PER_KG).toLocaleString()} kcal. It is water, glycogen, salt or food in transit. Read the trend line, not single weigh-ins.`
        break
      }
    }
  }

  const targetKg = profile.targetWeightKg
  const lastKg = observed.length ? (observed[observed.length - 1].weightKg as number) : null
  let weeksToTarget: number | null = null
  if (targetKg != null && lastKg != null && rateKgPerWeek != null && Math.abs(rateKgPerWeek) > 0.02) {
    const need = targetKg - lastKg
    if (Math.sign(need) === Math.sign(rateKgPerWeek)) weeksToTarget = Math.round(Math.abs(need / rateKgPerWeek))
  }

  const bmi = lastKg != null && profile.heightCm ? calculateBMI(lastKg, profile.heightCm) : profile.bmi

  return {
    series,
    observations: observed.length,
    firstKg,
    lastKg,
    rateKgPerWeek,
    fittedChangeKg,
    targetKg,
    weeksToTarget,
    trueMaintenanceKcal,
    assumedMaintenanceKcal,
    maintenanceGapKcal:
      trueMaintenanceKcal != null && assumedMaintenanceKcal != null
        ? Math.round(trueMaintenanceKcal - assumedMaintenanceKcal)
        : null,
    composition,
    waterWeightNote,
    bmi,
    bmiCategory: bmi != null ? getBMICategory(bmi) : null,
  }
}

// ---------------------------------------------------------------------------
// Trained vs rest days
// ---------------------------------------------------------------------------

function dayTypeStat(days: DayPoint[], type: 'trained' | 'rest'): DayTypeStat {
  // Averages run over food-logged days only. Including unlogged days would
  // silently average one recorded rest day against fifty blanks.
  const withFood = days.filter((d) => d.intakeKcal != null)
  const surplus = withFood.filter((d) => (d.balanceKcal ?? 0) > 0)
  return {
    type,
    days: days.length,
    daysWithFood: withFood.length,
    avgIntake: round(mean(withFood.map((d) => d.intakeKcal))),
    avgMaintenance: round(mean(withFood.map((d) => d.maintenanceKcal))),
    avgBalance: round(mean(withFood.map((d) => d.balanceKcal))),
    avgProtein: round(mean(withFood.map((d) => d.proteinG))),
    surplusDays: surplus.length,
    surplusKcal: Math.round(sum(surplus.map((d) => d.balanceKcal))),
  }
}

function analyseDayType(days: DayPoint[]): DayTypeAnalysis {
  const trainedDays = days.filter((d) => d.trained)
  const restDays = days.filter((d) => !d.trained)
  const trained = dayTypeStat(trainedDays, 'trained')
  const rest = dayTypeStat(restDays, 'rest')

  return {
    trained,
    rest,
    intakeDeltaKcal:
      rest.avgIntake != null && trained.avgIntake != null ? Math.round(rest.avgIntake - trained.avgIntake) : null,
    restSurplusKg: rest.surplusKcal > 0 ? round(rest.surplusKcal / KCAL_PER_KG, 2) : null,
    unloggedRestDays: restDays
      .filter((d) => d.intakeKcal == null)
      .map((d) => ({ date: d.date, label: d.label })),
  }
}

function analyseWeekday(days: DayPoint[]): WeekdayStat[] {
  // Monday-first, matching the Monday-anchored weeks used everywhere else here.
  const order = [1, 2, 3, 4, 5, 6, 0]
  return order.map((wd) => {
    const subset = days.filter((d) => d.weekday === wd)
    const trainedCount = subset.filter((d) => d.trained).length
    return {
      weekday: wd,
      name: WEEKDAY_NAMES[wd],
      days: subset.length,
      daysWithFood: subset.filter((d) => d.intakeKcal != null).length,
      daysTrained: trainedCount,
      trainedPct: pct(trainedCount, subset.length),
      avgIntake: round(mean(subset.map((d) => d.intakeKcal))),
      avgBalance: round(mean(subset.map((d) => d.balanceKcal))),
      avgVolumeKg: round(mean(subset.filter((d) => d.trained).map((d) => d.volumeKg))),
    }
  })
}

function analyseWeekly(days: DayPoint[]): WeeklyPoint[] {
  const byWeek = new Map<string, DayPoint[]>()
  for (const d of days) {
    const k = weekStartOf(d.date)
    byWeek.set(k, [...(byWeek.get(k) ?? []), d])
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, subset]) => ({
      weekStart,
      label: shortLabel(weekStart),
      daysLogged: subset.filter((d) => d.logged).length,
      daysTrained: subset.filter((d) => d.trained).length,
      avgIntake: round(mean(subset.map((d) => d.intakeKcal))),
      avgBalance: round(mean(subset.map((d) => d.balanceKcal))),
      totalBalance: subset.some((d) => d.balanceKcal != null) ? Math.round(sum(subset.map((d) => d.balanceKcal))) : null,
      avgProtein: round(mean(subset.map((d) => d.proteinG))),
      volumeKg: Math.round(sum(subset.map((d) => d.volumeKg))),
      sets: Math.round(sum(subset.map((d) => d.sets))),
      avgWeightKg: round(mean(subset.map((d) => d.weightKg)), 2),
      avgSleepH: round(mean(subset.map((d) => d.sleepH)), 1),
    }))
}

function analyseMonthly(days: DayPoint[]): MonthlyPoint[] {
  const byMonth = new Map<string, DayPoint[]>()
  for (const d of days) {
    const k = d.date.slice(0, 7)
    byMonth.set(k, [...(byMonth.get(k) ?? []), d])
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, subset]) => {
      const weights = subset.filter((d) => d.weightKg != null)
      return {
        month,
        label: new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
          timeZone: 'UTC',
        }),
        daysLogged: subset.filter((d) => d.logged).length,
        daysTrained: subset.filter((d) => d.trained).length,
        avgIntake: round(mean(subset.map((d) => d.intakeKcal))),
        avgBalance: round(mean(subset.map((d) => d.balanceKcal))),
        totalBalance: subset.some((d) => d.balanceKcal != null)
          ? Math.round(sum(subset.map((d) => d.balanceKcal)))
          : null,
        avgWeightKg: round(mean(subset.map((d) => d.weightKg)), 2),
        weightChangeKg:
          weights.length >= 2
            ? round((weights[weights.length - 1].weightKg as number) - (weights[0].weightKg as number), 2)
            : null,
        volumeKg: Math.round(sum(subset.map((d) => d.volumeKg))),
      }
    })
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

function analyseNutrition(
  entries: RawEntry[],
  days: DayPoint[],
  summary: PeriodSummary,
  profile: AnalyticsProfile
): NutritionAnalysis {
  const start = days[0]?.date ?? ''
  const end = days[days.length - 1]?.date ?? ''
  const balanceByDate = new Map(days.map((d) => [d.date, d.balanceKcal]))

  interface FoodAcc {
    display: string
    days: Set<string>
    servings: number
    kcal: number
    protein: number
    surplusDays: Set<string>
    deficitDays: Set<string>
  }
  const foods = new Map<string, FoodAcc>()
  const mealKcal = new Map<string, { kcal: number; days: Set<string> }>()
  let totalKcalFromItems = 0

  for (const e of entries) {
    const ex = e.extracted_json
    if (!ex) continue
    const date = effectiveDate(ex, e.created_at)
    if (date < start || date > end) continue
    const balance = balanceByDate.get(date) ?? null

    for (const n of ex.nutrition ?? []) {
      const key = n.item.trim().toLowerCase()
      if (!key) continue
      const acc =
        foods.get(key) ??
        ({
          display: titleCase(key),
          days: new Set<string>(),
          servings: 0,
          kcal: 0,
          protein: 0,
          surplusDays: new Set<string>(),
          deficitDays: new Set<string>(),
        } as FoodAcc)
      acc.days.add(date)
      acc.servings += 1
      acc.kcal += n.est_kcal || 0
      acc.protein += n.protein_g || 0
      if (balance != null) (balance > 0 ? acc.surplusDays : acc.deficitDays).add(date)
      foods.set(key, acc)
      totalKcalFromItems += n.est_kcal || 0

      const meal = (n.meal_type || 'unspecified').toLowerCase()
      const m = mealKcal.get(meal) ?? { kcal: 0, days: new Set<string>() }
      m.kcal += n.est_kcal || 0
      m.days.add(date)
      mealKcal.set(meal, m)
    }
  }

  const surplusDayCount = days.filter((d) => (d.balanceKcal ?? 0) > 0).length
  const deficitDayCount = days.filter((d) => (d.balanceKcal ?? 0) < 0).length

  const toStat = (key: string, acc: FoodAcc): FoodStat => {
    // Lift = share of surplus days this food appears on ÷ share of deficit days.
    // > 1 means it shows up disproportionately when the day ends over maintenance.
    const surplusRate = surplusDayCount > 0 ? acc.surplusDays.size / surplusDayCount : null
    const deficitRate = deficitDayCount > 0 ? acc.deficitDays.size / deficitDayCount : null
    const lift =
      surplusRate != null && deficitRate != null && deficitRate > 0
        ? round(surplusRate / deficitRate, 2)
        : surplusRate != null && surplusRate > 0 && deficitRate === 0
          ? 99
          : null
    return {
      item: acc.display,
      days: acc.days.size,
      servings: acc.servings,
      totalKcal: Math.round(acc.kcal),
      avgKcal: acc.servings ? Math.round(acc.kcal / acc.servings) : 0,
      proteinG: Math.round(acc.protein),
      kcalShare: totalKcalFromItems > 0 ? round((acc.kcal / totalKcalFromItems) * 100, 1) ?? 0 : 0,
      surplusLift: lift,
      surplusDays: acc.surplusDays.size,
      deficitDays: acc.deficitDays.size,
    }
  }

  const allFoods = Array.from(foods.entries()).map(([k, v]) => toStat(k, v))

  const calorieTargetKcal = profile.calorieTargetKcal
  const intakes = nums(days.map((d) => d.intakeKcal))
  const histogram = (() => {
    if (!intakes.length) return []
    const size = 250
    const min = Math.floor(Math.min(...intakes) / size) * size
    const max = Math.ceil(Math.max(...intakes) / size) * size
    const buckets: { bucket: string; days: number; over: boolean }[] = []
    for (let b = min; b < max; b += size) {
      const count = intakes.filter((v) => v >= b && v < b + size).length
      buckets.push({
        bucket: `${(b / 1000).toFixed(1)}–${((b + size) / 1000).toFixed(1)}k`,
        days: count,
        over: calorieTargetKcal != null ? b >= calorieTargetKcal : false,
      })
    }
    return buckets
  })()

  const totalMealKcal = Array.from(mealKcal.values()).reduce((s, m) => s + m.kcal, 0)
  // Chronological where the label is recognised; anything else (pre_workout,
  // "meal", …) sorts after the known ones rather than jumping to the front.
  const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner']
  const mealRank = (m: string) => {
    const i = MEAL_ORDER.indexOf(m)
    return i === -1 ? 90 : i
  }

  return {
    macroSplit: (() => {
      const p = summary.avgProteinG
      const c = summary.avgCarbsG
      const f = summary.avgFatG
      if (p == null || c == null || f == null) return null
      const kcal = p * 4 + c * 4 + f * 9
      if (kcal <= 0) return null
      return {
        protein: Math.round(((p * 4) / kcal) * 100),
        carbs: Math.round(((c * 4) / kcal) * 100),
        fat: Math.round(((f * 9) / kcal) * 100),
      }
    })(),
    macroSeries: days.map((d) => ({
      date: d.date,
      label: d.label,
      protein: d.proteinG,
      carbs: d.carbsG,
      fat: d.fatG,
    })),
    proteinSeries: days.map((d) => ({
      date: d.date,
      label: d.label,
      perKg: d.proteinG != null && profile.weightKg ? round(d.proteinG / profile.weightKg, 2) : null,
    })),
    proteinTargetPerKg: profile.nutritionGoal === 'maintain' ? 1.6 : 1.8,
    intakeHistogram: histogram,
    mealTypes: Array.from(mealKcal.entries())
      .map(([mealType, m]) => ({
        mealType,
        kcal: Math.round(m.kcal),
        avgKcal: m.days.size ? Math.round(m.kcal / m.days.size) : 0,
        days: m.days.size,
        share: totalMealKcal > 0 ? Math.round((m.kcal / totalMealKcal) * 100) : 0,
      }))
      .sort((a, b) => mealRank(a.mealType) - mealRank(b.mealType) || b.kcal - a.kcal),
    topFoodsByKcal: [...allFoods].sort((a, b) => b.totalKcal - a.totalKcal).slice(0, 15),
    topFoodsByFrequency: [...allFoods].sort((a, b) => b.days - a.days).slice(0, 15),
    surplusOffenders: allFoods
      // ≥150 kcal a serving: a food that only ever appears on surplus days but
      // costs 60 kcal did not cause the surplus, and naming it is noise.
      .filter((f) => f.surplusDays >= 2 && (f.surplusLift ?? 0) > 1.4 && f.avgKcal >= 150)
      .sort((a, b) => (b.surplusLift ?? 0) - (a.surplusLift ?? 0) || b.totalKcal - a.totalKcal)
      .slice(0, 10),
    daysOverTarget: calorieTargetKcal != null ? intakes.filter((v) => v > calorieTargetKcal).length : 0,
    daysUnderTarget: calorieTargetKcal != null ? intakes.filter((v) => v <= calorieTargetKcal).length : 0,
    calorieTargetKcal,
    avgMealsPerDay: round(mean(days.filter((d) => d.logged).map((d) => d.mealCount)), 1),
    fiberTargetG: 30,
  }
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

function analyseTraining(entries: RawEntry[], days: DayPoint[], weekly: WeeklyPoint[]): TrainingAnalysis {
  const start = days[0]?.date ?? ''
  const end = days[days.length - 1]?.date ?? ''

  interface ExAcc {
    display: string
    byDate: Map<string, { sets: number; volumeKg: number; topWeight: number | null; e1rm: number | null; bestSet: { weight: number; reps: number } | null }>
  }
  const exercises = new Map<string, ExAcc>()
  const muscleSets = new Map<string, { sets: number; sessions: Set<string> }>()
  let pushSets = 0
  let pullSets = 0
  let upperSets = 0
  let lowerSets = 0

  for (const e of entries) {
    const ex = e.extracted_json
    if (!ex) continue
    const date = effectiveDate(ex, e.created_at)
    if (date < start || date > end) continue

    for (const w of ex.workouts ?? []) {
      const key = normExercise(w.exercise)
      if (!key) continue
      const acc = exercises.get(key) ?? { display: titleCase(w.exercise.trim()), byDate: new Map() }
      const v = workoutVolume(w)
      const cur = acc.byDate.get(date) ?? { sets: 0, volumeKg: 0, topWeight: null, e1rm: null, bestSet: null }
      cur.sets += v.sets
      cur.volumeKg += v.volumeKg
      if (v.topWeight != null && (cur.topWeight === null || v.topWeight > cur.topWeight)) cur.topWeight = v.topWeight
      if (v.e1rm != null && (cur.e1rm === null || v.e1rm > cur.e1rm)) cur.e1rm = v.e1rm
      // Track the single best set for the PR board.
      for (const s of w.set_log ?? []) {
        if (s.weight_kg && s.reps) {
          const est = epley1RM(s.weight_kg - (s.assist_kg ?? 0), s.reps)
          if (!cur.bestSet || est > epley1RM(cur.bestSet.weight, cur.bestSet.reps))
            cur.bestSet = { weight: s.weight_kg, reps: s.reps }
        }
      }
      if (!cur.bestSet && w.weight_kg && w.reps) cur.bestSet = { weight: w.weight_kg, reps: w.reps }
      acc.byDate.set(date, cur)
      exercises.set(key, acc)

      // Muscle attribution: the workout's sets count once per tagged muscle.
      const tagged = new Set((w.muscles ?? []).map(muscleGroup))
      for (const g of tagged) {
        const m = muscleSets.get(g) ?? { sets: 0, sessions: new Set<string>() }
        m.sets += v.sets
        m.sessions.add(date)
        muscleSets.set(g, m)
      }
      for (const raw of w.muscles ?? []) {
        const pp = pushPullOf(raw)
        if (pp === 'push') pushSets += v.sets / (w.muscles?.length || 1)
        if (pp === 'pull') pullSets += v.sets / (w.muscles?.length || 1)
        const ul = upperLowerOf(raw)
        if (ul === 'upper') upperSets += v.sets / (w.muscles?.length || 1)
        if (ul === 'lower') lowerSets += v.sets / (w.muscles?.length || 1)
      }
    }
  }

  const weeks = Math.max(1, days.length / 7)

  const exerciseStats: ExerciseStat[] = Array.from(exercises.values())
    .map((acc) => {
      const history = Array.from(acc.byDate.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, v]) => ({
          date,
          label: shortLabel(date),
          topWeightKg: v.topWeight,
          e1rm: v.e1rm,
          volumeKg: Math.round(v.volumeKg),
          sets: v.sets,
        }))
      const withE1RM = history.filter((h) => h.e1rm != null)
      const firstE1RM = withE1RM.length ? (withE1RM[0].e1rm as number) : null
      const lastE1RM = withE1RM.length ? (withE1RM[withE1RM.length - 1].e1rm as number) : null
      const bestE1RM = withE1RM.length ? Math.max(...withE1RM.map((h) => h.e1rm as number)) : null
      const progressPct =
        firstE1RM != null && lastE1RM != null && firstE1RM > 0
          ? round(((lastE1RM - firstE1RM) / firstE1RM) * 100, 1)
          : null
      const status: ExerciseStat['status'] =
        history.length < 2
          ? 'new'
          : progressPct == null
            ? 'new'
            : progressPct > 2
              ? 'progressing'
              : progressPct < -2
                ? 'regressing'
                : 'stalled'
      return {
        name: acc.display,
        sessions: history.length,
        sets: history.reduce((s, h) => s + h.sets, 0),
        totalVolumeKg: history.reduce((s, h) => s + h.volumeKg, 0),
        topWeightKg: history.reduce<number | null>((b, h) => (h.topWeightKg != null && (b === null || h.topWeightKg > b) ? h.topWeightKg : b), null),
        bestE1RM,
        firstE1RM,
        lastE1RM,
        progressPct,
        lastDate: history[history.length - 1]?.date ?? '',
        status,
        history,
      }
    })
    .sort((a, b) => b.sessions - a.sessions || b.totalVolumeKg - a.totalVolumeKg)

  // PR board: for each exercise, the session where its estimated 1RM peaked.
  const prs = Array.from(exercises.values())
    .map((acc) => {
      let best: { date: string; weight: number; reps: number; e1rm: number } | null = null
      for (const [date, v] of acc.byDate) {
        if (!v.bestSet) continue
        const e1rm = epley1RM(v.bestSet.weight, v.bestSet.reps)
        if (!best || e1rm > best.e1rm) best = { date, weight: v.bestSet.weight, reps: v.bestSet.reps, e1rm }
      }
      return best ? { name: acc.display, date: best.date, label: shortLabel(best.date), weightKg: best.weight, reps: best.reps, e1rm: best.e1rm } : null
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 12)

  const totalMuscleSets = Array.from(muscleSets.values()).reduce((s, m) => s + m.sets, 0)
  const muscles: MuscleStat[] = Array.from(muscleSets.entries())
    // Tags that produced no sets (e.g. a "cardiovascular" tag on a timed move)
    // would render as empty bars.
    .filter(([, m]) => m.sets > 0)
    .map(([group, m]) => ({
      group,
      sets: Math.round(m.sets),
      setsPerWeek: round(m.sets / weeks, 1) ?? 0,
      sessions: m.sessions.size,
      share: totalMuscleSets > 0 ? Math.round((m.sets / totalMuscleSets) * 100) : 0,
    }))
    .sort((a, b) => b.sets - a.sets)

  // Training gaps
  const trainedDates = days.filter((d) => d.trained).map((d) => d.date)
  let longestGapDays = 0
  if (trainedDates.length >= 2) {
    for (let i = 1; i < trainedDates.length; i++)
      longestGapDays = Math.max(longestGapDays, daysBetween(trainedDates[i - 1], trainedDates[i]) - 1)
  }
  const currentGapDays = trainedDates.length ? daysBetween(trainedDates[trainedDates.length - 1], end) : days.length

  return {
    weekly: weekly.map((w) => {
      const subset = days.filter((d) => weekStartOf(d.date) === w.weekStart)
      return {
        weekStart: w.weekStart,
        label: w.label,
        sets: w.sets,
        volumeKg: w.volumeKg,
        sessions: w.daysTrained,
        cardioMin: Math.round(sum(subset.map((d) => d.cardioMin))),
      }
    }),
    muscles,
    pushPullRatio: pullSets > 0 ? round(pushSets / pullSets, 2) : null,
    upperLowerRatio: lowerSets > 0 ? round(upperSets / lowerSets, 2) : null,
    exercises: exerciseStats,
    prs,
    stalled: exerciseStats.filter((e) => e.status === 'stalled' && e.sessions >= 3).slice(0, 8),
    longestGapDays,
    currentGapDays,
    avgSessionMin: round(mean(days.filter((d) => d.trained).map((d) => d.workoutMin))),
    totalCardioMin: Math.round(sum(days.map((d) => d.cardioMin))),
    totalCardioKm: round(sum(days.map((d) => d.cardioKm)), 1) ?? 0,
    missedDays: days
      .filter((d) => !d.trained)
      .map((d) => ({
        date: d.date,
        label: d.label,
        weekday: WEEKDAY_NAMES[d.weekday].slice(0, 3),
        intake: d.intakeKcal,
        balance: d.balanceKcal,
        logged: d.logged,
      }))
      .reverse(),
  }
}

// ---------------------------------------------------------------------------
// Recovery / mind
// ---------------------------------------------------------------------------

function analyseRecovery(entries: RawEntry[], days: DayPoint[]): RecoveryAnalysis {
  const start = days[0]?.date ?? ''
  const end = days[days.length - 1]?.date ?? ''

  const energyCurve = new Map<string, { total: number; n: number }>()
  const symptoms = new Map<string, { n: number; sum: number; last: string; triggers: Set<string> }>()
  const emotions = new Map<string, { n: number; sum: number }>()
  const habits = new Map<string, { done: number; skipped: number }>()

  for (const e of entries) {
    const ex = e.extracted_json
    if (!ex) continue
    const date = effectiveDate(ex, e.created_at)
    if (date < start || date > end) continue

    for (const p of ex.body?.energy_curve ?? []) {
      const k = p.time_of_day.toLowerCase()
      const cur = energyCurve.get(k) ?? { total: 0, n: 0 }
      cur.total += p.level
      cur.n += 1
      energyCurve.set(k, cur)
    }
    for (const s of ex.symptoms ?? []) {
      const k = s.name.trim().toLowerCase()
      if (!k) continue
      const cur = symptoms.get(k) ?? { n: 0, sum: 0, last: date, triggers: new Set<string>() }
      cur.n += 1
      cur.sum += s.intensity_1_10
      if (date > cur.last) cur.last = date
      if (s.trigger) cur.triggers.add(s.trigger)
      symptoms.set(k, cur)
    }
    for (const em of ex.emotions ?? []) {
      const k = em.feeling.trim().toLowerCase()
      if (!k) continue
      const cur = emotions.get(k) ?? { n: 0, sum: 0 }
      cur.n += 1
      cur.sum += em.intensity_1_10
      emotions.set(k, cur)
    }
    for (const h of ex.habits ?? []) {
      const k = h.name.trim()
      if (!k) continue
      const cur = habits.get(k) ?? { done: 0, skipped: 0 }
      if (h.status === 'done') cur.done += 1
      else cur.skipped += 1
      habits.set(k, cur)
    }
  }

  const CURVE_ORDER = ['morning', 'mid-morning', 'midday', 'noon', 'afternoon', 'evening', 'night']
  const curveRank = (k: string) => {
    const i = CURVE_ORDER.findIndex((c) => k.includes(c))
    return i === -1 ? 99 : i
  }

  const shortSleep = days.filter((d) => d.sleepH != null && (d.sleepH as number) < 7 && d.intakeKcal != null)
  const normalSleep = days.filter((d) => d.sleepH != null && (d.sleepH as number) >= 7 && d.intakeKcal != null)

  return {
    series: days.map((d) => ({
      date: d.date,
      label: d.label,
      sleepH: d.sleepH,
      sleepQuality: d.sleepQuality,
      mood: d.mood,
      stress: d.stress,
      focus: d.focus,
      motivation: d.motivation,
      dayRating: d.dayRating,
    })),
    energyCurve: Array.from(energyCurve.entries())
      .map(([timeOfDay, v]) => ({ timeOfDay: titleCase(timeOfDay), avgLevel: round(v.total / v.n, 1) ?? 0, n: v.n }))
      .sort((a, b) => curveRank(a.timeOfDay.toLowerCase()) - curveRank(b.timeOfDay.toLowerCase())),
    symptoms: Array.from(symptoms.entries())
      .map(([name, v]) => ({
        name: titleCase(name),
        occurrences: v.n,
        avgIntensity: round(v.sum / v.n, 1) ?? 0,
        lastDate: v.last,
        triggers: Array.from(v.triggers).slice(0, 4),
      }))
      .sort((a, b) => b.occurrences - a.occurrences),
    emotions: Array.from(emotions.entries())
      .map(([feeling, v]) => ({ feeling: titleCase(feeling), count: v.n, avgIntensity: round(v.sum / v.n, 1) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    habits: Array.from(habits.entries())
      .map(([name, v]) => ({
        name,
        done: v.done,
        skipped: v.skipped,
        consistency: pct(v.done, v.done + v.skipped),
      }))
      .sort((a, b) => b.done - a.done)
      .slice(0, 12),
    sleepVsIntake: shortSleep.length >= 3 && normalSleep.length >= 3
      ? {
          shortSleepAvgIntake: round(mean(shortSleep.map((d) => d.intakeKcal))),
          normalSleepAvgIntake: round(mean(normalSleep.map((d) => d.intakeKcal))),
          shortSleepDays: shortSleep.length,
        }
      : null,
  }
}

// ---------------------------------------------------------------------------
// Correlations
// ---------------------------------------------------------------------------

const CORR_METRICS: { key: keyof DayPoint; label: string }[] = [
  { key: 'intakeKcal', label: 'calorie intake' },
  { key: 'balanceKcal', label: 'energy balance' },
  { key: 'proteinG', label: 'protein' },
  { key: 'carbsG', label: 'carbs' },
  { key: 'fiberG', label: 'fiber' },
  { key: 'sleepH', label: 'sleep hours' },
  { key: 'sleepQuality', label: 'sleep quality' },
  { key: 'mood', label: 'mood' },
  { key: 'stress', label: 'stress' },
  { key: 'focus', label: 'focus' },
  { key: 'motivation', label: 'motivation' },
  { key: 'dayRating', label: 'day rating' },
  { key: 'volumeKg', label: 'training volume' },
  { key: 'workoutMin', label: 'training minutes' },
  { key: 'weightKg', label: 'body weight' },
  { key: 'symptomCount', label: 'symptoms' },
]

function analyseCorrelations(days: DayPoint[]): Correlation[] {
  const out: Correlation[] = []
  for (let i = 0; i < CORR_METRICS.length; i++) {
    for (let j = i + 1; j < CORR_METRICS.length; j++) {
      const a = CORR_METRICS[i]
      const b = CORR_METRICS[j]
      const pairs: { x: number; y: number; date: string }[] = []
      for (const d of days) {
        // volumeKg / symptomCount are 0 on rest days by construction; only count
        // days that were actually logged so zeros aren't mistaken for data.
        if (!d.logged) continue
        const x = d[a.key]
        const y = d[b.key]
        if (typeof x !== 'number' || typeof y !== 'number') continue
        pairs.push({ x, y, date: d.date })
      }
      if (pairs.length < 6) continue
      const r = pearson(pairs.map((p) => p.x), pairs.map((p) => p.y))
      if (!Number.isFinite(r) || Math.abs(r) < 0.35) continue
      const abs = Math.abs(r)
      out.push({
        aKey: a.key as string,
        bKey: b.key as string,
        a: a.label,
        b: b.label,
        r: round(r, 2) as number,
        n: pairs.length,
        strength: abs >= 0.6 ? 'strong' : abs >= 0.45 ? 'moderate' : 'weak',
        sentence: `On days with more ${a.label}, your ${b.label} tends to be ${r > 0 ? 'higher' : 'lower'} (r = ${r.toFixed(2)}, ${pairs.length} days).`,
        points: pairs,
      })
    }
  }
  return out.sort((p, q) => Math.abs(q.r) - Math.abs(p.r)).slice(0, 14)
}

// ---------------------------------------------------------------------------
// Gaps, streaks, coverage
// ---------------------------------------------------------------------------

function analyseGaps(days: DayPoint[], allTimeLoggedDates: string[]): GapAnalysis {
  const logged = days.filter((d) => d.logged)

  // Streaks are computed over all-time dates so a short range doesn't truncate them.
  const sorted = [...allTimeLoggedDates].sort()
  let longest = sorted.length ? 1 : 0
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) run += 1
    else run = 1
    longest = Math.max(longest, run)
  }
  let current = 0
  if (sorted.length) {
    const today = isoDate(new Date())
    const gapToToday = daysBetween(sorted[sorted.length - 1], today)
    if (gapToToday <= 1) {
      current = 1
      for (let i = sorted.length - 1; i > 0; i--) {
        if (daysBetween(sorted[i - 1], sorted[i]) === 1) current += 1
        else break
      }
    }
  }

  // Runs of consecutive unlogged days inside the range.
  const gaps: { start: string; end: string; days: number }[] = []
  let gapStart: string | null = null
  for (const d of days) {
    if (!d.logged) {
      gapStart ??= d.date
    } else if (gapStart) {
      const prev = addDays(d.date, -1)
      gaps.push({ start: gapStart, end: prev, days: daysBetween(gapStart, prev) + 1 })
      gapStart = null
    }
  }
  if (gapStart) {
    const last = days[days.length - 1].date
    gaps.push({ start: gapStart, end: last, days: daysBetween(gapStart, last) + 1 })
  }

  const heatDays = days.slice(-182)
  return {
    heatmap: heatDays.map((d) => ({
      date: d.date,
      logged: d.logged,
      trained: d.trained,
      intake: d.intakeKcal,
      balance: d.balanceKcal,
    })),
    currentStreak: current,
    longestStreak: longest,
    daysLogged: logged.length,
    daysMissed: days.length - logged.length,
    loggingRate: pct(logged.length, days.length),
    gaps: gaps.sort((a, b) => b.days - a.days).slice(0, 10),
  }
}

function analyseCoverage(days: DayPoint[]): CoverageStat[] {
  const n = days.length || 1
  const count = (fn: (d: DayPoint) => boolean) => days.filter(fn).length
  const rows: { dimension: string; daysWithData: number; hint: string }[] = [
    { dimension: 'Calories', daysWithData: count((d) => d.intakeKcal != null), hint: 'Needed for every energy-balance answer.' },
    { dimension: 'Macros', daysWithData: count((d) => d.proteinG != null), hint: 'Protein drives how much of a change is muscle.' },
    { dimension: 'Body weight', daysWithData: count((d) => d.weightKg != null), hint: 'Weigh in most mornings — the trend is the truth serum.' },
    { dimension: 'Workouts', daysWithData: count((d) => d.trained), hint: 'Per-set logs power progression and volume.' },
    { dimension: 'Sleep', daysWithData: count((d) => d.sleepH != null), hint: 'Short sleep quietly raises intake.' },
    { dimension: 'Mood', daysWithData: count((d) => d.mood != null), hint: 'Lets patterns link how you feel to what you did.' },
    { dimension: 'Stress', daysWithData: count((d) => d.stress != null), hint: 'Stress-eating shows up here first.' },
    { dimension: 'Day rating', daysWithData: count((d) => d.dayRating != null), hint: 'The single best summary metric of a day.' },
    { dimension: 'Habits', daysWithData: count((d) => d.habitsDone + d.habitsSkipped > 0), hint: 'Turns intentions into a consistency score.' },
    { dimension: 'Hydration', daysWithData: count((d) => d.hydrationL != null), hint: 'Explains a lot of day-to-day scale noise.' },
  ]
  return rows
    .map((r) => ({ ...r, pct: pct(r.daysWithData, n) }))
    .sort((a, b) => a.pct - b.pct)
}

// ---------------------------------------------------------------------------
// Diagnostics — the "why" engine
// ---------------------------------------------------------------------------

const kcal = (v: number): string => `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString()} kcal`
const kg = (v: number, dp = 2): string => `${v > 0 ? '+' : ''}${v.toFixed(dp)} kg`

/**
 * Turn the numbers into ranked, actionable findings. Every rule is guarded on
 * having enough data to say anything — a rule that can't clear its own bar stays
 * silent rather than guessing.
 */
function diagnose(
  days: DayPoint[],
  summary: PeriodSummary,
  energy: EnergyAnalysis,
  weight: WeightAnalysis,
  dayType: DayTypeAnalysis,
  weekday: WeekdayStat[],
  nutrition: NutritionAnalysis,
  training: TrainingAnalysis,
  recovery: RecoveryAnalysis,
  profile: AnalyticsProfile,
  gaps: GapAnalysis
): Finding[] {
  const f: Finding[] = []
  const push = (x: Finding) => f.push(x)
  const goal = profile.nutritionGoal // lose_weight | maintain | gain_muscle
  const wantsLoss = goal === 'lose_weight' || (profile.targetWeightKg != null && profile.weightKg != null && profile.targetWeightKg < profile.weightKg)

  // --- R1: the scale disagrees with the energy maths -----------------------
  if (
    weight.fittedChangeKg != null &&
    energy.predictedWeightChangeKg != null &&
    weight.observations >= 3 &&
    summary.daysWithFood >= 7
  ) {
    const actual = weight.fittedChangeKg
    const predicted = energy.predictedWeightChangeKg
    const diffKg = actual - predicted
    const diffPerDay = (diffKg * KCAL_PER_KG) / Math.max(1, summary.days)
    if (Math.abs(diffPerDay) >= 250) {
      const overGaining = diffPerDay > 0
      push({
        id: 'energy-model-mismatch',
        severity: overGaining ? 'critical' : 'insight',
        area: 'weight',
        title: overGaining
          ? 'The scale is moving up faster than your logged food explains'
          : 'You are losing faster than your logged food explains',
        detail: overGaining
          ? `Your logged intake predicts ${kg(predicted)} over these ${summary.days} days, but your weight trend actually moved ${kg(actual)}. That gap is about ${Math.abs(Math.round(diffPerDay)).toLocaleString()} kcal a day unaccounted for. Two causes explain almost every case: portions logged smaller than they were (oils, ghee, sauces, "one" roti, restaurant food), or a maintenance number that is too high for you. Trust the scale over the formula.`
          : `Your logged intake predicts ${kg(predicted)}, but your weight trend moved ${kg(actual)} — roughly ${Math.abs(Math.round(diffPerDay)).toLocaleString()} kcal a day more deficit than the numbers show. Either your true maintenance is higher than assumed, or some food is going unlogged in the other direction (under-eating on unlogged days).`,
        evidence: [
          { label: 'Predicted from food', value: kg(predicted) },
          { label: 'Actual weight trend', value: kg(actual) },
          { label: 'Unexplained', value: `${kcal(diffPerDay)}/day` },
        ],
        action: overGaining
          ? 'For one week, weigh and log everything including cooking oil, and weigh yourself every morning. Then recheck this number.'
          : 'Raise your daily target toward your true maintenance below so you are not accidentally deep in a deficit.',
      })
    }
  }

  // --- R2: assumed maintenance is wrong -----------------------------------
  if (weight.trueMaintenanceKcal != null && weight.assumedMaintenanceKcal != null && weight.maintenanceGapKcal != null) {
    const gap = weight.maintenanceGapKcal
    if (Math.abs(gap) >= 200) {
      push({
        id: 'true-maintenance',
        severity: 'warning',
        area: 'energy',
        title: `Your real maintenance looks like ~${weight.trueMaintenanceKcal.toLocaleString()} kcal, not ${weight.assumedMaintenanceKcal.toLocaleString()}`,
        detail: `Worked backwards from what you actually ate (${summary.avgIntakeKcal?.toLocaleString()} kcal/day average) and how your weight actually moved (${weight.rateKgPerWeek?.toFixed(2)} kg/week), your maintenance is about ${weight.trueMaintenanceKcal.toLocaleString()} kcal — ${gap > 0 ? 'higher' : 'lower'} than the ${weight.assumedMaintenanceKcal.toLocaleString()} kcal being used in your daily numbers. Every deficit and surplus you have seen is off by roughly ${Math.abs(gap)} kcal because of it.`,
        evidence: [
          { label: 'Avg intake', value: `${summary.avgIntakeKcal?.toLocaleString()} kcal` },
          { label: 'Weight trend', value: `${weight.rateKgPerWeek?.toFixed(2)} kg/wk` },
          { label: 'Implied maintenance', value: `${weight.trueMaintenanceKcal.toLocaleString()} kcal` },
          { label: 'Assumed', value: `${weight.assumedMaintenanceKcal.toLocaleString()} kcal` },
        ],
        action: wantsLoss
          ? `Set your daily target to about ${Math.round(weight.trueMaintenanceKcal * 0.85).toLocaleString()} kcal (a 15% deficit off your real maintenance) rather than off the formula.`
          : `Use ${weight.trueMaintenanceKcal.toLocaleString()} kcal as your maintenance line from here on.`,
      })
    }
  }

  // --- R3: rest-day eating (the classic) ----------------------------------
  // Needs ≥3 food-logged days on BOTH sides: comparing one recorded rest day
  // against thirty training days would state a pattern that isn't there.
  if (dayType.rest.daysWithFood >= 3 && dayType.trained.daysWithFood >= 3 && dayType.intakeDeltaKcal != null) {
    const delta = dayType.intakeDeltaKcal
    const restSurplus = dayType.rest.avgBalance
    if (delta > -150 && restSurplus != null && restSurplus > 0) {
      push({
        id: 'rest-day-eating',
        severity: 'critical',
        area: 'energy',
        title: 'You eat like a training day on days you do not train',
        detail: `On your ${dayType.trained.daysWithFood} logged training days you averaged ${dayType.trained.avgIntake?.toLocaleString()} kcal. On your ${dayType.rest.daysWithFood} logged rest days you averaged ${dayType.rest.avgIntake?.toLocaleString()} kcal — ${delta >= 0 ? `${delta} kcal MORE` : `only ${Math.abs(delta)} kcal less`}, while burning nothing extra. That is where the weight is coming from: your rest days ran an average ${kcal(restSurplus)} surplus and put ${dayType.restSurplusKg ? kg(dayType.restSurplusKg) : 'weight'} on the scale over this period all by themselves.`,
        evidence: [
          { label: 'Training-day intake', value: `${dayType.trained.avgIntake?.toLocaleString()} kcal` },
          { label: 'Rest-day intake', value: `${dayType.rest.avgIntake?.toLocaleString()} kcal` },
          { label: 'Rest-day balance', value: `${kcal(restSurplus)}/day` },
          { label: 'Rest-day surplus total', value: kcal(dayType.rest.surplusKcal) },
        ],
        action: `Drop rest-day intake by ${Math.min(600, Math.max(200, Math.round(restSurplus / 50) * 50))} kcal — cut the carb portion at two meals and keep protein the same. Or train one more day a week.`,
      })
    } else if (delta < -150 && restSurplus != null && restSurplus <= 0) {
      push({
        id: 'rest-day-good',
        severity: 'good',
        area: 'energy',
        title: 'Your rest-day eating is disciplined',
        detail: `You eat ${Math.abs(delta)} kcal less on rest days than training days, and rest days average ${kcal(restSurplus)} — so they are not undoing your training days. This is the habit most people get wrong.`,
        evidence: [
          { label: 'Training-day intake', value: `${dayType.trained.avgIntake?.toLocaleString()} kcal` },
          { label: 'Rest-day intake', value: `${dayType.rest.avgIntake?.toLocaleString()} kcal` },
        ],
        action: 'Keep it. This is the pattern to protect when life gets busy.',
      })
    }
  }

  // --- R4: rest days with no food logged at all ---------------------------
  if (dayType.unloggedRestDays.length >= 2 && dayType.rest.days >= 3) {
    const share = pct(dayType.unloggedRestDays.length, dayType.rest.days)
    if (share >= 30) {
      push({
        id: 'unlogged-rest-days',
        severity: 'serious',
        area: 'data',
        title: `${dayType.unloggedRestDays.length} of your ${dayType.rest.days} rest days have no food logged`,
        detail: `You log reliably on days you train — those feel like "on" days. But ${share}% of your rest days have no calories at all, and rest days are exactly where a surplus hides: no training, relaxed eating, nothing recorded. Any calorie average you see here is biased toward your good days.`,
        evidence: [
          { label: 'Unlogged rest days', value: `${dayType.unloggedRestDays.length}` },
          { label: 'Share of rest days', value: `${share}%` },
          { label: 'Most recent', value: dayType.unloggedRestDays.slice(-3).map((d) => d.label).join(', ') },
        ],
        action: 'On any day you do not train, still log your food — even a rough one-line estimate. A rest day without calories is the single biggest blind spot in your data.',
      })
    }
  }

  // --- R5: training frequency vs intake -----------------------------------
  // Gated on ≥60% logging coverage: with a patchy log, "you train 2×/week" is a
  // statement about the log, not about the training.
  const coverageOk = gaps.loggingRate >= 60
  if (summary.trainingPerWeek != null && summary.days >= 14 && coverageOk) {
    const perWeek = summary.trainingPerWeek
    if (perWeek < 3 && (summary.avgBalanceKcal ?? 0) > 100) {
      push({
        id: 'low-frequency-surplus',
        severity: 'serious',
        area: 'training',
        title: `Training ${perWeek.toFixed(1)}×/week while running a surplus`,
        detail: `You trained on ${summary.daysTrained} of ${summary.days} days (${perWeek.toFixed(1)} per week) and averaged ${kcal(summary.avgBalanceKcal as number)} a day over maintenance. At that frequency there is not enough stimulus to send the extra calories toward muscle, so they go to fat. Your longest gap without training was ${training.longestGapDays} days.`,
        evidence: [
          { label: 'Sessions/week', value: perWeek.toFixed(1) },
          { label: 'Avg daily balance', value: kcal(summary.avgBalanceKcal as number) },
          { label: 'Longest gap', value: `${training.longestGapDays} days` },
        ],
        action: 'Get to 3–4 resistance sessions a week before adding calories. Same food, more training days, and the same surplus starts building instead of storing.',
      })
    } else if (perWeek >= 4) {
      push({
        id: 'good-frequency',
        severity: 'good',
        area: 'training',
        title: `Solid training frequency — ${perWeek.toFixed(1)} sessions a week`,
        detail: `${summary.daysTrained} sessions across ${summary.days} days, ${Math.round(summary.totalVolumeKg).toLocaleString()} kg of total tonnage moved. This is the frequency where a surplus can actually turn into muscle and a deficit spares it.`,
        evidence: [
          { label: 'Sessions', value: `${summary.daysTrained}` },
          { label: 'Sessions/week', value: perWeek.toFixed(1) },
          { label: 'Total tonnage', value: `${Math.round(summary.totalVolumeKg).toLocaleString()} kg` },
        ],
        action: 'Keep the frequency and let load progression do the rest.',
      })
    }
  }

  // --- R6: the worst weekday ---------------------------------------------
  // ≥2 food-logged instances of that weekday, and ≥4 weekdays comparable, before
  // calling one of them out — otherwise a single big Saturday becomes a "pattern".
  const eligible = weekday.filter((w) => w.daysWithFood >= 2 && w.avgBalance != null)
  if (eligible.length >= 4) {
    const worst = [...eligible].sort((a, b) => (b.avgBalance as number) - (a.avgBalance as number))[0]
    if ((worst.avgBalance as number) > 250) {
      push({
        id: 'worst-weekday',
        severity: 'warning',
        area: 'energy',
        title: `${worst.name}s are your most expensive day`,
        detail: `Across the ${worst.daysWithFood} ${worst.name}${worst.daysWithFood === 1 ? '' : 's'} you logged food, you averaged ${worst.avgIntake?.toLocaleString()} kcal — a ${kcal(worst.avgBalance as number)} balance — and you trained on only ${worst.trainedPct}% of the ${worst.days} ${worst.name}s in this range. One day a week like this adds about ${kg(((worst.avgBalance as number) * 52) / KCAL_PER_KG, 1)} a year on its own.`,
        evidence: [
          { label: 'Logged instances', value: `${worst.daysWithFood} of ${worst.days}` },
          { label: 'Avg intake', value: `${worst.avgIntake?.toLocaleString()} kcal` },
          { label: 'Avg balance', value: kcal(worst.avgBalance as number) },
          { label: 'Trained', value: `${worst.trainedPct}% of them` },
        ],
        action: `Plan ${worst.name} in advance: put your training session there, or decide the day's meals before it starts.`,
      })
    }
  }

  // --- R7: protein ---------------------------------------------------------
  if (summary.proteinPerKg != null && summary.daysWithFood >= 7) {
    const perKg = summary.proteinPerKg
    if (perKg < 1.4) {
      push({
        id: 'low-protein',
        severity: (summary.weightRateKgPerWeek ?? 0) < -0.1 ? 'serious' : 'warning',
        area: 'nutrition',
        title: `Protein is low at ${perKg.toFixed(1)} g/kg`,
        detail: `You averaged ${summary.avgProteinG} g of protein a day — ${perKg.toFixed(1)} g per kg of bodyweight. ${(summary.weightRateKgPerWeek ?? 0) < -0.1 ? 'You are losing weight at this protein level, which means part of what you are losing is muscle, not fat.' : 'Below about 1.6 g/kg, training gains and appetite control both suffer.'}`,
        evidence: [
          { label: 'Avg protein', value: `${summary.avgProteinG} g` },
          { label: 'Per kg', value: `${perKg.toFixed(1)} g/kg` },
          { label: 'Target', value: `${profile.proteinTargetG ?? '—'} g` },
        ],
        action: `Add roughly ${Math.max(20, Math.round(((1.6 - perKg) * (profile.weightKg ?? 80)) / 5) * 5)} g of protein a day — one more whey scoop plus a bigger protein portion at dinner covers it.`,
      })
    } else if (perKg >= 1.8) {
      push({
        id: 'good-protein',
        severity: 'good',
        area: 'nutrition',
        title: `Protein is dialled in at ${perKg.toFixed(1)} g/kg`,
        detail: `${summary.avgProteinG} g a day. At this level, weight you lose is far more likely to be fat and weight you gain is far more likely to be muscle.`,
        evidence: [
          { label: 'Avg protein', value: `${summary.avgProteinG} g` },
          { label: 'Per kg', value: `${perKg.toFixed(1)} g/kg` },
        ],
        action: 'No change needed.',
      })
    }
  }

  // --- R8: water-weight misread ------------------------------------------
  if (weight.waterWeightNote) {
    push({
      id: 'water-weight',
      severity: 'insight',
      area: 'weight',
      title: 'One of your weigh-ins was water, not fat',
      detail: weight.waterWeightNote,
      evidence: [
        { label: 'Weight observations', value: `${weight.observations}` },
        { label: 'Trend rate', value: weight.rateKgPerWeek != null ? `${weight.rateKgPerWeek.toFixed(2)} kg/wk` : '—' },
      ],
      action: 'Weigh in every morning, same conditions, and judge only the 7-day trend line. Single readings swing ±1.5 kg on salt, carbs and sleep alone.',
    })
  }

  // --- R9: composition of the change --------------------------------------
  if (weight.composition && Math.abs(weight.composition.changeKg) >= 0.5) {
    const c = weight.composition
    const gaining = c.changeKg > 0
    push({
      id: 'composition',
      severity: gaining && c.leanShare < 30 ? 'warning' : 'insight',
      area: 'weight',
      title: gaining
        ? `Of the ${kg(c.changeKg)} gained, roughly ${kg(c.fatKg)} looks like fat`
        : `Of the ${kg(c.changeKg)} lost, roughly ${kg(Math.abs(c.fatKg), 2)} looks like fat`,
      detail: `${c.reasoning} Best estimate: ${c.leanShare}% lean tissue / ${100 - c.leanShare}% fat. This is inferred from your rate of change, training frequency and protein intake — not measured. A DEXA or a body-fat caliper is the only way to know.`,
      evidence: [
        { label: 'Change', value: kg(c.changeKg) },
        { label: 'Est. lean', value: kg(c.leanKg) },
        { label: 'Est. fat', value: kg(c.fatKg) },
        { label: 'Confidence', value: c.confidence },
      ],
      action: gaining && c.leanShare < 30
        ? 'Slow the rate down to under 0.3 kg/week and push protein to 1.8 g/kg — that shifts the split toward muscle.'
        : 'Keep protein high and training frequent to hold this split.',
    })
  }

  // --- R10: stalled lifts -------------------------------------------------
  if (training.stalled.length >= 2) {
    push({
      id: 'stalled-lifts',
      severity: 'warning',
      area: 'training',
      title: `${training.stalled.length} lifts have stopped moving`,
      detail: `${training.stalled.slice(0, 4).map((e) => e.name).join(', ')} have shown no meaningful change in estimated 1RM across ${Math.min(...training.stalled.map((e) => e.sessions))}+ sessions each. ${(summary.avgBalanceKcal ?? 0) < -300 ? 'You are also in a real deficit, which caps strength gains — a stall here is expected, not a programming failure.' : 'Progressive overload has flattened: the load is not being pushed.'}`,
      evidence: training.stalled.slice(0, 4).map((e) => ({
        label: e.name,
        value: `${e.sessions} sessions · ${e.progressPct != null ? `${e.progressPct > 0 ? '+' : ''}${e.progressPct}%` : 'flat'}`,
      })),
      action: 'Add 2.5 kg or one rep to the top set of each of these next session, and log every set so the change is visible here.',
    })
  }

  // --- R11: muscle imbalance ---------------------------------------------
  if (training.pushPullRatio != null && training.muscles.length >= 3) {
    const r = training.pushPullRatio
    if (r > 1.4 || r < 0.7) {
      push({
        id: 'push-pull-imbalance',
        severity: 'warning',
        area: 'training',
        title: r > 1.4 ? 'Push work outweighs pull work' : 'Pull work outweighs push work',
        detail: `Your push-to-pull set ratio is ${r.toFixed(2)} (balanced is about 1.0). ${r > 1.4 ? 'Chest and shoulder pressing well ahead of rowing and pulling is the standard route to rounded shoulders and shoulder impingement.' : 'Plenty of pulling but little pressing — the mirror muscles will lag and pressing strength will stall.'}`,
        evidence: [
          { label: 'Push:pull ratio', value: r.toFixed(2) },
          ...training.muscles.slice(0, 4).map((m) => ({ label: m.group, value: `${m.setsPerWeek}/wk` })),
        ],
        action: r > 1.4 ? 'Add 3–4 sets of rows or face pulls per week until the ratio is near 1.0.' : 'Add a pressing movement to your weakest session.',
      })
    }
  }

  // --- R12: neglected muscle group ---------------------------------------
  if (training.muscles.length >= 3 && summary.days >= 21) {
    const groups = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs']
    const present = new Map(training.muscles.map((m) => [m.group, m.setsPerWeek]))
    const neglected = groups.filter((g) => (present.get(g) ?? 0) < 4)
    if (neglected.length > 0 && neglected.length < groups.length) {
      push({
        id: 'neglected-muscles',
        severity: 'warning',
        area: 'training',
        title: `${neglected.join(' and ')} ${neglected.length > 1 ? 'are' : 'is'} barely trained`,
        detail: `Across this period you averaged ${neglected.map((g) => `${present.get(g) ?? 0} sets/week for ${g.toLowerCase()}`).join(', ')}. Roughly 10 hard sets per muscle per week is the working minimum for growth; under 4 is maintenance at best.`,
        evidence: training.muscles.slice(0, 6).map((m) => ({ label: m.group, value: `${m.setsPerWeek} sets/wk` })),
        action: `Add a dedicated ${neglected[0].toLowerCase()} block — 6–9 sets across two sessions a week.`,
      })
    }
  }

  // --- R13: sleep → intake ------------------------------------------------
  if (recovery.sleepVsIntake) {
    const s = recovery.sleepVsIntake
    if (s.shortSleepAvgIntake != null && s.normalSleepAvgIntake != null) {
      const delta = s.shortSleepAvgIntake - s.normalSleepAvgIntake
      if (delta > 150) {
        push({
          id: 'sleep-intake',
          severity: 'warning',
          area: 'recovery',
          title: `Short sleep costs you ${Math.round(delta)} extra calories a day`,
          detail: `On the ${s.shortSleepDays} days you slept under 7 hours you ate ${s.shortSleepAvgIntake.toLocaleString()} kcal; on longer-sleep days, ${s.normalSleepAvgIntake.toLocaleString()} kcal. Short sleep raises ghrelin and lowers leptin — the extra eating is hormonal, not weak willpower.`,
          evidence: [
            { label: 'Short-sleep intake', value: `${s.shortSleepAvgIntake.toLocaleString()} kcal` },
            { label: 'Normal-sleep intake', value: `${s.normalSleepAvgIntake.toLocaleString()} kcal` },
            { label: 'Short-sleep days', value: `${s.shortSleepDays}` },
          ],
          action: 'Protecting 7+ hours is worth more than any food swap here — it removes the extra intake at the source.',
        })
      }
    }
  }

  // --- R14: repeat-offender foods ----------------------------------------
  if (nutrition.surplusOffenders.length >= 1) {
    const top = nutrition.surplusOffenders.slice(0, 3)
    push({
      id: 'surplus-foods',
      severity: 'insight',
      area: 'nutrition',
      title: `${top[0].item} shows up on your surplus days`,
      detail: `These foods appear disproportionately on days you ended above maintenance: ${top.map((t) => `${t.item} (${t.surplusDays} surplus days vs ${t.deficitDays} deficit days, ${t.avgKcal} kcal a serving)`).join('; ')}. They are not "bad" foods — they are the ones that reliably tip your day over.`,
      evidence: top.map((t) => ({ label: t.item, value: `${t.totalKcal.toLocaleString()} kcal total · ${t.kcalShare}% of intake` })),
      action: `Halve the portion of ${top[0].item} rather than cutting it, and re-check whether those days still end in surplus.`,
    })
  }

  // --- R15: biggest calorie source ---------------------------------------
  if (nutrition.topFoodsByKcal.length >= 1 && nutrition.topFoodsByKcal[0].kcalShare >= 12) {
    const top = nutrition.topFoodsByKcal[0]
    push({
      id: 'dominant-food',
      severity: 'insight',
      area: 'nutrition',
      title: `${top.item} is ${top.kcalShare}% of everything you eat`,
      detail: `${top.totalKcal.toLocaleString()} kcal across ${top.days} days, at ${top.avgKcal} kcal a serving. One item carrying this much of your intake means one portion change moves your whole week.`,
      evidence: nutrition.topFoodsByKcal.slice(0, 4).map((t) => ({ label: t.item, value: `${t.kcalShare}% · ${t.totalKcal.toLocaleString()} kcal` })),
      action: `Measure ${top.item} on a scale once. Estimated portions of your biggest calorie source are where most logging error lives.`,
    })
  }

  // --- R16: fiber ---------------------------------------------------------
  if (summary.avgFiberG != null && summary.daysWithFood >= 7 && summary.avgFiberG < 25) {
    push({
      id: 'low-fiber',
      severity: 'warning',
      area: 'nutrition',
      title: `Fiber is ${summary.avgFiberG} g a day, under the 30 g mark`,
      detail: `Fiber is the cheapest appetite control there is — it fills you at almost no calorie cost, and it is the main lever on the digestion notes in your logs.`,
      evidence: [
        { label: 'Avg fiber', value: `${summary.avgFiberG} g` },
        { label: 'Target', value: '30 g' },
      ],
      action: 'Add a bowl of dal, a big salad, or a fruit with skin. About 10 g of fiber costs under 100 kcal.',
    })
  }

  // --- R17: logging consistency ------------------------------------------
  if (gaps.loggingRate < 70 && summary.days >= 14) {
    push({
      id: 'logging-gaps',
      severity: gaps.loggingRate < 45 ? 'serious' : 'warning',
      area: 'data',
      title: `You logged ${gaps.loggingRate}% of days in this range`,
      detail: `${gaps.daysMissed} of ${summary.days} days have no entry${gaps.gaps.length ? `, including ${gaps.gaps[0].days === 8 || gaps.gaps[0].days === 11 || gaps.gaps[0].days === 18 ? 'an' : 'a'} ${gaps.gaps[0].days}-day gap from ${shortLabel(gaps.gaps[0].start)}` : ''}. Missing days are not neutral — they are systematically the days that went badly, so every average on this page is flattered.`,
      evidence: [
        { label: 'Logged', value: `${gaps.daysLogged}/${summary.days}` },
        { label: 'Longest gap', value: gaps.gaps.length ? `${gaps.gaps[0].days} days` : '—' },
        { label: 'Current streak', value: `${gaps.currentStreak} day${gaps.currentStreak === 1 ? '' : 's'}` },
      ],
      action: 'A one-line entry beats a missing day. Log the day even when it went badly — those are the days with the answers in them.',
    })
  }

  // --- R18: weight not logged often enough -------------------------------
  if (weight.observations < Math.max(4, Math.floor(summary.days / 10)) && summary.days >= 14) {
    push({
      id: 'weigh-in-frequency',
      severity: 'serious',
      area: 'data',
      title: `Only ${weight.observations} weigh-in${weight.observations === 1 ? '' : 's'} in ${summary.days} days`,
      detail: `Body weight is the one measurement that settles every argument between what you think you ate and what your body did. With ${weight.observations} reading${weight.observations === 1 ? '' : 's'} the trend line is thin — one unusual weigh-in still swings it${weight.observations < 3 ? ', and the real-maintenance estimate cannot be computed at all' : ''}.`,
      evidence: [
        { label: 'Weigh-ins', value: `${weight.observations}` },
        { label: 'Days in range', value: `${summary.days}` },
      ],
      action: 'Weigh yourself every morning after the toilet, before food, and mention it in your daily paste. Two weeks of this unlocks the real maintenance number.',
    })
  }

  // --- R19: on track ------------------------------------------------------
  if (
    wantsLoss &&
    weight.rateKgPerWeek != null &&
    weight.rateKgPerWeek < -0.1 &&
    profile.weightKg &&
    Math.abs(weight.rateKgPerWeek) <= profile.weightKg * 0.01
  ) {
    push({
      id: 'on-track',
      severity: 'good',
      area: 'weight',
      title: `On track — losing ${Math.abs(weight.rateKgPerWeek).toFixed(2)} kg a week`,
      detail: `That is a controlled rate: fast enough to see progress, slow enough to keep muscle.${weight.weeksToTarget != null ? ` At this pace you reach ${weight.targetKg} kg in about ${weight.weeksToTarget} weeks.` : ''}`,
      evidence: [
        { label: 'Rate', value: `${weight.rateKgPerWeek.toFixed(2)} kg/wk` },
        ...(weight.weeksToTarget != null ? [{ label: 'ETA to target', value: `${weight.weeksToTarget} weeks` }] : []),
      ],
      action: 'Change nothing. Re-check in two weeks.',
    })
  }

  // --- R20: training but not eating enough to build -----------------------
  if (
    goal === 'gain_muscle' &&
    (summary.trainingPerWeek ?? 0) >= 3 &&
    summary.avgBalanceKcal != null &&
    summary.avgBalanceKcal < -100
  ) {
    push({
      id: 'building-in-deficit',
      severity: 'warning',
      area: 'energy',
      title: 'You are training to build but eating to lose',
      detail: `${summary.trainingPerWeek?.toFixed(1)} sessions a week on an average ${kcal(summary.avgBalanceKcal)} daily balance. Muscle needs material; a consistent deficit means your sessions maintain rather than build.`,
      evidence: [
        { label: 'Sessions/week', value: `${summary.trainingPerWeek?.toFixed(1)}` },
        { label: 'Avg balance', value: `${kcal(summary.avgBalanceKcal)}/day` },
      ],
      action: `Eat to about ${((weight.trueMaintenanceKcal ?? summary.avgMaintenanceKcal ?? 0) + 200).toLocaleString()} kcal — a small surplus is enough, more just adds fat.`,
    })
  }

  const ORDER: Record<Finding['severity'], number> = { critical: 0, serious: 1, warning: 2, insight: 3, good: 4 }
  return f.sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

interface RawProfile {
  current_weight_kg?: number | null
  target_weight_kg?: number | null
  height_cm?: number | null
  gender?: string | null
  age?: number | null
  dob?: string | null
  activity_level?: string | null
  nutrition_goal?: string | null
  fitness_goal?: string | null
}

export function buildProfile(raw: RawProfile | null, latestWeightKg: number | null): AnalyticsProfile {
  const missing: string[] = []
  // A weight logged in an entry is fresher than the profile field.
  const weightKg = latestWeightKg ?? raw?.current_weight_kg ?? null
  const heightCm = raw?.height_cm ?? null
  const gender = raw?.gender ?? null
  const age =
    raw?.dob && /^\d{4}/.test(raw.dob)
      ? new Date().getUTCFullYear() - Number.parseInt(raw.dob.slice(0, 4), 10)
      : raw?.age ?? null

  if (!weightKg) missing.push('weight')
  if (!heightCm) missing.push('height')
  if (!gender) missing.push('sex')
  if (!age) missing.push('age')

  const activityLevel = (raw?.activity_level || 'moderate') as ActivityLevel
  const goal = (raw?.nutrition_goal || 'maintain') as 'lose_weight' | 'maintain' | 'gain_muscle'

  const bmr = weightKg && heightCm && age && gender ? calculateBMR(weightKg, heightCm, age, gender as Gender) : null
  const tdee = bmr ? calculateTDEE(bmr, activityLevel) : null

  return {
    weightKg,
    targetWeightKg: raw?.target_weight_kg ?? null,
    heightCm,
    gender,
    age,
    activityLevel: raw?.activity_level ?? null,
    nutritionGoal: raw?.nutrition_goal ?? null,
    fitnessGoal: raw?.fitness_goal ?? null,
    bmr,
    tdee,
    proteinTargetG: weightKg ? calculateDailyProtein(weightKg, goal) : null,
    calorieTargetKcal: tdee ? calculateDailyCalories(tdee, goal) : null,
    bmi: weightKg && heightCm ? calculateBMI(weightKg, heightCm) : null,
    bmiCategory: weightKg && heightCm ? getBMICategory(calculateBMI(weightKg, heightCm)) : null,
    idealWeightRange: heightCm ? getIdealWeightRange(heightCm) : null,
    missing,
  }
}

// ---------------------------------------------------------------------------
// Range resolution
// ---------------------------------------------------------------------------

export function resolveRange(
  key: RangeKey,
  allDates: string[],
  custom?: { start?: string; end?: string }
): { start: string; end: string; days: number } {
  const today = isoDate(new Date())
  const firstEver = allDates.length ? allDates[0] : today

  if (key === 'custom' && custom?.start && custom?.end) {
    const start = custom.start <= custom.end ? custom.start : custom.end
    const end = custom.start <= custom.end ? custom.end : custom.start
    return { start, end, days: daysBetween(start, end) + 1 }
  }
  if (key === 'all') {
    const lastEver = allDates.length ? allDates[allDates.length - 1] : today
    const end = lastEver > today ? lastEver : today
    return { start: firstEver, end, days: daysBetween(firstEver, end) + 1 }
  }
  const span = ({ '7d': 7, '14d': 14, '30d': 30, '60d': 60, '90d': 90, '180d': 180, '365d': 365 } as Record<string, number>)[key] ?? 30
  // Anchor on the most recent logged day when it is in the future relative to
  // "today" (back-dated logging) so a range never comes back empty.
  const lastEver = allDates.length ? allDates[allDates.length - 1] : today
  const end = lastEver > today ? lastEver : today
  return { start: addDays(end, -(span - 1)), end, days: span }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function computeAnalytics(
  entries: RawEntry[],
  rawProfile: RawProfile | null,
  rangeKey: RangeKey,
  rangeLabel: string,
  custom?: { start?: string; end?: string }
): AnalyticsPayload {
  const allLoggedDates = Array.from(
    new Set(entries.map((e) => effectiveDate(e.extracted_json, e.created_at)))
  ).sort()

  const { start, end, days: rangeDays } = resolveRange(rangeKey, allLoggedDates, custom)

  // Freshest logged weight anywhere (not just in range) — the best "current weight".
  const latestWeight = (() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const w = entries[i].extracted_json?.body?.weight_today_kg
      if (w != null) return w
    }
    return null
  })()

  const profile = buildProfile(rawProfile, latestWeight)
  const days = buildDays(entries, start, end, profile.tdee)
  const summary = summarise(days, profile.weightKg)

  // Same-length window immediately before the range, for period-over-period deltas.
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(days.length - 1))
  const prevDays = buildDays(entries, prevStart, prevEnd, profile.tdee)
  const previous = prevDays.some((d) => d.logged) ? summarise(prevDays, profile.weightKg) : null

  const energy = analyseEnergy(days)
  const weight = analyseWeight(days, summary, energy, profile)
  const dayType = analyseDayType(days)
  const weekday = analyseWeekday(days)
  const weekly = analyseWeekly(days)
  const monthly = analyseMonthly(days)
  const nutrition = analyseNutrition(entries, days, summary, profile)
  const training = analyseTraining(entries, days, weekly)
  const recovery = analyseRecovery(entries, days)
  const correlations = analyseCorrelations(days)
  const gaps = analyseGaps(days, allLoggedDates)
  const coverage = analyseCoverage(days)
  const findings = diagnose(
    days,
    summary,
    energy,
    weight,
    dayType,
    weekday,
    nutrition,
    training,
    recovery,
    profile,
    gaps
  )

  const inRangeLogged = days.filter((d) => d.logged)

  return {
    range: { key: rangeKey, start, end, days: rangeDays, label: rangeLabel },
    profile,
    days,
    summary,
    previous,
    energy,
    weight,
    dayType,
    weekday,
    weekly,
    monthly,
    nutrition,
    training,
    recovery,
    correlations,
    gaps,
    coverage,
    findings,
    meta: {
      entryCount: entries.length,
      firstLoggedDate: inRangeLogged[0]?.date ?? null,
      lastLoggedDate: inRangeLogged[inRangeLogged.length - 1]?.date ?? null,
      allTimeFirstDate: allLoggedDates[0] ?? null,
      allTimeDaysLogged: allLoggedDates.length,
      generatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Analytics types — the contract between the compute engine
 * ([lib/analytics/engine.ts]), the server action ([app/analytics-actions.ts])
 * and the /analytics views.
 *
 * Everything here is plain serialisable data so the whole payload can cross the
 * server-action boundary and be handed straight to Recharts.
 */

export type RangeKey = '7d' | '14d' | '30d' | '60d' | '90d' | '180d' | '365d' | 'all' | 'custom'

export const RANGE_LABELS: Record<RangeKey, string> = {
  '7d': '7 days',
  '14d': '2 weeks',
  '30d': '1 month',
  '60d': '2 months',
  '90d': '3 months',
  '180d': '6 months',
  '365d': '1 year',
  all: 'All time',
  custom: 'Custom',
}

/** Days each preset spans. `all`/`custom` are resolved from the data / user input. */
export const RANGE_DAYS: Record<Exclude<RangeKey, 'all' | 'custom'>, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '180d': 180,
  '365d': 365,
}

// ---------------------------------------------------------------------------
// The day series — one row per calendar day in range, logged or not.
// `null` means "not recorded", which is different from 0 and is never charted
// as a zero: charts connect across nulls instead of dipping to the floor.
// ---------------------------------------------------------------------------

export interface DayPoint {
  date: string // YYYY-MM-DD
  label: string // "Aug 6"
  weekday: number // 0 = Sunday
  logged: boolean
  entries: number

  // Energy
  intakeKcal: number | null
  /** Assumed maintenance: the day's logged TDEE, else computed from the profile. */
  maintenanceKcal: number | null
  /** Training burn as logged. Informational — an activity-adjusted TDEE already contains it. */
  burnKcal: number | null
  /** intake − maintenance. Recomputed here, never taken from the paste (which is inconsistent). */
  balanceKcal: number | null
  /** What the source claimed the balance was — kept so the Data tab can show the drift. */
  loggedBalanceKcal: number | null

  // Macros
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null

  // Body
  weightKg: number | null
  /** 7-day centred moving average of weight, interpolated across gaps. */
  weightTrendKg: number | null
  sleepH: number | null
  sleepQuality: number | null
  hydrationL: number | null

  // Mind
  mood: number | null
  stress: number | null
  anxiety: number | null
  focus: number | null
  motivation: number | null
  dayRating: number | null

  // Training
  trained: boolean
  workoutCount: number
  workoutMin: number | null
  cardioMin: number | null
  cardioKm: number | null
  sets: number
  reps: number
  /** Tonnage: Σ (weight × reps) across every logged set. */
  volumeKg: number
  exercises: string[]

  // Misc
  symptomCount: number
  symptomPeak: number | null
  habitsDone: number
  habitsSkipped: number
  screenMin: number | null
  deepWorkMin: number | null
  mealCount: number
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export interface PeriodSummary {
  days: number
  daysLogged: number
  daysWithFood: number
  daysTrained: number
  /** Sessions per calendar week across the whole range. */
  trainingPerWeek: number | null
  /**
   * Sessions per week counting only days that have an entry. When the log is
   * patchy the two numbers diverge sharply, and quoting the first one alone
   * would read as "you barely train" when it may mean "you barely logged".
   */
  trainingPerWeekLogged: number | null
  avgIntakeKcal: number | null
  avgMaintenanceKcal: number | null
  avgBalanceKcal: number | null
  totalBalanceKcal: number | null
  avgBurnKcal: number | null
  avgProteinG: number | null
  proteinPerKg: number | null
  avgCarbsG: number | null
  avgFatG: number | null
  avgFiberG: number | null
  avgSleepH: number | null
  avgMood: number | null
  avgStress: number | null
  avgDayRating: number | null
  totalVolumeKg: number
  totalSets: number
  weightStartKg: number | null
  weightEndKg: number | null
  weightChangeKg: number | null
  weightRateKgPerWeek: number | null
}

// ---------------------------------------------------------------------------
// Energy analysis
// ---------------------------------------------------------------------------

export interface EnergyPointRow {
  date: string
  label: string
  intake: number | null
  maintenance: number | null
  burn: number | null
  balance: number | null
  cumulative: number | null
  trained: boolean
}

export interface EnergyAnalysis {
  series: EnergyPointRow[]
  /** Σ balance over the range, kcal. Positive = surplus. */
  cumulativeKcal: number | null
  /** cumulativeKcal / 7700 — what the energy maths alone predicts for weight change. */
  predictedWeightChangeKg: number | null
  surplusDays: number
  deficitDays: number
  /** Σ of positive balances only — where the weight actually comes from. */
  surplusTotalKcal: number
  deficitTotalKcal: number
  /** Biggest single-day surpluses, worst first. */
  worstDays: { date: string; label: string; balance: number; intake: number | null; trained: boolean }[]
  bestDays: { date: string; label: string; balance: number; intake: number | null; trained: boolean }[]
}

// ---------------------------------------------------------------------------
// Weight analysis — the "why is the scale going the wrong way" engine
// ---------------------------------------------------------------------------

export interface WeightAnalysis {
  /** Every logged weight, plus the smoothed trend and the energy-predicted line. */
  series: {
    date: string
    label: string
    weight: number | null
    trend: number | null
    /** Weight projected from the first observation using cumulative energy balance. */
    predicted: number | null
  }[]
  observations: number
  firstKg: number | null
  lastKg: number | null
  /** Least-squares slope over logged weights, kg/week. Needs ≥ 3 observations. */
  rateKgPerWeek: number | null
  /** Regression-fitted change across the range (less noisy than last − first). */
  fittedChangeKg: number | null
  targetKg: number | null
  /** Weeks to target at the current rate, when the rate points the right way. */
  weeksToTarget: number | null
  /**
   * Maintenance calories implied by the user's own intake + weight trend:
   *   trueMaintenance = avgIntake − rateKgPerDay × 7700
   * Independent of any BMR formula, so it's the number to trust once there are
   * enough weight observations.
   */
  trueMaintenanceKcal: number | null
  assumedMaintenanceKcal: number | null
  /** trueMaintenance − assumedMaintenance. Negative = the formula overestimates you. */
  maintenanceGapKcal: number | null
  /** Split of the observed change into lean vs fat mass. An ESTIMATE — see engine docs. */
  composition: {
    changeKg: number
    leanKg: number
    fatKg: number
    leanShare: number
    confidence: 'low' | 'medium'
    reasoning: string
  } | null
  /** Set when the weight move is too fast to be fat/muscle — i.e. water, food or glycogen. */
  waterWeightNote: string | null
  bmi: number | null
  bmiCategory: string | null
}

// ---------------------------------------------------------------------------
// Trained vs rest days — the user's own hypothesis, measured
// ---------------------------------------------------------------------------

export interface DayTypeStat {
  type: 'trained' | 'rest'
  days: number
  /**
   * Days of this type that actually have food logged. Every average below is
   * over THESE days, not all of them — a rest day with no entry would otherwise
   * drag the comparison toward whichever handful of days happened to be logged.
   */
  daysWithFood: number
  avgIntake: number | null
  avgMaintenance: number | null
  avgBalance: number | null
  avgProtein: number | null
  surplusDays: number
  /** Σ of positive balances on this day type, kcal. */
  surplusKcal: number
}

export interface DayTypeAnalysis {
  trained: DayTypeStat
  rest: DayTypeStat
  /** restAvgIntake − trainedAvgIntake. Near zero = "eating like a training day on rest days". */
  intakeDeltaKcal: number | null
  /** Rest-day surplus expressed as kg of bodyweight over the range. */
  restSurplusKg: number | null
  /** Rest days where food was never logged — the blind spot in the data. */
  unloggedRestDays: { date: string; label: string }[]
}

export interface WeekdayStat {
  weekday: number
  name: string
  days: number
  /** Days of this weekday with food logged — the n behind avgIntake/avgBalance. */
  daysWithFood: number
  daysTrained: number
  trainedPct: number
  avgIntake: number | null
  avgBalance: number | null
  avgVolumeKg: number | null
}

export interface WeeklyPoint {
  weekStart: string
  label: string
  daysLogged: number
  daysTrained: number
  avgIntake: number | null
  avgBalance: number | null
  totalBalance: number | null
  avgProtein: number | null
  volumeKg: number
  sets: number
  avgWeightKg: number | null
  avgSleepH: number | null
}

export interface MonthlyPoint {
  month: string // YYYY-MM
  label: string
  daysLogged: number
  daysTrained: number
  avgIntake: number | null
  avgBalance: number | null
  totalBalance: number | null
  avgWeightKg: number | null
  weightChangeKg: number | null
  volumeKg: number
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export interface FoodStat {
  item: string
  days: number
  servings: number
  totalKcal: number
  avgKcal: number
  proteinG: number
  /** Share of the period's total intake this one food accounts for, %. */
  kcalShare: number
  /**
   * How much more often this food shows up on surplus days than deficit days.
   * > 1.5 with ≥ 3 appearances = a genuine repeat offender.
   */
  surplusLift: number | null
  surplusDays: number
  deficitDays: number
}

export interface NutritionAnalysis {
  macroSplit: { protein: number; carbs: number; fat: number } | null // % of kcal
  macroSeries: { date: string; label: string; protein: number | null; carbs: number | null; fat: number | null }[]
  proteinSeries: { date: string; label: string; perKg: number | null }[]
  proteinTargetPerKg: number
  intakeHistogram: { bucket: string; days: number; over: boolean }[]
  mealTypes: { mealType: string; kcal: number; avgKcal: number; days: number; share: number }[]
  topFoodsByKcal: FoodStat[]
  topFoodsByFrequency: FoodStat[]
  surplusOffenders: FoodStat[]
  daysOverTarget: number
  daysUnderTarget: number
  calorieTargetKcal: number | null
  avgMealsPerDay: number | null
  fiberTargetG: number
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export interface ExerciseStat {
  name: string
  sessions: number
  sets: number
  totalVolumeKg: number
  topWeightKg: number | null
  bestE1RM: number | null
  firstE1RM: number | null
  lastE1RM: number | null
  /** % change in estimated 1RM across the range. */
  progressPct: number | null
  lastDate: string
  status: 'progressing' | 'stalled' | 'regressing' | 'new'
  history: { date: string; label: string; topWeightKg: number | null; e1rm: number | null; volumeKg: number; sets: number }[]
}

export interface MuscleStat {
  group: string
  sets: number
  setsPerWeek: number
  sessions: number
  share: number
}

export interface TrainingAnalysis {
  weekly: { weekStart: string; label: string; sets: number; volumeKg: number; sessions: number; cardioMin: number }[]
  muscles: MuscleStat[]
  /** Push:pull set ratio. 1.0 = balanced; > 1.3 = push-dominant. */
  pushPullRatio: number | null
  upperLowerRatio: number | null
  exercises: ExerciseStat[]
  prs: { name: string; date: string; label: string; weightKg: number; reps: number; e1rm: number }[]
  stalled: ExerciseStat[]
  longestGapDays: number
  currentGapDays: number
  avgSessionMin: number | null
  totalCardioMin: number
  totalCardioKm: number
  /** Untrained days with their intake, so a rest day with a big surplus is visible. */
  missedDays: { date: string; label: string; weekday: string; intake: number | null; balance: number | null; logged: boolean }[]
}

// ---------------------------------------------------------------------------
// Recovery / mind
// ---------------------------------------------------------------------------

export interface RecoveryAnalysis {
  series: {
    date: string
    label: string
    sleepH: number | null
    sleepQuality: number | null
    mood: number | null
    stress: number | null
    focus: number | null
    motivation: number | null
    dayRating: number | null
  }[]
  energyCurve: { timeOfDay: string; avgLevel: number; n: number }[]
  symptoms: { name: string; occurrences: number; avgIntensity: number; lastDate: string; triggers: string[] }[]
  emotions: { feeling: string; count: number; avgIntensity: number }[]
  habits: { name: string; done: number; skipped: number; consistency: number }[]
  /** Intake on short-sleep days vs the rest — the classic hidden-calorie driver. */
  sleepVsIntake: { shortSleepAvgIntake: number | null; normalSleepAvgIntake: number | null; shortSleepDays: number } | null
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export interface Correlation {
  aKey: string
  bKey: string
  a: string
  b: string
  r: number
  n: number
  strength: 'strong' | 'moderate' | 'weak'
  sentence: string
  points: { x: number; y: number; date: string }[]
}

export interface GapAnalysis {
  /** Last 26 weeks of calendar cells for the consistency heatmap. */
  heatmap: { date: string; logged: boolean; trained: boolean; intake: number | null; balance: number | null }[]
  currentStreak: number
  longestStreak: number
  daysLogged: number
  daysMissed: number
  loggingRate: number
  /** Runs of consecutive unlogged days, longest first. */
  gaps: { start: string; end: string; days: number }[]
}

export interface CoverageStat {
  dimension: string
  daysWithData: number
  pct: number
  hint: string
}

// ---------------------------------------------------------------------------
// Diagnostics — the "why" engine
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'serious' | 'warning' | 'insight' | 'good'

export interface Finding {
  id: string
  severity: Severity
  /** Which tab the evidence lives on, so a card can deep-link to it. */
  area: 'energy' | 'weight' | 'nutrition' | 'training' | 'recovery' | 'data'
  title: string
  detail: string
  evidence: { label: string; value: string }[]
  action: string
}

// ---------------------------------------------------------------------------
// The whole payload
// ---------------------------------------------------------------------------

export interface AnalyticsProfile {
  weightKg: number | null
  targetWeightKg: number | null
  heightCm: number | null
  gender: string | null
  age: number | null
  activityLevel: string | null
  nutritionGoal: string | null
  fitnessGoal: string | null
  bmr: number | null
  tdee: number | null
  proteinTargetG: number | null
  calorieTargetKcal: number | null
  bmi: number | null
  bmiCategory: string | null
  idealWeightRange: { min: number; max: number } | null
  /** Fields the analysis needs but the profile is missing. */
  missing: string[]
}

export interface AnalyticsPayload {
  range: { key: RangeKey; start: string; end: string; days: number; label: string }
  profile: AnalyticsProfile
  days: DayPoint[]
  summary: PeriodSummary
  previous: PeriodSummary | null
  energy: EnergyAnalysis
  weight: WeightAnalysis
  dayType: DayTypeAnalysis
  weekday: WeekdayStat[]
  weekly: WeeklyPoint[]
  monthly: MonthlyPoint[]
  nutrition: NutritionAnalysis
  training: TrainingAnalysis
  recovery: RecoveryAnalysis
  correlations: Correlation[]
  gaps: GapAnalysis
  coverage: CoverageStat[]
  findings: Finding[]
  meta: {
    entryCount: number
    firstLoggedDate: string | null
    lastLoggedDate: string | null
    allTimeFirstDate: string | null
    allTimeDaysLogged: number
    generatedAt: string
  }
}

/** kcal per kg of body mass — the standard energy-balance constant. */
export const KCAL_PER_KG = 7700

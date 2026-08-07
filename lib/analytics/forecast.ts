/**
 * Forecast engine — where the numbers are going, and what changes them.
 *
 * Rules this file holds to, because a prediction is easy to state and hard to
 * justify:
 *
 * 1. Every projection carries a prediction interval, not just a point. The band
 *    widens with the horizon because the maths says it should.
 * 2. Nothing is projected from fewer points than the method needs. Below the
 *    bar, the projection is `null` and the UI says what's missing instead of
 *    printing a confident number built on three data points.
 * 3. Body composition is *estimated*, never measured. The body-fat figure comes
 *    from a population regression on BMI (Deurenberg), which carries roughly
 *    ±4 percentage points of individual error. Stated everywhere it appears.
 * 4. Extrapolation is linear and therefore wrong at long horizons — bodies
 *    plateau, lifts stall. Horizons stop at 12 weeks and the copy says the
 *    quiet part out loud.
 */

import type { DayPoint, PeriodSummary, TrainingAnalysis, WeightAnalysis } from './types'
import { KCAL_PER_KG, type AnalyticsProfile, type DayTypeAnalysis, type EnergyAnalysis } from './types'
import {
  addDays,
  clamp,
  daysBetween,
  linreg,
  longLabel,
  mean,
  predict,
  predictionInterval,
  round,
  shortLabel,
  stdev,
} from './util'

/** Horizons every projection reports, in days. */
export const HORIZONS = [28, 56, 84] as const

export interface Projection {
  horizonDays: number
  /** "4 weeks" */
  horizonLabel: string
  date: string
  dateLabel: string
  value: number
  low: number
  high: number
}

export interface ForecastPoint {
  date: string
  label: string
  /** Observed value, null on days with no observation. */
  actual: number | null
  /** The fitted line across the observed range. */
  fitted: number | null
  /** The extrapolation beyond today. */
  projected: number | null
  low: number | null
  high: number | null
}

export type Confidence = 'low' | 'medium' | 'high'

export interface WeightForecast {
  /** Which signal drove it: the scale, or the energy balance when the scale is too sparse. */
  method: 'scale-trend' | 'energy-balance'
  ratePerWeek: number
  /** Rate the food log alone implies, for comparison. Null without food data. */
  energyRatePerWeek: number | null
  r2: number | null
  observations: number
  confidence: Confidence
  projections: Projection[]
  series: ForecastPoint[]
  targetKg: number | null
  targetDate: string | null
  targetWeeks: number | null
  sentence: string
  /**
   * Set when every logged weight is the same number. A real scale varies by a
   * few hundred grams day to day, so identical readings across weeks mean the
   * figure is being copied from the profile rather than measured — and a
   * "perfectly flat trend" would otherwise be reported with total certainty.
   */
  flatlineWarning: string | null
}

export interface CompositionNow {
  weightKg: number
  bodyFatPct: number
  fatMassKg: number
  leanMassKg: number
  method: string
}

export interface CompositionForecast {
  now: CompositionNow
  projections: {
    horizonDays: number
    horizonLabel: string
    date: string
    dateLabel: string
    weightKg: number
    fatMassKg: number
    leanMassKg: number
    bodyFatPct: number
    fatChangeKg: number
    leanChangeKg: number
  }[]
  series: { date: string; label: string; fat: number | null; lean: number | null; projected: boolean }[]
  /** Share of the projected weight change expected to be lean tissue, 0-1. */
  leanShare: number
  leanShareReason: string
  /** Realistic natural muscle-gain ceiling for this bodyweight, kg per month. */
  muscleCeilingKgPerMonth: { low: number; high: number } | null
  /** Projected lean gain per month vs that ceiling. */
  leanVsCeiling: 'within' | 'above-ceiling' | 'losing' | 'flat' | null
  caveat: string
}

export interface LiftForecast {
  name: string
  sessions: number
  currentE1RM: number
  ratePerWeek: number
  r2: number
  projected: Projection
  sentence: string
  /**
   * 'noisy' when the prediction interval spans more than 80% of the projected
   * value — the trend exists but is too scattered to put a number on. Kept in
   * the list and labelled rather than dropped, so the coverage isn't silently
   * narrowed.
   */
  reliability: 'ok' | 'noisy'
}

export interface MindMetricForecast {
  key: string
  label: string
  current: number
  ratePerWeek: number
  projected30d: number
  direction: 'improving' | 'worsening' | 'flat'
  n: number
  /** True when a lower number is the better outcome (stress, anxiety). */
  lowerIsBetter: boolean
  /** Already at the good end of the 1-10 scale, so there is no trend to read. */
  atExtreme: boolean
}

export interface MindForecast {
  metrics: MindMetricForecast[]
  /** What each mood metric moves with, strongest first. */
  drivers: { metric: string; driver: string; r: number; n: number; sentence: string }[]
  sentence: string | null
}

export interface Scenario {
  id: string
  title: string
  change: string
  /** Daily energy balance under this scenario. */
  newDailyBalanceKcal: number | null
  weightIn12WeeksKg: number | null
  deltaVsNothingKg: number | null
  leanShare: number | null
  sentence: string
}

export interface NarrativeSection {
  heading: string
  body: string[]
}

export interface ForecastBundle {
  generatedFrom: { start: string; end: string; days: number }
  weight: WeightForecast | null
  composition: CompositionForecast | null
  lifts: LiftForecast[]
  mind: MindForecast
  scenarios: Scenario[]
  narrative: NarrativeSection[]
  /** What would make these predictions better, and by how much. */
  dataQuality: { label: string; have: number; need: number; ok: boolean; note: string }[]
}

// ---------------------------------------------------------------------------
// Composition partitioning — shared with the engine's retrospective estimate
// ---------------------------------------------------------------------------

/**
 * Share of a weight change that is lean tissue rather than fat, 0-1.
 *
 * From published partitioning ranges rather than measurement. The three levers
 * are the ones that actually decide it: how fast the change is, whether there's
 * a resistance-training stimulus, and whether protein is high enough to build
 * on. Returns the share plus the reason, so every number that depends on it can
 * show its working.
 */
export function leanShareOfChange(opts: {
  changeKg: number
  ratePerWeek: number
  trainingPerWeek: number
  proteinPerKg: number | null
  bodyWeightKg: number | null
}): { share: number; reason: string } {
  const { changeKg, ratePerWeek, trainingPerWeek, proteinPerKg, bodyWeightKg } = opts
  const trains = trainingPerWeek >= 3
  const highProtein = (proteinPerKg ?? 0) >= 1.6
  const okProtein = (proteinPerKg ?? 0) >= 1.2
  const p = (proteinPerKg ?? 0).toFixed(1)

  if (changeKg > 0) {
    const fastGain = ratePerWeek > 0.5
    if (trains && highProtein && !fastGain)
      return {
        share: 0.4,
        reason: `Gaining slowly (${ratePerWeek.toFixed(2)} kg/wk) while lifting ${trainingPerWeek.toFixed(1)}×/wk on ${p} g/kg protein — the partitioning window where a real share of the gain is lean tissue.`,
      }
    if (trains && okProtein)
      return {
        share: 0.25,
        reason: fastGain
          ? `Gaining fast (${ratePerWeek.toFixed(2)} kg/wk). Muscle can't be built at that speed — past roughly 0.5 kg/wk the extra is mostly fat.`
          : `Training is there but protein (${p} g/kg) is under 1.6 g/kg, which caps how much of the gain can be lean.`,
      }
    return {
      share: 0.1,
      reason: trains
        ? 'Protein is too low to support lean gain, so almost all of this is fat.'
        : `Only ${trainingPerWeek.toFixed(1)} resistance sessions a week. Without a training stimulus a surplus goes to fat.`,
    }
  }

  const fastLoss = bodyWeightKg ? Math.abs(ratePerWeek) > bodyWeightKg * 0.01 : Math.abs(ratePerWeek) > 0.9
  if (trains && highProtein && !fastLoss)
    return {
      share: 0.1,
      reason: `Losing at a controlled ${Math.abs(ratePerWeek).toFixed(2)} kg/wk with ${trainingPerWeek.toFixed(1)} sessions/wk and ${p} g/kg protein — conditions that protect muscle, so most of the loss is fat.`,
    }
  if (trains || okProtein)
    return {
      share: 0.25,
      reason: fastLoss
        ? `Losing fast (${Math.abs(ratePerWeek).toFixed(2)} kg/wk). Above ~1% of bodyweight a week, lean mass starts going with the fat.`
        : 'Either training or protein is short of the muscle-sparing threshold, so some of the loss is lean tissue.',
    }
  return {
    share: 0.35,
    reason: 'Little resistance training and low protein while losing weight — a meaningful share of this is muscle, not fat.',
  }
}

/**
 * Body-fat percentage from BMI, age and sex (Deurenberg 1991).
 *
 * A population regression, not a measurement: individual error is around ±4
 * percentage points, and it reads high for a muscular build because BMI can't
 * tell muscle from fat. Used only to give the composition projection a starting
 * point; every surface that shows it also shows the caveat.
 */
export function estimateBodyFatPct(bmi: number, age: number, gender: string): number {
  const sexTerm = gender === 'male' ? 1 : 0
  return clamp(1.2 * bmi + 0.23 * age - 10.8 * sexTerm - 5.4, 3, 60)
}

const horizonLabel = (days: number): string => `${Math.round(days / 7)} weeks`

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** "a", "a and b", "a, b and c" */
const listOf = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

function forecastWeight(
  days: DayPoint[],
  summary: PeriodSummary,
  weight: WeightAnalysis,
  energy: EnergyAnalysis,
  profile: AnalyticsProfile
): WeightForecast | null {
  const observed = days
    .map((d, i) => ({ i, kg: d.weightKg, date: d.date }))
    .filter((o): o is { i: number; kg: number; date: string } => o.kg != null)

  const energyRatePerWeek =
    summary.avgBalanceKcal != null ? round((summary.avgBalanceKcal / KCAL_PER_KG) * 7, 3) : null

  const lastDate = days[days.length - 1]?.date
  if (!lastDate) return null
  const lastIndex = days.length - 1

  // Preferred path: fit the scale. Needs ≥4 weigh-ins spanning ≥14 days, or the
  // slope is noise and the interval would be meaningless.
  const fit =
    observed.length >= 4 && observed[observed.length - 1].i - observed[0].i >= 14
      ? linreg(
          observed.map((o) => o.i),
          observed.map((o) => o.kg)
        )
      : null

  const startKg = weight.lastKg ?? profile.weightKg
  if (fit === null && (energyRatePerWeek === null || startKg == null)) return null

  const method: WeightForecast['method'] = fit ? 'scale-trend' : 'energy-balance'
  const ratePerWeek = fit ? fit.slope * 7 : (energyRatePerWeek as number)
  const anchor = fit ? predict(fit, lastIndex) : (startKg as number)

  // Identical readings mean the number isn't being measured. Say so, and stop
  // the zero residual error from collapsing the interval to a point.
  const spread = (stdev(observed.map((o) => o.kg)) ?? 0)
  const flatlined = fit != null && observed.length >= 3 && spread < 0.05
  const flatlineWarning = flatlined
    ? `All ${observed.length} of your logged weights are the same number (${observed[0].kg} kg). A real scale moves a few hundred grams day to day, so this looks like your profile weight being repeated rather than actual weigh-ins — which means the trend below is flat by default, not because your weight is stable. Weigh yourself each morning and this becomes the most useful number on the page.`
    : null

  const confidence: Confidence = flatlined
    ? 'low'
    : fit
      ? fit.r2 >= 0.6 && observed.length >= 8
        ? 'high'
        : fit.r2 >= 0.3 || observed.length >= 6
          ? 'medium'
          : 'low'
      : 'low'

  /**
   * Interval half-width at horizon `h`. Never smaller than day-to-day scale
   * noise (±0.4 kg, widening with the horizon), so a projection can't be
   * presented as more certain than a bathroom scale allows.
   */
  const bandAt = (x: number, value: number): number => {
    const floor = 0.4 * Math.sqrt((x - lastIndex) / 28 + 1)
    const statistical = fit ? predictionInterval(fit, x) : Math.abs(value - anchor) * 0.2 + 0.5
    return Math.max(statistical, floor)
  }

  const projections: Projection[] = HORIZONS.map((h) => {
    const x = lastIndex + h
    const value = fit ? predict(fit, x) : anchor + (ratePerWeek / 7) * h
    const band = bandAt(x, value)
    const date = addDays(lastDate, h)
    return {
      horizonDays: h,
      horizonLabel: horizonLabel(h),
      date,
      dateLabel: longLabel(date),
      value: round(value, 1) as number,
      low: round(value - band, 1) as number,
      high: round(value + band, 1) as number,
    }
  })

  // History (actual + fitted) then the projection, in one series so the chart
  // can draw them on a single continuous axis.
  const series: ForecastPoint[] = days.map((d, i) => ({
    date: d.date,
    label: d.label,
    actual: d.weightKg,
    fitted: fit ? (round(predict(fit, i), 2) as number) : null,
    projected: null,
    low: null,
    high: null,
  }))
  // Bridge the gap: the projection starts at the last fitted point so the two
  // lines meet instead of showing a break.
  if (series.length) {
    const last = series[series.length - 1]
    last.projected = last.fitted ?? anchor
    last.low = last.projected
    last.high = last.projected
  }
  for (let h = 1; h <= HORIZONS[HORIZONS.length - 1]; h += 1) {
    const x = lastIndex + h
    const value = fit ? predict(fit, x) : anchor + (ratePerWeek / 7) * h
    const band = bandAt(x, value)
    const date = addDays(lastDate, h)
    series.push({
      date,
      label: shortLabel(date),
      actual: null,
      fitted: null,
      projected: round(value, 2) as number,
      low: round(value - band, 2) as number,
      high: round(value + band, 2) as number,
    })
  }

  const targetKg = profile.targetWeightKg
  let targetDate: string | null = null
  let targetWeeks: number | null = null
  if (targetKg != null && Math.abs(ratePerWeek) > 0.02) {
    const need = targetKg - anchor
    if (Math.sign(need) === Math.sign(ratePerWeek)) {
      targetWeeks = Math.round(Math.abs(need / ratePerWeek))
      targetDate = addDays(lastDate, targetWeeks * 7)
    }
  }

  const twelve = projections[projections.length - 1]
  const dir = ratePerWeek > 0.02 ? 'up' : ratePerWeek < -0.02 ? 'down' : 'flat'
  const sentence = flatlined
    ? `There is no real weight trend to project — every logged weight is ${observed[0].kg} kg.${energyRatePerWeek != null ? ` Your food log implies ${energyRatePerWeek > 0 ? 'a gain' : 'a loss'} of about ${Math.abs(energyRatePerWeek).toFixed(2)} kg a week, which would be ${(anchor + energyRatePerWeek * 12).toFixed(1)} kg in 12 weeks — but nothing has confirmed that against a scale.` : ''}`
    : dir === 'flat'
      ? `At your current numbers your weight stays around ${anchor.toFixed(1)} kg — you are sitting at maintenance.`
      : `If nothing changes you reach roughly ${twelve.value.toFixed(1)} kg in 12 weeks (${twelve.dateLabel}), somewhere between ${twelve.low.toFixed(1)} and ${twelve.high.toFixed(1)} kg. That is ${dir === 'up' ? 'a gain' : 'a loss'} of ${Math.abs(twelve.value - anchor).toFixed(1)} kg at ${Math.abs(ratePerWeek).toFixed(2)} kg a week.`

  return {
    method,
    ratePerWeek: round(ratePerWeek, 3) as number,
    energyRatePerWeek,
    r2: fit ? (round(fit.r2, 2) as number) : null,
    observations: observed.length,
    confidence,
    projections,
    series,
    targetKg,
    targetDate,
    targetWeeks,
    sentence,
    flatlineWarning,
  }
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function forecastComposition(
  weightForecast: WeightForecast | null,
  summary: PeriodSummary,
  profile: AnalyticsProfile,
  bmi: number | null
): CompositionForecast | null {
  const startKg = profile.weightKg
  if (!weightForecast || startKg == null || bmi == null || profile.age == null || !profile.gender) return null

  const bodyFatPct = estimateBodyFatPct(bmi, profile.age, profile.gender)
  const fatMassKg = (startKg * bodyFatPct) / 100
  const now: CompositionNow = {
    weightKg: round(startKg, 1) as number,
    bodyFatPct: round(bodyFatPct, 1) as number,
    fatMassKg: round(fatMassKg, 1) as number,
    leanMassKg: round(startKg - fatMassKg, 1) as number,
    method: 'BMI-based estimate (Deurenberg), ±4 percentage points',
  }

  const anchorKg = weightForecast.series.find((p) => p.projected != null)?.projected ?? startKg
  const twelveWeekChange = weightForecast.projections[weightForecast.projections.length - 1].value - anchorKg
  const partition = leanShareOfChange({
    changeKg: twelveWeekChange,
    ratePerWeek: weightForecast.ratePerWeek,
    trainingPerWeek: summary.trainingPerWeek ?? 0,
    proteinPerKg: summary.proteinPerKg,
    bodyWeightKg: startKg,
  })
  const leanShare = partition.share
  // With no projected change there is nothing to partition, and the gain/loss
  // wording from the partitioner would describe something that isn't happening.
  const leanShareReason =
    Math.abs(twelveWeekChange) < 0.2
      ? `Your weight is projected to hold steady, so there is no change to split into muscle and fat. Composition can still shift underneath a flat scale — gaining muscle while losing the same weight in fat looks like nothing happening. Only a measurement (DEXA, calipers) or a tape around the waist would catch that.`
      : partition.reason

  const projections = weightForecast.projections.map((p) => {
    const change = p.value - anchorKg
    const leanChangeKg = change * leanShare
    const fatChangeKg = change - leanChangeKg
    const leanMassKg = now.leanMassKg + leanChangeKg
    const fatMass = now.fatMassKg + fatChangeKg
    const weightKg = leanMassKg + fatMass
    return {
      horizonDays: p.horizonDays,
      horizonLabel: p.horizonLabel,
      date: p.date,
      dateLabel: p.dateLabel,
      weightKg: round(weightKg, 1) as number,
      fatMassKg: round(fatMass, 1) as number,
      leanMassKg: round(leanMassKg, 1) as number,
      bodyFatPct: round((fatMass / weightKg) * 100, 1) as number,
      fatChangeKg: round(fatChangeKg, 2) as number,
      leanChangeKg: round(leanChangeKg, 2) as number,
    }
  })

  // Stacked view: today, then each horizon.
  const series = [
    { date: 'now', label: 'Now', fat: now.fatMassKg, lean: now.leanMassKg, projected: false },
    ...projections.map((p) => ({
      date: p.date,
      label: `+${p.horizonLabel.replace(' weeks', 'w')}`,
      fat: p.fatMassKg,
      lean: p.leanMassKg,
      projected: true,
    })),
  ]

  // Natural lean-gain ceiling: roughly 0.25–0.5% of bodyweight a month for
  // someone past the beginner window. Anything projected above this isn't muscle.
  const muscleCeilingKgPerMonth = { low: round(startKg * 0.0025, 2) as number, high: round(startKg * 0.005, 2) as number }
  const leanPerMonth = (projections[projections.length - 1].leanChangeKg / 84) * 30
  const leanVsCeiling: CompositionForecast['leanVsCeiling'] =
    Math.abs(leanPerMonth) < 0.05
      ? 'flat'
      : leanPerMonth < 0
        ? 'losing'
        : leanPerMonth > muscleCeilingKgPerMonth.high
          ? 'above-ceiling'
          : 'within'

  return {
    now,
    projections,
    series,
    leanShare,
    leanShareReason,
    muscleCeilingKgPerMonth,
    leanVsCeiling,
    caveat:
      'Body-fat percentage here is estimated from BMI, age and sex, so it reads high for a muscular build and carries about ±4 points of error. Treat the direction and the size of the change as the signal, not the absolute number — only a DEXA scan or calipers measure this.',
  }
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

function forecastLifts(training: TrainingAnalysis, lastDate: string): LiftForecast[] {
  const out: LiftForecast[] = []

  for (const ex of training.exercises) {
    const points = ex.history
      .filter((h) => h.e1rm != null)
      .map((h) => ({ x: daysBetween(ex.history[0].date, h.date), y: h.e1rm as number }))
    // ≥4 sessions over ≥21 days: fewer and the "trend" is one good day.
    if (points.length < 4) continue
    const span = points[points.length - 1].x - points[0].x
    if (span < 21) continue

    const fit = linreg(
      points.map((p) => p.x),
      points.map((p) => p.y)
    )
    if (!fit) continue

    const lastX = points[points.length - 1].x
    const current = ex.lastE1RM ?? predict(fit, lastX)
    const ratePerWeek = fit.slope * 7
    // Only report lifts that are actually moving; flat ones are covered by the
    // "stalled" list on the training tab.
    if (Math.abs(ratePerWeek) < 0.1) continue

    const x = lastX + 84
    const value = predict(fit, x)
    const band = predictionInterval(fit, x)
    const date = addDays(lastDate, 84)

    const reliability: LiftForecast['reliability'] = value > 0 && (2 * band) / value > 0.8 ? 'noisy' : 'ok'

    out.push({
      name: ex.name,
      sessions: points.length,
      currentE1RM: Math.round(current),
      ratePerWeek: round(ratePerWeek, 2) as number,
      r2: round(fit.r2, 2) as number,
      reliability,
      projected: {
        horizonDays: 84,
        horizonLabel: '12 weeks',
        date,
        dateLabel: longLabel(date),
        value: Math.round(value),
        low: Math.round(value - band),
        high: Math.round(value + band),
      },
      sentence:
        reliability === 'noisy'
          ? `${ex.name} is trending up fast (${ratePerWeek.toFixed(1)} kg a week) but the sessions are scattered enough that the 12-week range spans ${Math.round(value - band)}–${Math.round(value + band)} kg. That is too wide to be a number — it means the lift is progressing, not that it will be at ${Math.round(value)} kg.`
          : ratePerWeek > 0
            ? `${ex.name} is climbing ${ratePerWeek.toFixed(1)} kg of estimated 1RM a week. Hold that and you are at about ${Math.round(value)} kg in 12 weeks, up from ${Math.round(current)} kg.`
            : `${ex.name} is drifting down ${Math.abs(ratePerWeek).toFixed(1)} kg a week. On this path you are at ${Math.round(value)} kg in 12 weeks, down from ${Math.round(current)} kg.`,
    })
  }

  return out.sort((a, b) => b.ratePerWeek - a.ratePerWeek).slice(0, 8)
}

// ---------------------------------------------------------------------------
// Mind
// ---------------------------------------------------------------------------

const MIND_METRICS: { key: keyof DayPoint; label: string; lowerIsBetter: boolean }[] = [
  { key: 'mood', label: 'Mood', lowerIsBetter: false },
  { key: 'stress', label: 'Stress', lowerIsBetter: true },
  { key: 'anxiety', label: 'Anxiety', lowerIsBetter: true },
  { key: 'focus', label: 'Focus', lowerIsBetter: false },
  { key: 'motivation', label: 'Motivation', lowerIsBetter: false },
  { key: 'dayRating', label: 'Day rating', lowerIsBetter: false },
  { key: 'sleepH', label: 'Sleep hours', lowerIsBetter: false },
]

const DRIVER_CANDIDATES: { key: keyof DayPoint; label: string }[] = [
  { key: 'sleepH', label: 'sleep hours' },
  { key: 'sleepQuality', label: 'sleep quality' },
  { key: 'intakeKcal', label: 'calorie intake' },
  { key: 'proteinG', label: 'protein' },
  { key: 'volumeKg', label: 'training volume' },
  { key: 'workoutMin', label: 'training minutes' },
  { key: 'fiberG', label: 'fiber' },
  { key: 'symptomCount', label: 'symptoms' },
]

function forecastMind(days: DayPoint[], correlations: { aKey: string; bKey: string; a: string; b: string; r: number; n: number }[]): MindForecast {
  const metrics: MindMetricForecast[] = []

  for (const m of MIND_METRICS) {
    const points = days
      .map((d, i) => ({ x: i, y: d[m.key] }))
      .filter((p): p is { x: number; y: number } => typeof p.y === 'number')
    if (points.length < 6) continue
    const fit = linreg(
      points.map((p) => p.x),
      points.map((p) => p.y)
    )
    if (!fit) continue

    const lastX = days.length - 1
    // Sleep hours are hours; everything else is a 1-10 self-report and can't
    // leave that range, so clamping keeps a projected 11/10 off the screen.
    const isScale = m.key !== 'sleepH'
    const bound = (v: number) => (isScale ? clamp(v, 1, 10) : Math.max(0, v))
    const current = bound(predict(fit, lastX))
    const projected = bound(predict(fit, lastX + 30))
    const ratePerWeek = fit.slope * 7

    // Already pinned at the top (or bottom) of the scale: the trend has nowhere
    // to go, so calling it "improving" would be noise dressed as progress.
    const atCeiling = isScale && (m.lowerIsBetter ? current <= 1.2 : current >= 9.5)
    const improving = m.lowerIsBetter ? ratePerWeek < 0 : ratePerWeek > 0
    const direction: MindMetricForecast['direction'] =
      atCeiling || Math.abs(ratePerWeek) < 0.05 ? 'flat' : improving ? 'improving' : 'worsening'

    metrics.push({
      key: m.key as string,
      label: m.label,
      current: round(current, 1) as number,
      ratePerWeek: round(ratePerWeek, 2) as number,
      projected30d: round(projected, 1) as number,
      direction,
      n: points.length,
      lowerIsBetter: m.lowerIsBetter,
      atExtreme: atCeiling,
    })
  }

  // Drivers: the strongest correlation between each mood metric and something
  // controllable. Taken from the already-computed correlation set so the numbers
  // on the Patterns tab and here can never disagree.
  const moodKeys = new Set(['mood', 'stress', 'anxiety', 'focus', 'motivation', 'dayRating'])
  const driverKeys = new Set(DRIVER_CANDIDATES.map((d) => d.key as string))
  const drivers = correlations
    .filter(
      (c) =>
        (moodKeys.has(c.aKey) && driverKeys.has(c.bKey)) || (moodKeys.has(c.bKey) && driverKeys.has(c.aKey))
    )
    .map((c) => {
      const moodFirst = moodKeys.has(c.aKey)
      const metric = moodFirst ? c.a : c.b
      const driver = moodFirst ? c.b : c.a
      return {
        metric,
        driver,
        r: c.r,
        n: c.n,
        sentence: `Your ${metric} moves ${c.r > 0 ? 'with' : 'against'} ${driver} (r = ${c.r.toFixed(2)} over ${c.n} days) — so ${c.r > 0 ? 'more' : 'less'} ${driver} predicts better ${metric}.`,
      }
    })
    .slice(0, 5)

  const worsening = metrics.filter((m) => m.direction === 'worsening')
  const improving = metrics.filter((m) => m.direction === 'improving')
  const pinned = metrics.filter((m) => m.atExtreme)
  const sentence =
    metrics.length === 0
      ? null
      : worsening.length === 0
        ? `Everything you track about your head is stable or improving${improving.length ? ` — ${listOf(improving.map((m) => m.label.toLowerCase()))} trending the right way` : ''}.${pinned.length ? ` ${capitalise(listOf(pinned.map((m) => m.label.toLowerCase())))} ${pinned.length === 1 ? 'is' : 'are'} already pinned at the top of the scale, so there is no trend left to read there — worth asking whether you rate honestly on the bad days.` : ''}`
        : `${worsening.map((m) => m.label.toLowerCase()).join(' and ')} ${worsening.length === 1 ? 'is' : 'are'} trending the wrong way. At the current rate, ${worsening
            .map((m) => `${m.label.toLowerCase()} reaches ${m.projected30d.toFixed(1)}/10 in a month`)
            .join(' and ')}.`

  return { metrics, drivers, sentence }
}

// ---------------------------------------------------------------------------
// Scenarios — "what if I actually change this"
// ---------------------------------------------------------------------------

function buildScenarios(
  weightForecast: WeightForecast | null,
  summary: PeriodSummary,
  dayType: DayTypeAnalysis,
  weight: WeightAnalysis,
  profile: AnalyticsProfile
): Scenario[] {
  const out: Scenario[] = []
  const startKg = weight.lastKg ?? profile.weightKg
  const baselineBalance = summary.avgBalanceKcal
  if (startKg == null) return out

  /** Weight in 12 weeks at a given constant daily balance. */
  const project = (dailyBalance: number) => round(startKg + (dailyBalance * 84) / KCAL_PER_KG, 1) as number
  const nothingChanges = weightForecast
    ? weightForecast.projections[weightForecast.projections.length - 1].value
    : baselineBalance != null
      ? project(baselineBalance)
      : null

  const shareFor = (changeKg: number, rate: number) =>
    leanShareOfChange({
      changeKg,
      ratePerWeek: rate,
      trainingPerWeek: summary.trainingPerWeek ?? 0,
      proteinPerKg: summary.proteinPerKg,
      bodyWeightKg: startKg,
    }).share

  // 1. Do nothing.
  if (nothingChanges != null) {
    const change = nothingChanges - startKg
    out.push({
      id: 'baseline',
      title: 'Nothing changes',
      change: 'Same eating, same training, same logging',
      newDailyBalanceKcal: baselineBalance,
      weightIn12WeeksKg: nothingChanges,
      deltaVsNothingKg: 0,
      leanShare: round(shareFor(change, weightForecast?.ratePerWeek ?? 0), 2),
      sentence: `${nothingChanges.toFixed(1)} kg in 12 weeks — ${change >= 0 ? '+' : ''}${change.toFixed(1)} kg from where you are now.`,
    })
  }

  // 2. Fix rest-day eating, when the data shows rest days running a surplus.
  if (
    baselineBalance != null &&
    dayType.rest.daysWithFood >= 3 &&
    dayType.rest.avgBalance != null &&
    dayType.rest.avgBalance > 0
  ) {
    const restShare = dayType.rest.days / Math.max(1, dayType.rest.days + dayType.trained.days)
    const cut = Math.min(600, Math.max(200, Math.round(dayType.rest.avgBalance / 50) * 50))
    const newBalance = Math.round(baselineBalance - cut * restShare)
    const projected = project(newBalance)
    out.push({
      id: 'fix-rest-days',
      title: `Eat ${cut} kcal less on rest days`
        ,
      change: `Rest days only — ${Math.round(restShare * 100)}% of your days`,
      newDailyBalanceKcal: newBalance,
      weightIn12WeeksKg: projected,
      deltaVsNothingKg: nothingChanges != null ? (round(projected - nothingChanges, 1) as number) : null,
      leanShare: round(shareFor(projected - startKg, ((projected - startKg) / 84) * 7), 2),
      sentence: `Cutting ${cut} kcal on rest days alone puts you at ${projected.toFixed(1)} kg in 12 weeks${nothingChanges != null ? `, ${Math.abs(projected - nothingChanges).toFixed(1)} kg ${projected < nothingChanges ? 'lighter' : 'heavier'} than doing nothing` : ''}. You do not have to touch training-day food.`,
    })
  }

  // 3. One extra session a week, priced at your own average session burn.
  if (baselineBalance != null && (summary.trainingPerWeek ?? 0) < 6) {
    const burn = summary.avgBurnKcal ?? 400
    const newBalance = Math.round(baselineBalance - burn / 7)
    const projected = project(newBalance)
    const rate = ((projected - startKg) / 84) * 7
    out.push({
      id: 'one-more-session',
      title: 'Add one training session a week',
      change: `About ${Math.round(burn)} kcal per session, your own average`,
      newDailyBalanceKcal: newBalance,
      weightIn12WeeksKg: projected,
      deltaVsNothingKg: nothingChanges != null ? (round(projected - nothingChanges, 1) as number) : null,
      leanShare: round(shareFor(projected - startKg, rate), 2),
      sentence: `One more session a week is worth about ${Math.round(burn / 7)} kcal a day, which lands you at ${projected.toFixed(1)} kg in 12 weeks. The bigger effect is on composition, not the scale: more sessions push more of any change toward muscle.`,
    })
  }

  // 4. Eat at a real 15% deficit off the empirically-derived maintenance.
  const trueMaint = weight.trueMaintenanceKcal
  if (trueMaint != null) {
    const target = Math.round(trueMaint * 0.85)
    const newBalance = target - trueMaint
    const projected = project(newBalance)
    const rate = ((projected - startKg) / 84) * 7
    const weeksToTarget =
      profile.targetWeightKg != null && Math.abs(rate) > 0.02
        ? Math.round(Math.abs((profile.targetWeightKg - startKg) / rate))
        : null
    out.push({
      id: 'real-deficit',
      title: `Eat ${target.toLocaleString()} kcal a day`,
      change: `A 15% deficit off your real maintenance of ${trueMaint.toLocaleString()} kcal`,
      newDailyBalanceKcal: newBalance,
      weightIn12WeeksKg: projected,
      deltaVsNothingKg: nothingChanges != null ? (round(projected - nothingChanges, 1) as number) : null,
      leanShare: round(shareFor(projected - startKg, rate), 2),
      sentence: `A real 15% deficit is ${target.toLocaleString()} kcal a day, ${Math.abs(newBalance)} kcal under maintenance. That is ${projected.toFixed(1)} kg in 12 weeks, about ${Math.abs(rate).toFixed(2)} kg a week${weeksToTarget != null && profile.targetWeightKg != null ? `, reaching your ${profile.targetWeightKg} kg target in roughly ${weeksToTarget} weeks` : ''}.`,
    })
  }

  // 5. Protein to 1.8 g/kg — no scale effect, a real composition effect.
  if (summary.proteinPerKg != null && summary.proteinPerKg < 1.7 && profile.weightKg) {
    const targetG = Math.round(profile.weightKg * 1.8)
    const addG = Math.max(10, targetG - (summary.avgProteinG ?? 0))
    const shareNow = shareFor(1, weightForecast?.ratePerWeek ?? 0)
    const shareThen = leanShareOfChange({
      changeKg: 1,
      ratePerWeek: weightForecast?.ratePerWeek ?? 0,
      trainingPerWeek: summary.trainingPerWeek ?? 0,
      proteinPerKg: 1.8,
      bodyWeightKg: profile.weightKg,
    }).share
    out.push({
      id: 'protein-up',
      title: `Take protein to ${targetG} g a day`,
      change: `About ${addG} g more than you average now`,
      newDailyBalanceKcal: baselineBalance,
      weightIn12WeeksKg: nothingChanges,
      deltaVsNothingKg: 0,
      leanShare: round(shareThen, 2),
      sentence: `This does not change the scale — it changes what the scale is made of. At ${summary.proteinPerKg.toFixed(1)} g/kg roughly ${Math.round(shareNow * 100)}% of any gain is lean; at 1.8 g/kg that becomes about ${Math.round(shareThen * 100)}%.`,
    })
  }

  return out
}

// ---------------------------------------------------------------------------
// Narrative — the predictions in words
// ---------------------------------------------------------------------------

function buildNarrative(
  weightForecast: WeightForecast | null,
  composition: CompositionForecast | null,
  lifts: LiftForecast[],
  mind: MindForecast,
  scenarios: Scenario[],
  summary: PeriodSummary,
  weight: WeightAnalysis,
  profile: AnalyticsProfile
): NarrativeSection[] {
  const sections: NarrativeSection[] = []

  // --- Body weight ---------------------------------------------------------
  if (weightForecast) {
    const body = [weightForecast.sentence]
    // With identical readings there is no fit to describe and no agreement to
    // claim — saying "the two match, so trust it" would contradict the sentence
    // directly above.
    if (weightForecast.flatlineWarning) {
      body.push(weightForecast.flatlineWarning)
      if (weightForecast.energyRatePerWeek != null) {
        body.push(
          `Until then, the food log is the only signal: ${Math.abs(weightForecast.energyRatePerWeek) < 0.05 ? 'it puts you at maintenance, give or take' : `it implies about ${Math.abs(weightForecast.energyRatePerWeek).toFixed(2)} kg a week of ${weightForecast.energyRatePerWeek > 0 ? 'gain' : 'loss'}`}. That rests entirely on your portions being logged accurately, and a scale is the only thing that can check it.`
        )
      }
      sections.push({ heading: 'Your body weight', body })
    } else {
    if (weightForecast.method === 'energy-balance') {
      body.push(
        `This one is built from your food log rather than the scale — you have ${weightForecast.observations} weigh-in${weightForecast.observations === 1 ? '' : 's'} in range, and a trend line needs at least four spread over a fortnight. It assumes your logged calories are accurate, which is exactly the assumption a scale would test.`
      )
    } else {
      body.push(
        `That comes from fitting a line through ${weightForecast.observations} weigh-ins, which explains ${Math.round((weightForecast.r2 ?? 0) * 100)}% of the movement in them. Confidence: ${weightForecast.confidence}.`
      )
      if (weightForecast.energyRatePerWeek != null) {
        const diff = weightForecast.ratePerWeek - weightForecast.energyRatePerWeek
        body.push(
          Math.abs(diff) < 0.08
            ? `Your food log agrees: it implies ${weightForecast.energyRatePerWeek.toFixed(2)} kg a week against the scale's ${weightForecast.ratePerWeek.toFixed(2)}. When those two match, the prediction is worth trusting.`
            : `Your food log disagrees — it implies ${weightForecast.energyRatePerWeek.toFixed(2)} kg a week where the scale says ${weightForecast.ratePerWeek.toFixed(2)}. That gap is about ${Math.abs(Math.round((diff * KCAL_PER_KG) / 7))} kcal a day unaccounted for, and the scale is the one telling the truth.`
        )
      }
    }
    if (weightForecast.targetWeeks != null && weightForecast.targetKg != null) {
      body.push(
        `At this rate you hit your ${weightForecast.targetKg} kg target in about ${weightForecast.targetWeeks} weeks${weightForecast.targetDate ? ` — around ${longLabel(weightForecast.targetDate)}` : ''}.`
      )
    } else if (weightForecast.targetKg != null) {
      body.push(
        `You are not currently moving toward your ${weightForecast.targetKg} kg target, so there is no honest date to give you for it. The scenarios below show what would change that.`
      )
    }
      sections.push({ heading: 'Your body weight', body })
    }
  }

  // --- Composition ---------------------------------------------------------
  if (composition) {
    const twelve = composition.projections[composition.projections.length - 1]
    const body = [
      `Right now the estimate puts you at about ${composition.now.bodyFatPct.toFixed(0)}% body fat — roughly ${composition.now.fatMassKg.toFixed(1)} kg of fat and ${composition.now.leanMassKg.toFixed(1)} kg of everything else (muscle, bone, organs, water).`,
      Math.abs(twelve.fatChangeKg + twelve.leanChangeKg) < 0.2
        ? `Twelve weeks out that is essentially unchanged — about ${twelve.bodyFatPct.toFixed(0)}% body fat.`
        : `Twelve weeks out, the projection is ${twelve.fatMassKg.toFixed(1)} kg fat and ${twelve.leanMassKg.toFixed(1)} kg lean, or about ${twelve.bodyFatPct.toFixed(0)}% body fat. That splits the ${Math.abs(twelve.fatChangeKg + twelve.leanChangeKg).toFixed(1)} kg of weight change into ${twelve.leanChangeKg >= 0 ? '+' : ''}${twelve.leanChangeKg.toFixed(1)} kg lean and ${twelve.fatChangeKg >= 0 ? '+' : ''}${twelve.fatChangeKg.toFixed(1)} kg fat.`,
      composition.leanShareReason,
    ]
    if (composition.muscleCeilingKgPerMonth) {
      const c = composition.muscleCeilingKgPerMonth
      if (composition.leanVsCeiling === 'above-ceiling') {
        body.push(
          `One caution: that lean figure is above what a natural lifter at your bodyweight can actually build — realistically ${c.low}–${c.high} kg of muscle a month. Anything beyond that is water, glycogen and gut content, not tissue.`
        )
      } else if (composition.leanVsCeiling === 'within') {
        body.push(
          `That lean gain sits inside the realistic ceiling of ${c.low}–${c.high} kg of muscle a month for your bodyweight, so it is achievable rather than wishful.`
        )
      } else if (composition.leanVsCeiling === 'losing') {
        body.push(
          `The projection has you losing lean mass, not just fat. Protein at 1.8 g/kg and keeping resistance training frequent is what flips that.`
        )
      }
    }
    body.push(composition.caveat)
    sections.push({ heading: 'Muscle and fat', body })
  }

  // --- Strength ------------------------------------------------------------
  if (lifts.length > 0) {
    const rising = lifts.filter((l) => l.ratePerWeek > 0 && l.reliability === 'ok')
    const falling = lifts.filter((l) => l.ratePerWeek < 0 && l.reliability === 'ok')
    const noisy = lifts.filter((l) => l.reliability === 'noisy')
    const body: string[] = []
    if (rising.length) {
      body.push(
        `${rising.length} lift${rising.length === 1 ? ' is' : 's are'} on a measurable upward trend. ${rising
          .slice(0, 3)
          .map((l) => l.sentence)
          .join(' ')}`
      )
    }
    if (noisy.length) {
      body.push(
        `${noisy.map((l) => l.name).join(', ')} ${noisy.length === 1 ? 'is' : 'are'} moving but too scattered session-to-session to put a 12-week number on — the projection range is wider than the projection itself.`
      )
    }
    if (falling.length) {
      body.push(`Going the other way: ${falling.map((l) => l.sentence).join(' ')}`)
    }
    body.push(
      `Strength projections are the least reliable ones here — load progression is a staircase, not a ramp, and every lift eventually plateaus. Read these as "if the current run continues", not as a promise.`
    )
    if ((summary.avgBalanceKcal ?? 0) < -300) {
      body.push(
        `You are also averaging ${Math.abs(Math.round(summary.avgBalanceKcal as number))} kcal a day under maintenance. Strength gains slow in a real deficit, so treat these as an upper bound.`
      )
    }
    sections.push({ heading: 'Strength', body })
  }

  // --- Mind ----------------------------------------------------------------
  if (mind.metrics.length > 0) {
    const body: string[] = []
    if (mind.sentence) body.push(mind.sentence)
    const sleep = mind.metrics.find((m) => m.key === 'sleepH')
    if (sleep) {
      body.push(
        sleep.current < 7
          ? `You are averaging ${sleep.current.toFixed(1)} hours of sleep and the trend is ${sleep.direction}. Under 7 hours is the single most expensive input on this page: it raises appetite, blunts training recovery and drags mood — all at once.`
          : `Sleep is holding at ${sleep.current.toFixed(1)} hours, which is the foundation the rest of this rests on.`
      )
    }
    if (mind.drivers.length) {
      body.push(`What your numbers say actually moves your head: ${mind.drivers.map((d) => d.sentence).join(' ')}`)
    }
    body.push(
      `Mood and stress projections are the softest predictions here. They are self-reported on days you chose to log, which biases them, and a month is long enough for anything in life to overwrite the trend.`
    )
    sections.push({ heading: 'Mood and mental health', body })
  }

  // --- What changes it -----------------------------------------------------
  const actionable = scenarios.filter((s) => s.id !== 'baseline')
  if (actionable.length) {
    sections.push({
      heading: 'What would change the forecast',
      body: [
        `The projections above assume nothing changes. Here is what your own numbers say each change is worth:`,
        ...actionable.map((s) => `${s.title}: ${s.sentence}`),
      ],
    })
  }

  // --- Confidence ----------------------------------------------------------
  const caveats: string[] = [
    `Every projection here is a straight line drawn through your own data. Bodies are not straight lines: weight loss slows as you get lighter, muscle gain slows as you get more trained, and appetite pushes back. Treat 4 weeks as reasonably firm, 12 weeks as a direction.`,
  ]
  if (summary.daysLogged < summary.days * 0.7) {
    caveats.push(
      `You logged ${summary.daysLogged} of ${summary.days} days in this range. Missing days are not random — they skew toward the days that went badly, so these predictions are probably a little optimistic.`
    )
  }
  if (weight.observations < 8) {
    caveats.push(
      `${weight.observations} weigh-in${weight.observations === 1 ? '' : 's'} is thin for a trend. Daily morning weigh-ins for two weeks would tighten every number on this page more than any other single change.`
    )
  }
  if (profile.missing.length) {
    caveats.push(`Your profile is missing ${profile.missing.join(', ')}, which limits what can be estimated.`)
  }
  sections.push({ heading: 'How much to trust this', body: caveats })

  return sections
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function computeForecast(input: {
  days: DayPoint[]
  summary: PeriodSummary
  weight: WeightAnalysis
  energy: EnergyAnalysis
  dayType: DayTypeAnalysis
  training: TrainingAnalysis
  correlations: { aKey: string; bKey: string; a: string; b: string; r: number; n: number }[]
  profile: AnalyticsProfile
}): ForecastBundle {
  const { days, summary, weight, energy, dayType, training, correlations, profile } = input
  const lastDate = days[days.length - 1]?.date ?? ''

  const weightForecast = forecastWeight(days, summary, weight, energy, profile)
  const composition = forecastComposition(weightForecast, summary, profile, weight.bmi)
  const lifts = forecastLifts(training, lastDate)
  const mind = forecastMind(days, correlations)
  const scenarios = buildScenarios(weightForecast, summary, dayType, weight, profile)
  const narrative = buildNarrative(
    weightForecast,
    composition,
    lifts,
    mind,
    scenarios,
    summary,
    weight,
    profile
  )

  return {
    generatedFrom: { start: days[0]?.date ?? '', end: lastDate, days: days.length },
    weight: weightForecast,
    composition,
    lifts,
    mind,
    scenarios,
    narrative,
    dataQuality: [
      {
        label: 'Weigh-ins',
        have: weight.observations,
        need: 8,
        ok: weight.observations >= 8,
        note: 'A weight trend needs 4 minimum; 8+ spread over a month makes the projection tight.',
      },
      {
        label: 'Days with food logged',
        have: summary.daysWithFood,
        need: 21,
        ok: summary.daysWithFood >= 21,
        note: 'Drives the energy-balance cross-check and every calorie scenario.',
      },
      {
        label: 'Days logged at all',
        have: summary.daysLogged,
        need: Math.round(summary.days * 0.7),
        ok: summary.daysLogged >= summary.days * 0.7,
        note: 'Below 70% coverage the averages skew toward your better days.',
      },
      {
        label: 'Sleep entries',
        have: days.filter((d) => d.sleepH != null).length,
        need: 14,
        ok: days.filter((d) => d.sleepH != null).length >= 14,
        note: 'Needed before sleep can be linked to intake or mood.',
      },
      {
        label: 'Mood or day ratings',
        have: days.filter((d) => d.mood != null || d.dayRating != null).length,
        need: 14,
        ok: days.filter((d) => d.mood != null || d.dayRating != null).length >= 14,
        note: 'The mental-health trend needs 6 minimum; 14 makes it meaningful.',
      },
      {
        label: 'Body fat measurement',
        have: 0,
        need: 1,
        ok: false,
        note: 'A DEXA scan or caliper reading would replace the BMI-based estimate with something real.',
      },
    ],
  }
}

/** Average of a numeric field — re-exported for callers assembling scenarios. */
export const avgOf = mean

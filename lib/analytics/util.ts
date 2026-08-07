/**
 * Shared numeric and calendar helpers for the analytics engines.
 *
 * All date maths is done in UTC on `YYYY-MM-DD` strings. Entries carry a
 * calendar `log_date`, not an instant, so shifting into local time would move
 * days across boundaries for anyone east or west of UTC.
 */

export const nums = (a: (number | null | undefined)[]): number[] =>
  a.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

export const sum = (a: (number | null | undefined)[]): number => nums(a).reduce((s, v) => s + v, 0)

export const mean = (a: (number | null | undefined)[]): number | null => {
  const v = nums(a)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

/** Sample standard deviation. Null below two values. */
export const stdev = (a: (number | null | undefined)[]): number | null => {
  const v = nums(a)
  if (v.length < 2) return null
  const m = v.reduce((s, x) => s + x, 0) / v.length
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))
}

export const round = (v: number | null, dp = 0): number | null => {
  if (v === null || !Number.isFinite(v)) return null
  const f = 10 ** dp
  return Math.round(v * f) / f
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10)

export const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return isoDate(d)
}

export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86400000)

export const shortLabel = (iso: string): string =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const longLabel = (iso: string): string =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

export const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00.000Z`).getUTCDay()

/** Monday-anchored week start for an ISO date. */
export const weekStartOf = (iso: string): string => {
  const wd = weekdayOf(iso)
  return addDays(iso, wd === 0 ? -6 : 1 - wd)
}

// ---------------------------------------------------------------------------
// Regression
// ---------------------------------------------------------------------------

export interface Fit {
  slope: number
  intercept: number
  n: number
  /** Coefficient of determination — how much of the variance the line explains. */
  r2: number
  /** Residual standard error, in the units of y. */
  se: number
  meanX: number
  /** Σ(x − x̄)², needed for prediction intervals. */
  ssX: number
}

/**
 * Ordinary least squares fit of y over x, with the pieces a prediction interval
 * needs. Null when the fit is undefined (fewer than two points, or no spread
 * in x).
 */
export function linreg(xs: number[], ys: number[]): Fit | null {
  const n = xs.length
  if (n < 2) return null
  const meanX = xs.reduce((s, v) => s + v, 0) / n
  const meanY = ys.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let ssX = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
    ssX += (xs[i] - meanX) ** 2
  }
  if (ssX === 0) return null
  const slope = sxy / ssX
  const intercept = meanY - slope * meanX

  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2
    ssTot += (ys[i] - meanY) ** 2
  }
  return {
    slope,
    intercept,
    n,
    r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
    // n − 2 degrees of freedom; with exactly 2 points the line is exact and the
    // residual error is undefined, so report 0 rather than dividing by zero.
    se: n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0,
    meanX,
    ssX,
  }
}

/** Point estimate from a fit. */
export const predict = (fit: Fit, x: number): number => fit.intercept + fit.slope * x

/**
 * Half-width of the ~95% prediction interval for a single future observation at
 * `x`. Widens the further `x` sits from the data's centre, which is what makes a
 * long-horizon projection honestly less certain than a short one.
 */
export function predictionInterval(fit: Fit, x: number): number {
  if (fit.n <= 2 || fit.se === 0) return 0
  const t = 1.96 // normal approximation; fine at these sample sizes for a display band
  return t * fit.se * Math.sqrt(1 + 1 / fit.n + (x - fit.meanX) ** 2 / fit.ssX)
}

export function pearson(xs: number[], ys: number[]): number {
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

export const epley1RM = (weightKg: number, reps: number): number => Math.round(weightKg * (1 + reps / 30))

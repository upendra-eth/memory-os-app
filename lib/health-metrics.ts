import type { ActivityLevel, Gender, HealthMetrics } from './types'

/**
 * Calculate BMI (Body Mass Index)
 * BMI = weight (kg) / (height (m) ^ 2)
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10
}

/**
 * Get BMI category
 */
export function getBMICategory(bmi: number): string {
  if (bmi < 18.5) return 'Underweight'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Overweight'
  return 'Obese'
}

/**
 * Calculate BMR (Basal Metabolic Rate) using Mifflin-St Jeor equation
 * More accurate for modern populations
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: Gender
): number {
  if (gender === 'male') {
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + 5)
  } else {
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age - 161)
  }
}

/**
 * Get activity level multiplier
 */
export function getActivityMultiplier(activityLevel: ActivityLevel): number {
  const multipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  }
  return multipliers[activityLevel] || 1.55
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 * TDEE = BMR × Activity Level Multiplier
 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const multiplier = getActivityMultiplier(activityLevel)
  return Math.round(bmr * multiplier)
}

/**
 * Calculate ideal weight range based on height (using BMI 18.5-25)
 */
export function getIdealWeightRange(heightCm: number): { min: number; max: number } {
  const heightM = heightCm / 100
  const minWeight = 18.5 * heightM * heightM
  const maxWeight = 25 * heightM * heightM
  return {
    min: Math.round(minWeight * 10) / 10,
    max: Math.round(maxWeight * 10) / 10,
  }
}

/**
 * Calculate daily protein intake in grams based on weight and goal
 * General guidelines:
 * - Weight loss: 1.6-2.2g per kg
 * - Maintain: 0.8-1.0g per kg
 * - Muscle gain: 1.6-2.2g per kg
 */
export function calculateDailyProtein(
  weightKg: number,
  goal: 'lose_weight' | 'maintain' | 'gain_muscle'
): number {
  const proteinMultipliers = {
    lose_weight: 2.0,
    maintain: 1.0,
    gain_muscle: 2.0,
  }
  return Math.round(weightKg * proteinMultipliers[goal])
}

/**
 * Calculate daily calorie target based on goal
 */
export function calculateDailyCalories(
  tdee: number,
  goal: 'lose_weight' | 'maintain' | 'gain_muscle'
): number {
  if (goal === 'lose_weight') {
    return Math.round(tdee * 0.85) // 15% deficit
  } else if (goal === 'gain_muscle') {
    return Math.round(tdee * 1.1) // 10% surplus
  }
  return tdee // maintain
}

/**
 * Calculate all health metrics
 */
export function calculateHealthMetrics(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: Gender,
  activityLevel: ActivityLevel,
  nutritionGoal: 'lose_weight' | 'maintain' | 'gain_muscle'
): HealthMetrics {
  const bmi = calculateBMI(weightKg, heightCm)
  const bmr = calculateBMR(weightKg, heightCm, age, gender)
  const tdee = calculateTDEE(bmr, activityLevel)
  const ideal_weight_range = getIdealWeightRange(heightCm)
  const daily_protein_g = calculateDailyProtein(weightKg, nutritionGoal)
  const daily_calories = calculateDailyCalories(tdee, nutritionGoal)

  return {
    bmi,
    bmr,
    tdee,
    ideal_weight_range,
    daily_protein_g,
    daily_calories,
  }
}

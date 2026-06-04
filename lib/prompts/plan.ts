/** Prompt for turning a user's goals into a structured weekly exercise plan. */

export interface PlanExercise {
  name: string
  sets: string
  reps: string
  notes: string
}
export interface PlanDay {
  day: string
  focus: string
  exercises: PlanExercise[]
}
export interface ExercisePlan {
  summary: string
  weekly: PlanDay[]
  tips: string[]
}

export const exercisePlanPrompt = (opts: {
  goals: string
  daysPerWeek: number
  equipment: string
  profile?: string
}): string => `
You are a certified strength & conditioning coach. Build a practical, safe WEEKLY exercise plan for this person.

Their goal(s): ${opts.goals}
Training days per week: ${opts.daysPerWeek}
Equipment available: ${opts.equipment || 'not specified — assume a basic gym'}
${opts.profile ? `Profile: ${opts.profile}` : ''}

Return ONLY a single JSON object, no prose, EXACTLY:
{
  "summary": "2-3 sentence overview of the approach and how it serves the goal",
  "weekly": [
    {
      "day": "Monday",
      "focus": "e.g. Lower body / Push / Full body / Rest",
      "exercises": [
        { "name": "exercise name", "sets": "3", "reps": "8-10", "notes": "short cue or tempo, optional" }
      ]
    }
    // exactly 7 entries, Monday..Sunday. Rest days have focus "Rest" and an empty exercises array.
  ],
  "tips": ["3-5 short, actionable tips (progression, warm-up, recovery, nutrition pointer)"]
}

Rules:
- Exactly ${opts.daysPerWeek} training days; the remaining days are "Rest".
- Realistic volume (6-8 exercises max per training day). Use equipment they have.
- Include warm-up guidance in tips, not as a separate day.
- Be specific with sets/reps. No medical claims. Output only the JSON.
`

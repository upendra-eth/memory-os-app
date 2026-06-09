/**
 * Copy-paste prompt for importing a workout schedule the user already has
 * (built in ChatGPT or anywhere). The user runs this prompt with their
 * schedule, then pastes the JSON back; saveImportedPlan() stores it in the
 * same exercise_plans shape the AI generator uses (see lib/prompts/plan.ts).
 */
export const SCHEDULE_COPY_PROMPT = `Convert my workout schedule into a single JSON object. I'll paste my schedule below in whatever format I have (a table, bullet list, a week split, etc.).

Return ONLY a fenced JSON code block in EXACTLY this shape — no prose:

\`\`\`json
{
  "summary": "one-line description of the split",
  "weekly": [
    {
      "day": "Monday",
      "focus": "e.g. Push / Pull / Legs / Upper / Full body / Rest",
      "exercises": [
        { "name": "exercise name", "sets": "3", "reps": "8-10", "notes": "optional cue" }
      ]
    }
  ],
  "tips": ["optional short tips"]
}
\`\`\`

Rules:
- "weekly" MUST have exactly 7 entries, Monday through Sunday.
- Days I don't train are "focus": "Rest" with an empty "exercises" array.
- Keep my exercise names as I wrote them. Output only the JSON.

MY SCHEDULE:
[paste your schedule here]`

/**
 * Prompt for the weekly / monthly AI review (insights hub → Review tab).
 * Takes a compact, pre-aggregated summary (never raw entries) to keep tokens low.
 */
export function getReviewPrompt(period: 'week' | 'month', summary: Record<string, unknown>): string {
  return `You are a thoughtful personal coach reviewing someone's life-log data for the past ${period}.

Here is their aggregated data for the period (JSON):
${JSON.stringify(summary, null, 2)}

Write a concise, encouraging ${period}ly review in markdown. Be specific and use their numbers. Structure it as:

## How your ${period} went
2-3 sentences summarizing the overall arc (training, nutrition, sleep, mood) using the averages.

## Wins
3-5 bullet points drawn from their wins/highlights (paraphrase, don't just copy).

## Patterns I noticed
2-4 bullets connecting metrics (e.g. sleep vs mood, calorie deficit vs energy, training consistency). Only claim patterns the data supports.

## Focus for next ${period}
2-3 concrete, actionable suggestions based on the blockers, lessons, and any weak spots in the numbers.

Rules:
- Warm but honest; no hype, no fabricated numbers.
- If days_logged is low, gently note that more consistent logging will sharpen insights.
- Keep the whole thing under ~250 words. Markdown only, no preamble.`
}

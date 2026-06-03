/**
 * End-to-end test of the entry pipeline against a REAL ChatGPT paste.
 *
 * Runs the exact production normalizer prompt + JSON mode + sanitizer that
 * app/entry-actions.ts uses, against example-text/22may.txt, then reports
 * which facts survived and which were lost.
 *
 * Run with:  npx tsx scripts/test-flow.ts [path-to-paste.txt]
 */
import { readFileSync } from 'node:fs'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getNormalizerPrompt } from '../lib/prompts/normalizer'
import { sanitizeExtractedJSON, isEmptyExtractedJSON } from '../lib/extraction-schema'
import { parseThreeSectionPaste } from '../lib/parse-entry'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY

function parseJsonFromModel(responseText: string): unknown {
  let text = responseText.trim()
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) text = fenceMatch[1].trim()
  try {
    return JSON.parse(text)
  } catch {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first !== -1 && last > first) return JSON.parse(text.slice(first, last + 1))
    throw new Error('No JSON in response')
  }
}

async function main() {
  if (!GEMINI_API_KEY) {
    console.error('❌ NEXT_PUBLIC_GEMINI_API_KEY missing')
    process.exit(1)
  }

  const file = process.argv[2] || 'example-text/22may.txt'
  const full = readFileSync(file, 'utf8')
  const parsed = parseThreeSectionPaste(full)

  console.log(`\n=== INPUT: ${file} ===`)
  console.log(`raw: ${parsed.raw.length} chars | narrative: ${parsed.narrative.length} chars | extracted: ${parsed.extracted.length} chars\n`)

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  })

  const t0 = Date.now()
  const result = await model.generateContent(getNormalizerPrompt(parsed.extracted, {}))
  console.log(`⏱  Gemini responded in ${Date.now() - t0}ms`)

  const raw = parseJsonFromModel(result.response.text())
  const clean = sanitizeExtractedJSON(raw)

  console.log('\n=== SANITIZED (what would be saved) ===')
  console.dir(clean, { depth: null })
  console.log(`\nempty? ${isEmptyExtractedJSON(clean)}`)

  // ---- Gap analysis against known facts in 22may.txt ----
  console.log('\n=== GAP ANALYSIS (22may.txt) ===')
  const checks: [string, boolean, string][] = [
    ['body.weight 83kg', clean.body?.weight_today_kg === 83, String(clean.body?.weight_today_kg)],
    ['6 workouts', (clean.workouts?.length ?? 0) === 6, `${clean.workouts?.length} workouts`],
    ['multi-set per exercise preserved', (clean.workouts?.[0]?.set_log?.length ?? 0) > 0, `incline press has ${clean.workouts?.[0]?.set_log?.length ?? 0} sets logged`],
    ['nutrition items (11 foods)', (clean.nutrition?.length ?? 0) >= 8, `${clean.nutrition?.length} items`],
    ['meal grouping (5 meals)', clean.nutrition?.some((n) => n.meal_type != null) ?? false, 'meal_type present?'],
    ['daily totals (~1948 kcal)', (clean.daily_totals?.kcal ?? 0) > 1000, `${clean.daily_totals?.kcal} kcal, ${clean.daily_totals?.protein_g}g protein`],
    ['TDEE comparison (2456)', (clean.energy_balance?.tdee_kcal ?? 0) > 1000, `tdee ${clean.energy_balance?.tdee_kcal}, status ${clean.energy_balance?.status}`],
    ['workout kcal burned (~1345)', (clean.energy_balance?.workout_kcal_burned ?? 0) > 0 || (clean.workouts?.some((w) => w.kcal_burned != null) ?? false), `eb.burn=${clean.energy_balance?.workout_kcal_burned}`],
    ['reflection rating 8.5', clean.reflection?.rating_1_10 != null, String(clean.reflection?.rating_1_10)],
    ['muscles_trained list', (clean.workouts?.some((w) => (w.muscles?.length ?? 0) > 0)) ?? false, 'on workouts only'],
    ['entities.foods', (clean.entities?.foods?.length ?? 0) > 0, `${clean.entities?.foods?.length} foods`],
    ['audit items flagged', (clean.audit?.length ?? 0) > 0, `${clean.audit?.length} audit items`],
  ]
  for (const [label, ok, detail] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${label.padEnd(38)} ${detail}`)
  }
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})

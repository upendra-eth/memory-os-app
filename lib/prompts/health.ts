/**
 * Health-hub prompts. Intake is paste-from-ChatGPT: the user runs one of the
 * COPY_PROMPT strings in ChatGPT alongside their report PDF/image, then pastes
 * the JSON reply back into the app. The app parses that JSON directly; if it
 * isn't clean JSON, the *_normalize functions below ask Gemini flash-lite to
 * coerce the pasted text into the expected shape as a fallback.
 */

// ---- Health reports (labs / full-body checkup / body-composition scans) ----

export const REPORT_COPY_PROMPT = `You are a medical report digitizer. I will give you a lab report, full-body health checkup, or a body-composition scan (e.g. an InBody/gym body-analysis printout) as text, a PDF, or a photo.

Read EVERY value and return ONLY a single fenced JSON code block in EXACTLY this shape (no prose before or after):

\`\`\`json
{
  "report_type": "lab | checkup | body_composition",
  "test_name": "short title, e.g. 'Complete Blood Count' or 'InBody 770'",
  "test_date": "YYYY-MM-DD or null",
  "markers": [
    { "name": "marker name", "value": 0, "unit": "", "reference_min": null, "reference_max": null, "flag": "low | normal | high | null" }
  ],
  "summary": "2-4 sentences in plain language. Educational only, never a diagnosis.",
  "notable": ["one short note per out-of-range or noteworthy marker"]
}
\`\`\`

Rules:
- Capture all numeric markers. For body-composition include weight, body fat %, skeletal muscle mass, BMR, visceral fat, body water, etc.
- value must be a number when possible; keep the unit separate. Use null for unknown reference ranges.
- Set "flag" by comparing value to the reference range when one exists, else null.
- Do NOT diagnose. Keep "summary" educational and end with a gentle "discuss with your doctor" only inside the summary if anything is out of range.
- Output the JSON block and nothing else.`

export interface HealthMarker {
  name: string
  value: number | string | null
  unit?: string | null
  reference_min?: number | null
  reference_max?: number | null
  flag?: 'low' | 'normal' | 'high' | null
}

export interface HealthReportJSON {
  report_type: 'lab' | 'checkup' | 'body_composition'
  test_name: string
  test_date: string | null
  markers: HealthMarker[]
  summary: string
  notable: string[]
}

export const reportNormalizePrompt = (pasted: string): string => `
Convert the following pasted health report text into a single JSON object with EXACTLY these keys:
{
  "report_type": "lab | checkup | body_composition",
  "test_name": "string",
  "test_date": "YYYY-MM-DD or null",
  "markers": [{ "name": "string", "value": number|string|null, "unit": "string", "reference_min": number|null, "reference_max": number|null, "flag": "low|normal|high|null" }],
  "summary": "2-4 sentence plain-language educational summary, never a diagnosis",
  "notable": ["short note per noteworthy marker"]
}
Capture every marker. Infer report_type (body-composition/InBody → "body_composition"; routine panels → "lab"; multi-system checkup → "checkup"). Return ONLY the JSON.

PASTED REPORT:
${pasted}
`

// ---- Ongoing issues / concerns --------------------------------------------

export const ISSUE_COPY_PROMPT = `I want to log an ongoing health issue I'm experiencing (e.g. hair fall, lower-back pain, bad posture, acne, poor sleep, bloating, low energy). I'll describe it in my own words.

Return ONLY a single fenced JSON code block in EXACTLY this shape:

\`\`\`json
{
  "title": "short title, e.g. 'Hair fall'",
  "category": "pain | posture | hair | skin | sleep | digestion | mental | energy | other",
  "description": "1-2 sentences restating the issue in my words",
  "severity_1_10": 0,
  "started_on": "YYYY-MM-DD or null",
  "status": "active"
}
\`\`\`

Pick the closest category. Use null for severity or start date if I didn't say. Output only the JSON.`

export interface HealthIssueJSON {
  title: string
  category: string
  description: string
  severity_1_10: number | null
  started_on: string | null
  status: 'active' | 'improving' | 'resolved'
}

export const issueStructurePrompt = (text: string): string => `
Turn this free-text description of an ongoing health issue into a single JSON object with EXACTLY these keys:
{
  "title": "short title",
  "category": "pain | posture | hair | skin | sleep | digestion | mental | energy | other",
  "description": "1-2 sentences in the user's words",
  "severity_1_10": number|null,
  "started_on": "YYYY-MM-DD or null",
  "status": "active"
}
Pick the closest category. Use null when not stated. Return ONLY the JSON.

DESCRIPTION:
${text}
`

/**
 * Normalizer prompt for Gemini 2.0 Flash
 * Takes the EXTRACTED section from ChatGPT output + known entities
 * Returns strict JSON matching ExtractedJSON schema
 */

export function getNormalizerPrompt(
  extractedText: string,
  knownEntities: Record<string, string[]>
): string {
  return `You are a data normalizer for a personal life-logging app. Your job is to parse unstructured extracted data and normalize it to a strict JSON schema.

INPUT:
The user has extracted life data with these sections:
${extractedText}

KNOWN ENTITIES (use these canonical names):
${JSON.stringify(knownEntities, null, 2)}

SCHEMA (return JSON matching this structure, include ALL fields, use null for missing values):
{
  "log_date": "YYYY-MM-DD — the calendar date this entry is about (use the 'date:' field from the input if present), else null",
  "body": {
    "sleep_hours": number or null,
    "sleep_quality_1_10": number 1-10 or null,
    "energy_curve": [{ "time_of_day": string, "level": number 1-10 }] or null,
    "hydration_l": number or null,
    "digestion_note": string or null,
    "weight_today_kg": number or null
  },
  "nutrition": [
    {
      "item": "canonical food name from KNOWN ENTITIES if exists, else best guess",
      "portion": "quantity description",
      "est_kcal": number,
      "protein_g": number or null,
      "carbs_g": number or null,
      "fat_g": number or null,
      "fiber_g": number or null,
      "meal_type": "breakfast|lunch|dinner|snack",
      "time": "HH:MM" or null
    }
  ],
  "workouts": [
    {
      "exercise": "canonical exercise name from KNOWN ENTITIES if exists, else best guess",
      "set_log": [
        {
          "weight_kg": number (load lifted) or null,
          "reps": number or null,
          "assist_kg": number (assistance load for assisted movements like assisted pull-ups) or null,
          "rpe_1_10": number 1-10 or null
        }
      ],
      "sets": number (count of sets, e.g. set_log.length) or null,
      "reps": number (reps of the heaviest/top set) or null,
      "weight_kg": number (weight of the heaviest/top set) or null,
      "rpe_1_10": number 1-10 or null,
      "muscles": ["muscle groups"],
      "duration_min": number or null,
      "kcal_burned": number or null,
      "met_used": number or null,
      "notes": string or null
    }
  ],
  "cardio": [
    {
      "type": "running|cycling|swimming|elliptical|rowing|other",
      "duration_min": number,
      "distance_km": number or null,
      "avg_hr": number or null,
      "kcal_burned": number or null
    }
  ],
  "symptoms": [
    {
      "name": string,
      "location": string or null,
      "intensity_1_10": number 1-10,
      "duration_min": number or null,
      "trigger": string or null
    }
  ],
  "emotions": [
    {
      "feeling": string,
      "intensity_1_10": number 1-10,
      "trigger": string or null,
      "duration_min": number or null
    }
  ],
  "mental": {
    "stress_1_10": number 1-10 or null,
    "anxiety_1_10": number 1-10 or null,
    "focus_1_10": number 1-10 or null,
    "motivation_1_10": number 1-10 or null,
    "rumination_note": string or null
  },
  "cognition": {
    "ideas": ["idea descriptions"],
    "insights": ["insight descriptions"],
    "questions": ["unanswered questions"],
    "decisions": ["decisions made"],
    "problems": ["problems identified"]
  },
  "self_talk": [
    {
      "text": "quote of what was thought or said",
      "type": "belief|distortion|identity"
    }
  ],
  "work": {
    "tasks_done": ["task descriptions"],
    "tasks_pending": ["task descriptions"],
    "meetings": [
      {
        "with": "person or group name",
        "topic": "meeting topic",
        "outcome": "what was decided or discussed"
      }
    ],
    "wins": ["accomplishment descriptions"],
    "blockers": ["blocker descriptions"],
    "learnings": ["learning descriptions"],
    "deep_work_min": number of minutes of focused deep work
  },
  "inputs": [
    {
      "type": "book|podcast|article|conversation|video",
      "name": "title or description",
      "takeaway": "key takeaway"
    }
  ],
  "social": [
    {
      "person": "person's name from KNOWN ENTITIES if exists, else best guess",
      "relationship": "friend|family|colleague|acquaintance",
      "mode": "in_person|call|text|video",
      "quality_1_10": number 1-10 or null,
      "topic": "what was discussed",
      "support_direction": "gave|received|mutual"
    }
  ],
  "habits": [
    {
      "name": "habit name",
      "status": "done|skipped"
    }
  ],
  "context": {
    "location": string or null,
    "weather": string or null,
    "screen_time_min": number or null
  },
  "values": [
    {
      "type": "gratitude|meditation|purpose",
      "note": "brief note"
    }
  ],
  "goals": [
    {
      "name": "goal description",
      "status": "progressed|revised|set_for_tomorrow",
      "note": "brief note"
    }
  ],
  "reflection": {
    "rating_1_10": number 1-10,
    "high": "best part of the day",
    "low": "worst part of the day",
    "lesson": "lesson learned"
  },
  "money": [
    {
      "type": "expense|income|decision",
      "amount": number,
      "currency": "USD|INR|GBP|EUR|etc",
      "note": "description"
    }
  ],
  "daily_totals": {
    "kcal": number (total calories consumed for the day) or null,
    "protein_g": number or null,
    "carbs_g": number or null,
    "fat_g": number or null,
    "fiber_g": number or null
  },
  "energy_balance": {
    "tdee_kcal": number (total daily energy expenditure) or null,
    "intake_kcal": number (calories consumed) or null,
    "workout_kcal_burned": number (calories burned in training) or null,
    "balance_kcal": number (intake minus expenditure; negative = deficit) or null,
    "status": "deficit|surplus|maintenance" or null
  },
  "entities": {
    "people": ["resolved names from KNOWN ENTITIES"],
    "places": ["resolved names from KNOWN ENTITIES"],
    "foods": ["resolved names from KNOWN ENTITIES"],
    "exercises": ["resolved names from KNOWN ENTITIES"]
  },
  "audit": [
    {
      "field": "path.to.field that needs review",
      "reason": "guessed|ambiguous_name|missing_qty|new_entity|profile_sync",
      "note": "why this needs review"
    }
  ]
}

RULES:
1. Use canonical names from KNOWN ENTITIES whenever possible. If a name is NEW (not in the list), add ONE audit item with reason "new_entity". If a name is genuinely AMBIGUOUS between two known entities, add one with reason "ambiguous_name".
2. WORKOUTS: capture EVERY set in "set_log" — one object per set with its own weight/reps. Never collapse multiple sets into a single number and never dump set data into "notes". For assisted movements (e.g. assisted pull-ups) put the assistance load in "assist_kg". Set the summary "sets"/"reps"/"weight_kg" from the set count and the heaviest (top) set.
3. TOTALS: if the source provides day-level nutrition totals, copy them into "daily_totals". If the source mentions TDEE, calorie balance, deficit/surplus, or workout calorie burn, fill "energy_balance" accordingly (balance_kcal negative = deficit).
4. For foods: estimate calories using standard nutrition databases. Include protein/carbs/fat if possible. Only add an audit item with reason "missing_qty" when a quantity is truly unspecified AND material to the estimate.
5. For workouts: use MET values to estimate "kcal_burned" / "duration_min" if known.
6. For numbers: use null if not provided or unguessable. Never fabricate.
7. For arrays: use empty array [] if no items, never null.
8. For dates/times: use ISO format or HH:MM format as specified.
9. All intensity ratings should be 1-10 scale. All percentages should be 0-100 range.
10. AUDIT IS NOT A CHANGELOG. Do NOT create audit items for source fields that don't fit this schema — simply omit them. Do NOT add an audit item for every guessed calorie value. Only flag things a human genuinely needs to resolve: new_entity, ambiguous_name, missing_qty (material), or profile_sync. Aim for FEW, high-signal audit items (typically 0-5), never one per field. At MOST ONE audit item per food/meal or per entity — never flag the same item's est_kcal, protein, carbs, fat and fiber as five separate audits; collapse them into one.
11. MAP SOURCE ALIASES to the schema — the input may use different section names:
    - "behavior", "positive_habits", or any habit done/maintained → habits[] with status "done". A skipped/missed/broken habit → habits[] with status "skipped".
    - A resisted craving or resisted "urge" → habits[] (status "done", name like "resisted <X>"). An urge acted on → habits[] (status "skipped").
    - "tomorrow_focus", "goals(tomorrow)", or any next-day intention → goals[] with status "set_for_tomorrow".
    - "behavior" may contain BOTH positives and urges in one line — capture EACH as its own habit, don't pick just one.

RETURN ONLY VALID JSON, no markdown, no explanations. Start with { and end with }.`
}

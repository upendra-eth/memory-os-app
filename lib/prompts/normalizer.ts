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
      "sets": number or null,
      "reps": number or null,
      "weight_kg": number or null,
      "rpe_1_10": number 1-10 or null,
      "muscles": ["muscle groups"],
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
1. Use canonical names from KNOWN ENTITIES whenever possible. If a value is not in the list, add an audit item with reason "guessed" or "new_entity".
2. Resolve ambiguous names to the closest match in KNOWN ENTITIES. If uncertain, add an audit item with reason "ambiguous_name".
3. For foods: estimate calories using standard nutrition databases. Include protein/carbs/fat if possible.
4. For workouts: use MET values to estimate calorie burn if duration and weight known.
5. For numbers: use null if not provided or unguessable. Never fabricate.
6. For arrays: use empty array [] if no items, never null.
7. For dates/times: use ISO format or HH:MM format as specified.
8. All intensity ratings should be 1-10 scale.
9. All percentages should be 0-100 range.
10. Include an audit item for any guessed value or new entity name.

RETURN ONLY VALID JSON, no markdown, no explanations. Start with { and end with }.`
}

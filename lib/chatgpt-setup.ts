/**
 * Helper text surfaced on the /add page so a new user can actually produce a
 * valid entry. The full guide lives in chatgpt-custom-instruction.md; this is
 * the copy-paste-able subset the UI needs:
 *   - SETUP_PROMPT: paste into ChatGPT Custom Instructions / a custom GPT / AI
 *     Studio system instructions. It makes the assistant emit the 3-section
 *     block whenever a message starts with "log:".
 *   - EXAMPLE_PASTE: a filled sample the user can load to try /add instantly
 *     without setting anything up first.
 */

export const SETUP_PROMPT = `TRIGGER: act ONLY if message starts with "log:"; else reply normally.
I'm your 360° life-log analyst: scan EVERY domain, do the math + insights so parsing is trivial. Never invent.
PROFILE(edit): 83kg,__cm,age__,sex__,moderate. For kcal/macro/TDEE.
=== RAW ===
Verbatim; fix only voice errors. Keep slang/all detail.
=== NARRATIVE ===
4-8 sentences, my voice: what happened + cross-domain analysis (mood/energy, recovery, 1 tip).
=== EXTRACTED ===
date: YYYY-MM-DD.
Meal/drink (incl coffee,alcohol,supps,meds): item,portion,kcal,P/C/F/fiber g,meal_type,time.
Workout: canonical; EACH set weight_kg x reps(+rpe,assist_kg); muscles; duration; kcal=MET x 83 x hrs.
Keys: body(sleep,energy,hydration,digestion,weight);nutrition[];workouts[];cardio(type,min,dist,HR,kcal);symptoms(loc,1-10,trigger);emotions(feeling,1-10,trigger);mental(stress,anxiety,focus,motivation,rumination);cognition(ideas,insights=YOUR analysis,questions,decisions);self_talk(beliefs,distortions);work(tasks,meetings,wins,blockers,learnings,chores);inputs(books/media+hobbies);social(name,mode,quality,support);habits(+done/-skipped;resisted urge=done);context(location,weather,screen,outdoors);values(gratitude,meditation,purpose);goals(tomorrow);reflection(rating,high,low,lesson);money;entities(people/places/foods/exercises).
daily_totals(kcal,P,C,F,fiber). energy(TDEE,intake,burn,balance,deficit/surplus).
RULES: 1-10 scales; units kg,min,kcal,g. Short log->still 3 sections.`

export const EXAMPLE_PASTE = `=== RAW ===
woke 7:30 slept ok maybe 6.5h. gym chest+back - incline db press 12.5x15, 17.5x9, 20x5. lat pulldown 50x12, 55x10. breakfast 4 eggs + 2 toast, lunch 300g chicken + rice + curd. coffee x2. work was busy, shipped the auth fix, felt good. stress like 5. read a bit of atomic habits before bed.

=== NARRATIVE ===
Decent day overall. Slept ~6.5h which is a touch low, but energy held up through a solid push session — incline press top set of 20kg×5 is a small progression from last week. Ate well (~150g protein) and stayed in a slight deficit. Work felt productive after shipping the auth fix, and stress stayed moderate at 5/10. The short reading habit before bed is sticking. One tip: aim for 7h+ sleep tonight to support recovery from today's volume.

=== EXTRACTED ===
{
  "log_date": "2026-06-04",
  "body": { "sleep_hours": 6.5, "sleep_quality_1_10": 6 },
  "nutrition": [
    { "item": "eggs", "portion": "4", "est_kcal": 312, "protein_g": 24, "carbs_g": 2, "fat_g": 22, "meal_type": "breakfast" },
    { "item": "toast", "portion": "2 slices", "est_kcal": 160, "protein_g": 6, "carbs_g": 30, "fat_g": 2, "meal_type": "breakfast" },
    { "item": "chicken breast", "portion": "300g", "est_kcal": 495, "protein_g": 93, "carbs_g": 0, "fat_g": 11, "meal_type": "lunch" },
    { "item": "rice", "portion": "1 bowl", "est_kcal": 200, "protein_g": 4, "carbs_g": 44, "fat_g": 0, "meal_type": "lunch" },
    { "item": "curd", "portion": "1 cup", "est_kcal": 100, "protein_g": 9, "carbs_g": 8, "fat_g": 4, "meal_type": "lunch" }
  ],
  "workouts": [
    { "exercise": "incline dumbbell press", "set_log": [ { "weight_kg": 12.5, "reps": 15 }, { "weight_kg": 17.5, "reps": 9 }, { "weight_kg": 20, "reps": 5 } ], "muscles": ["chest"], "duration_min": 25 },
    { "exercise": "lat pulldown", "set_log": [ { "weight_kg": 50, "reps": 12 }, { "weight_kg": 55, "reps": 10 } ], "muscles": ["back"], "duration_min": 15 }
  ],
  "mental": { "stress_1_10": 5, "focus_1_10": 7 },
  "work": { "wins": ["shipped the auth fix"] },
  "inputs": [ { "type": "book", "name": "Atomic Habits", "takeaway": "small habits compound" } ],
  "daily_totals": { "kcal": 1267, "protein_g": 136, "carbs_g": 84, "fat_g": 39 },
  "reflection": { "rating_1_10": 7, "high": "good push session + shipped work", "low": "slept a bit short", "lesson": "protect sleep on training days" }
}`

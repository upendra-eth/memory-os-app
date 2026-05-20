# Phase 2: Entry Pipeline & Gemini Normalizer ✅

## Summary
Phase 2 implements the complete entry ingestion pipeline. Users paste ChatGPT output (with === RAW ===, === NARRATIVE ===, === EXTRACTED === sections), the app parses the sections, calls Gemini 2.5 Flash Lite to normalize the EXTRACTED data to a strict JSON schema, generates embeddings, creates audit items for flagged data, and updates daily aggregates. Full end-to-end working flow.

## Database Dependencies
Uses all tables from Phase 1:
- **entries**: Stores raw paste, narrative, extracted_json, summary, embedding
- **entities**: Tracks known people, foods, exercises, places
- **audit_items**: Flags data needing human review (guessed values, ambiguous names, new entities)
- **daily_aggregates**: Rolls up calories, sleep, mood, workout counts per day

## Implemented Features

### 1. Extraction Schema (`lib/extraction-schema.ts`)
Complete TypeScript types for all 20 life dimensions:
- **Body**: sleep hours/quality, energy curve, hydration, weight
- **Nutrition[]**: food item, portion, kcal, macros, meal type, time
- **Workouts[]**: exercise, sets/reps, weight, RPE, muscles, kcal, MET
- **Cardio[]**: type, duration, distance, avg HR, kcal
- **Symptoms[]**: name, location, intensity, duration, trigger
- **Emotions[]**: feeling, intensity, trigger, duration
- **Mental**: stress/anxiety/focus/motivation/rumination
- **Cognition**: ideas, insights, questions, decisions, problems
- **Self Talk[]**: text, type (belief/distortion/identity)
- **Work**: tasks done/pending, meetings, wins, blockers, learnings, deep work min
- **Inputs[]**: type (book/podcast/article/conversation/video), name, takeaway
- **Social[]**: person, relationship, mode, quality, topic, support direction
- **Habits[]**: name, status (done/skipped)
- **Context**: location, weather, screen time
- **Values[]**: type (gratitude/meditation/purpose), note
- **Goals[]**: name, status (progressed/revised/set_for_tomorrow), note
- **Reflection**: day rating, high, low, lesson
- **Money[]**: type (expense/income/decision), amount, currency, note
- **Entities**: people, places, foods, exercises (resolved from known list)
- **Audit[]**: field paths needing review + reasons

Includes validators and empty template generator.

### 2. Gemini Normalizer Prompt (`lib/prompts/normalizer.ts`)
Comprehensive prompt that:
- Accepts EXTRACTED text + known entities list
- Returns strict JSON matching ExtractedJSON schema
- Resolves entity names to canonical forms (e.g., "Priya" → existing "Priya Sharma")
- Estimates calories for foods using nutrition databases
- Calculates MET-based calorie burn for workouts
- Flags guessed values, ambiguous names, missing quantities
- Uses null for missing values (never fabricates)
- Includes detailed schema in prompt for consistent output

### 3. Entry Actions Server (`app/entry-actions.ts`)
Core functions for the pipeline:
- **parseThreeSectionPaste()**: Regex-based section extraction (RAW, NARRATIVE, EXTRACTED)
- **getKnownEntities()**: Fetch entities from database by type
- **normalizeWithGemini()**: Call Gemini with normalizer prompt, return ExtractedJSON
- **generateEmbedding()**: Create vector using Gemini embedding-001
- **saveEntry()**: Full pipeline orchestration - creates entry, processes entities, creates audit items, updates daily aggregates
- **generateSummary()**: Create human-readable summary from extracted data
- **processEntities()**: Upsert entity mentions to database
- **createAuditItems()**: Create audit queue items for flagged fields
- **updateDailyAggregates()**: Roll up daily stats (calories, sleep, mood, workouts)

All functions include proper error handling and return status objects.

### 4. Entry Form Component (`components/entry-form.tsx`)
User-facing form with:
- Large textarea for ChatGPT paste
- Real-time section validation
- Step-by-step processing status display ("Parsing", "Fetching entities", "Normalizing", "Saving")
- Success card showing entry summary + audit item count
- Error alerting with specific messages
- Disabled state during processing
- Toast notifications on completion

Includes clear instructions at top.

### 5. Add Entry Page (`app/add/page.tsx`)
Dedicated page for the entry pipeline at `/add`:
- Clean layout with title + description
- Hosts EntryForm component
- Gradient background consistent with app theme

### 6. Navigation Updates
Updated nav bar to include:
- Changed main dashboard link from `/` to `/dashboard`
- Added primary `/add` route (Add Entry with Plus icon)
- Reordered as: Dashboard → Add Entry → Ask → Explore → Ingestor
- Add Entry now secondary in dashboard cards with highlight styling

## Full Pipeline Flow

1. **User Pastes ChatGPT Output**
   - 3 sections: === RAW ===, === NARRATIVE ===, === EXTRACTED ===
   - App parses with regex on `===` boundaries

2. **Fetch Known Entities**
   - Query entities table for people, foods, exercises, places
   - Pass as reference list to Gemini

3. **Gemini Normalization** (2.5 Flash Lite)
   - Gemini receives: EXTRACTED text + known entities
   - Gemini returns: Structured JSON matching schema
   - ~2-5 second latency (within free tier limits)

4. **Generate Embedding**
   - Call Gemini embedding-001 on narrative text
   - Store vector in entries.embedding

5. **Save Entry**
   - Insert into entries table (raw_text, narrative, extracted_json, embedding)
   - Generate summary from extracted data

6. **Process Entities**
   - Extract people, foods, exercises, places from extracted.entities
   - Upsert to entities table with mention_count++
   - Link via entry_entities join table

7. **Create Audit Items**
   - For each item in extracted.audit array
   - Create audit_items row with reason (guessed|ambiguous|missing_qty|new_entity)
   - Status: pending (user can review/confirm later)

8. **Update Daily Aggregates**
   - Roll up today's data: calories, sleep, mood, workouts
   - Use upsert on (user_id, log_date) composite key

9. **Show Confirmation**
   - Display success card with summary
   - Show "5 items need your review in Audit Inbox"
   - User can close and explore, or go to /audit

## Gemini API Usage (Free Tier Optimized)
- **Model**: gemini-2.5-flash-lite
- **Calls per entry**: 2 (normalizer + embedding)
- **RPM Limit**: 10 requests/minute
- **TPM Limit**: 250,000 tokens/month
- **Strategy**: Single normalizer call (not multi-step), inline embedding

## File Structure
```
app/
  add/
    page.tsx                 # Add entry page
  entry-actions.ts           # Server actions
lib/
  extraction-schema.ts       # 20-dimension TypeScript types
  prompts/
    normalizer.ts            # Gemini normalizer prompt
components/
  entry-form.tsx             # Form UI
  navigation.tsx             # Updated nav with /add route
```

## Key Design Decisions

1. **Section Parsing**: Regex on `=== HEADER ===` boundaries
   - Simple, reliable, matches ChatGPT output format
   - Works even if sections are slightly malformed

2. **Schema Completeness**: All 20 dimensions included
   - Empty arrays for list fields (never null)
   - Null for optional numeric fields
   - Maintains consistency for later analysis

3. **Entity Resolution**: Known entities list sent to Gemini
   - Prevents duplicate entries (Priya ≠ Priya Sharma)
   - Gemini intelligently matches variants
   - New entities still created + flagged for review

4. **Audit Queue**: Every guessed value gets flagged
   - User can batch review in /audit (Phase 8)
   - Confidence scores implicit in reason codes
   - No data loss - flagged items still saved

5. **Embedding Strategy**: Single call on narrative
   - Narrative is user's own words (good for semantic search)
   - Avoids cost of embedding full extracted JSON
   - Later phases use embeddings for /ask similarity search

## Testing Notes
- Form accepts 3-section paste and validates sections
- Gemini calls succeed with ~2-5s latency
- Entities created and mention_count incremented
- Audit items created for flagged fields
- Daily aggregates upserted correctly
- TypeScript passes full check
- All server actions have proper error handling

## RPM Throttling Strategy
Since free tier has 10 RPM limit:
- Each entry = 2 API calls (normalizer + embedding)
- Max 5 entries/minute to stay safe
- For more: implement request queue + caching
- Phase 2 assumes single user testing
- Production would need queue system (Phase future)

## Next Phase (Phase 3)
Implement **Timeline & Day View**:
1. Fetch entries for selected date
2. Group by time and entry type
3. Show stats strip (sleep, kcal in/out, mood, workouts)
4. Prev/next navigation
5. Layout: vertical chronological feed

## Metrics
- 1 extraction schema (20 dimensions) ✅
- 1 normalizer prompt ✅
- 6 server action functions ✅
- 1 entry form component ✅
- 1 add page ✅
- Full end-to-end pipeline ✅
- ~1100 lines of code ✅
- Zero TypeScript errors ✅

**Phase 2 Complete! Ready for Phase 3.**

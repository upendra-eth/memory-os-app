-- =============================================================================
-- fix-schema-drift.sql — repair tables that predate the current base-schema.
--
-- WHY: base-schema.sql uses CREATE TABLE IF NOT EXISTS, so on a project whose
-- `entities` / `daily_aggregates` tables were created from an OLDER schema, the
-- newer columns and UNIQUE constraints in the file were never applied. The app
-- then silently fails to write these tables, because:
--   • daily_aggregates upsert needs UNIQUE (user_id, log_date)        — missing
--   • entities upsert writes mention_count + UNIQUE(user_id,type,name) — missing
-- Both failures are swallowed by try/catch in saveEntry(), so entries still
-- save but trends + entities stay empty.
--
-- Symptoms this fixes: empty dashboard trend charts, empty entity autocomplete.
-- Idempotent and safe to re-run. Run in the Supabase SQL editor.
-- =============================================================================

-- ---- entities: add columns that may be missing on legacy tables -------------
ALTER TABLE entities ADD COLUMN IF NOT EXISTS mention_count INT DEFAULT 1;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE entities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ---- entities: UNIQUE (user_id, entity_type, entity_name) -------------------
-- Required for the processEntities() upsert's ON CONFLICT. Dedupe any existing
-- duplicates first (keep the lowest id) so the constraint can be added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entities_user_type_name_key'
  ) THEN
    DELETE FROM entities a USING entities b
      WHERE a.id > b.id
        AND a.user_id = b.user_id
        AND a.entity_type = b.entity_type
        AND a.entity_name = b.entity_name;
    ALTER TABLE entities
      ADD CONSTRAINT entities_user_type_name_key UNIQUE (user_id, entity_type, entity_name);
  END IF;
END $$;

-- ---- daily_aggregates: UNIQUE (user_id, log_date) ---------------------------
-- Required for the updateDailyAggregates() upsert's ON CONFLICT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_aggregates_user_date_key'
  ) THEN
    DELETE FROM daily_aggregates a USING daily_aggregates b
      WHERE a.id > b.id
        AND a.user_id = b.user_id
        AND a.log_date = b.log_date;
    ALTER TABLE daily_aggregates
      ADD CONSTRAINT daily_aggregates_user_date_key UNIQUE (user_id, log_date);
  END IF;
END $$;

-- ---- daily_aggregates: widen the 1-5 CHECK constraints to 1-10 --------------
-- The live table (created from an older schema that used a 5-point scale) pins
-- mood_score / sleep_quality / stress_level / energy_level to 1-5, but the app
-- standardised on 1-10 long ago (sleep_quality_1_10, intensity_1_10,
-- stress_1_10). Any day rating one of these above 5 was rejected outright, so
-- the WHOLE aggregate row — calories and training included — was lost.
-- base-schema.sql declares these as plain INT with no range check, so dropping
-- the legacy checks brings the table in line with it. The app also degrades
-- gracefully now (it retries with these columns nulled), but that loses the
-- values, so run this to keep them.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'daily_aggregates'::regclass
       AND contype = 'c'
       AND conname IN (
         'daily_aggregates_mood_score_check',
         'daily_aggregates_sleep_quality_check',
         'daily_aggregates_stress_level_check',
         'daily_aggregates_energy_level_check'
       )
  LOOP
    EXECUTE format('ALTER TABLE daily_aggregates DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE daily_aggregates
  ADD CONSTRAINT daily_aggregates_mood_score_check CHECK (mood_score BETWEEN 1 AND 10),
  ADD CONSTRAINT daily_aggregates_sleep_quality_check CHECK (sleep_quality BETWEEN 1 AND 10),
  ADD CONSTRAINT daily_aggregates_stress_level_check CHECK (stress_level BETWEEN 1 AND 10);

-- ---- entities: mention_count may be missing entirely ------------------------
-- Already handled by the ADD COLUMN IF NOT EXISTS above; nothing in the app
-- reads it, so its absence is no longer fatal to an entity write.

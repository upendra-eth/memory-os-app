-- =============================================================================
-- Memory OS — Base schema (CREATE TABLE statements).
--
-- Run this in the Supabase SQL Editor on a fresh project, BEFORE
-- all-migrations.sql and auth-rls-migration.sql. Idempotent — safe to re-run.
--
-- Column types reflect what the application code expects. The other migration
-- files (all-migrations.sql, auth-rls-migration.sql) extend these tables with
-- additional columns, indexes, RLS, and RPCs.
-- =============================================================================

-- Extensions ------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- user_profile — demographics, body metrics, goals, onboarding state
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_profile (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  age INT,
  gender TEXT,
  height_cm INT,
  current_weight_kg NUMERIC(5,2),
  target_weight_kg NUMERIC(5,2),
  activity_level TEXT,
  nutrition_goal TEXT,
  fitness_goal TEXT,
  health_conditions TEXT[] DEFAULT '{}',
  medications TEXT[] DEFAULT '{}',
  allergies TEXT[] DEFAULT '{}',
  onboarding_completed BOOLEAN DEFAULT false,
  location TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  dob DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_profile_email_idx ON user_profile (email);

-- =============================================================================
-- entries — life log entries with 20-dimension extraction + embedding
-- =============================================================================
CREATE TABLE IF NOT EXISTS entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  raw_text TEXT,
  normalized_text TEXT,
  narrative_text TEXT,
  extracted_json JSONB,
  summary TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_user_created_idx ON entries (user_id, created_at DESC);

-- =============================================================================
-- entities — canonical people / foods / exercises / places per user
-- =============================================================================
CREATE TABLE IF NOT EXISTS entities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  mention_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_name)
);

-- =============================================================================
-- daily_aggregates — one row per (user, date), upserted from entries
-- =============================================================================
CREATE TABLE IF NOT EXISTS daily_aggregates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  calories INT,
  protein_g NUMERIC(6,2),
  carbs_g NUMERIC(6,2),
  fat_g NUMERIC(6,2),
  sleep_hours NUMERIC(4,2),
  sleep_quality INT,
  mood_score INT,
  energy_level INT,
  stress_level INT,
  workouts_count INT DEFAULT 0,
  workout_duration_min INT,
  workout_intensity TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, log_date)
);

-- =============================================================================
-- audit_items — normalizer flagged items needing human review
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  audit_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  suggested_value JSONB,
  user_resolution JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS audit_items_user_status_idx ON audit_items (user_id, status);

-- =============================================================================
-- lab_results — uploaded lab reports + Gemini Vision extraction
-- =============================================================================
CREATE TABLE IF NOT EXISTS lab_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  test_name TEXT,
  test_date DATE,
  results JSONB,
  ai_analysis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- day_digests — nightly AI-generated day summary (Phase 9)
-- =============================================================================
CREATE TABLE IF NOT EXISTS day_digests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  digest_date DATE NOT NULL,
  summary TEXT,
  highlights TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ai_questions — weekly proactive AI questions for the user (Phase 11)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ask_history — history of /api/ask queries and answers
-- =============================================================================
CREATE TABLE IF NOT EXISTS ask_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- life_logs — legacy pre-auth table; auth-rls-migration adds user_id + RLS
-- =============================================================================
CREATE TABLE IF NOT EXISTS life_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

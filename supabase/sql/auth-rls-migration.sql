-- =============================================================================
-- Memory OS — Auth & RLS Migration
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- IMPORTANT: Run this AFTER deploying the auth code changes.
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. Add auth_user_id to user_profile to link to auth.users ----------------
ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS user_profile_auth_user_id_idx
  ON user_profile (auth_user_id);

-- 2. Extend user_profile with new profile fields --------------------------
ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS work_type TEXT,
  ADD COLUMN IF NOT EXISTS commute_min INT,
  ADD COLUMN IF NOT EXISTS sleep_schedule_wake TEXT,
  ADD COLUMN IF NOT EXISTS sleep_schedule_bed TEXT,
  ADD COLUMN IF NOT EXISTS sedentary_hours INT,
  ADD COLUMN IF NOT EXISTS screen_time_hours INT,
  ADD COLUMN IF NOT EXISTS diet_preference TEXT,
  ADD COLUMN IF NOT EXISTS family_health_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS surgeries JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stress_baseline_1_10 INT,
  ADD COLUMN IF NOT EXISTS personality_type TEXT,
  ADD COLUMN IF NOT EXISTS therapy_status TEXT,
  ADD COLUMN IF NOT EXISTS financial_goals TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS career_goals TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mental_goals TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_completeness_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_profile_prompt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_data_version INT DEFAULT 1;

-- 3. Create profile_prompts table for progressive data collection ----------
CREATE TABLE IF NOT EXISTS profile_prompts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  prompt_category TEXT NOT NULL,
  target_field TEXT,
  status TEXT DEFAULT 'pending',
  answer TEXT,
  extracted_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  answered_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS profile_prompts_user_status_idx
  ON profile_prompts (user_id, status);

-- =============================================================================
-- 4. RLS Policies
-- =============================================================================

-- Helper function: get user_profile.id from auth.uid()
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM user_profile WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- 4a. user_profile ---------------------------------------------------------
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profile;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profile;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profile;

CREATE POLICY "Users can view own profile" ON user_profile
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profile
  FOR UPDATE USING (auth_user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON user_profile
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

-- 4b. entries ---------------------------------------------------------------
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own entries" ON entries;
CREATE POLICY "Users can access own entries" ON entries
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 4c. entities --------------------------------------------------------------
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own entities" ON entities;
CREATE POLICY "Users can access own entities" ON entities
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 4d. entry_entities --------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entry_entities') THEN
    ALTER TABLE entry_entities ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can access own entry_entities" ON entry_entities;
    EXECUTE 'CREATE POLICY "Users can access own entry_entities" ON entry_entities
      FOR ALL USING (
        entry_id IN (SELECT id FROM entries WHERE user_id = public.get_my_profile_id())
      )';
  END IF;
END $$;

-- 4e. audit_items -----------------------------------------------------------
ALTER TABLE audit_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own audit_items" ON audit_items;
CREATE POLICY "Users can access own audit_items" ON audit_items
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 4f. daily_aggregates ------------------------------------------------------
ALTER TABLE daily_aggregates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own daily_aggregates" ON daily_aggregates;
CREATE POLICY "Users can access own daily_aggregates" ON daily_aggregates
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 4g. body_metrics_log ------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'body_metrics_log') THEN
    ALTER TABLE body_metrics_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can access own body_metrics_log" ON body_metrics_log;
    EXECUTE 'CREATE POLICY "Users can access own body_metrics_log" ON body_metrics_log
      FOR ALL USING (user_id = public.get_my_profile_id())';
  END IF;
END $$;

-- 4h. lab_results -----------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lab_results') THEN
    ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can access own lab_results" ON lab_results;
    EXECUTE 'CREATE POLICY "Users can access own lab_results" ON lab_results
      FOR ALL USING (user_id = public.get_my_profile_id())';
  END IF;
END $$;

-- 4i. day_digests -----------------------------------------------------------
ALTER TABLE day_digests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own day_digests" ON day_digests;
CREATE POLICY "Users can access own day_digests" ON day_digests
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 4j. ai_questions ----------------------------------------------------------
ALTER TABLE ai_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own ai_questions" ON ai_questions;
CREATE POLICY "Users can access own ai_questions" ON ai_questions
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 4k. ask_history -----------------------------------------------------------
ALTER TABLE ask_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own ask_history" ON ask_history;
CREATE POLICY "Users can access own ask_history" ON ask_history
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 4l. life_logs (legacy) — add user_id and enforce strict isolation ----------
-- life_logs predates the multi-user model. Add user_id linked to user_profile
-- and lock down RLS. Existing rows with NULL user_id become unreachable from the
-- app until backfilled (see supabase/sql/data-backfill.sql).
ALTER TABLE life_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS life_logs_user_id_idx ON life_logs (user_id);

ALTER TABLE life_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can access life_logs" ON life_logs;
DROP POLICY IF EXISTS "Users can access own life_logs" ON life_logs;
CREATE POLICY "Users can access own life_logs" ON life_logs
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 4m. profile_prompts -------------------------------------------------------
ALTER TABLE profile_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own profile_prompts" ON profile_prompts;
CREATE POLICY "Users can access own profile_prompts" ON profile_prompts
  FOR ALL USING (user_id = public.get_my_profile_id());

-- =============================================================================
-- Done! All tables now have RLS enabled.
-- =============================================================================

-- =============================================================================
-- Plan & Track — AI exercise plans, user-defined daily habits, and daily tasks
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- Run AFTER auth-rls-migration.sql (depends on public.get_my_profile_id()).
-- =============================================================================

-- 1. exercise_plans — an AI-generated weekly plan derived from the user's goals.
--    The most recent active row is the user's current plan.
CREATE TABLE IF NOT EXISTS exercise_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  goals TEXT,
  days_per_week INT,
  equipment TEXT,
  plan JSONB,            -- { summary, weekly: [{ day, focus, exercises:[{name,sets,reps,notes}] }], tips:[] }
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exercise_plans_user_idx ON exercise_plans (user_id, created_at DESC);

ALTER TABLE exercise_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own exercise_plans" ON exercise_plans;
CREATE POLICY "Users can access own exercise_plans" ON exercise_plans
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 2. habits — recurring daily habits. Completions are stored inline as an array
--    of YYYY-MM-DD strings so a single row holds the full streak history.
CREATE TABLE IF NOT EXISTS habits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  emoji TEXT,
  completions JSONB DEFAULT '[]'::jsonb,   -- ["2026-06-04", ...]
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS habits_user_idx ON habits (user_id, archived);

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own habits" ON habits;
CREATE POLICY "Users can access own habits" ON habits
  FOR ALL USING (user_id = public.get_my_profile_id());

-- 3. tasks — dated to-dos the user can check off.
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  task_date DATE,
  done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_user_date_idx ON tasks (user_id, task_date);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own tasks" ON tasks;
CREATE POLICY "Users can access own tasks" ON tasks
  FOR ALL USING (user_id = public.get_my_profile_id());

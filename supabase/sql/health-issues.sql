-- =============================================================================
-- health_issues — ongoing personal health concerns the user tracks over time
-- (posture, recurring pain, hair fall, skin, sleep, digestion, mental, etc.)
--
-- Distinct from the per-day `symptoms[]` captured in entries: an issue is a
-- standing concern with a status that evolves, plus a running list of updates.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.
-- Run AFTER auth-rls-migration.sql (it depends on public.get_my_profile_id()).
-- =============================================================================

CREATE TABLE IF NOT EXISTS health_issues (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,                       -- pain | posture | hair | skin | sleep | digestion | mental | energy | other
  description TEXT,
  severity_1_10 INT,
  status TEXT DEFAULT 'active',        -- active | improving | resolved
  started_on DATE,
  updates JSONB DEFAULT '[]'::jsonb,   -- [{ at: ISO, note: TEXT, severity_1_10: INT|null, status: TEXT|null }]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_issues_user_status_idx
  ON health_issues (user_id, status);

-- Row Level Security: each user sees only their own issues.
ALTER TABLE health_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own health_issues" ON health_issues;
CREATE POLICY "Users can access own health_issues" ON health_issues
  FOR ALL USING (user_id = public.get_my_profile_id());

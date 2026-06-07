-- =============================================================================
-- AI rate limiting — cap how many AI (Gemini) calls each user can make per day
-- to control cost. Admins (by email, in app code) bypass limits and can raise
-- a specific user's limit via ai_rate_limits.
--
-- Usage is written ONLY by the service role (the app's rate-limit helper), so
-- users cannot reset their own counters. Users may read their own rows.
--
-- Idempotent. Run AFTER auth-rls-migration.sql (needs get_my_profile_id()).
-- =============================================================================

-- Per-user, per-day call counter.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
-- Read-only for the owning user; all writes happen via the service role.
DROP POLICY IF EXISTS "Users can read own ai_usage" ON ai_usage;
CREATE POLICY "Users can read own ai_usage" ON ai_usage
  FOR SELECT USING (user_id = public.get_my_profile_id());

-- Per-user limit override (set by an admin). No row → app default applies.
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES user_profile(id) ON DELETE CASCADE,
  daily_limit INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;
-- Read-only for the owning user; admins write via the service role.
DROP POLICY IF EXISTS "Users can read own ai_rate_limits" ON ai_rate_limits;
CREATE POLICY "Users can read own ai_rate_limits" ON ai_rate_limits
  FOR SELECT USING (user_id = public.get_my_profile_id());

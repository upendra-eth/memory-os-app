-- =============================================================================
-- Memory OS — One-time data backfill for the original (pre-auth) user.
--
-- Context:
--   Before auth was added, data was associated to users via `user_profile.email`
--   alone, and `life_logs` had no `user_id` column at all. After running
--   `auth-rls-migration.sql`, all user-scoped tables are locked behind RLS
--   keyed on `user_profile.auth_user_id`. This script links the existing
--   profile row to its new auth.users account and assigns any orphaned
--   life_logs rows to that profile.
--
-- Usage:
--   1. Sign up via the app at /auth/signup using the email below.
--      Verify the email so the auth.users row exists.
--   2. Edit the `legacy_email` value below.
--   3. Run in Supabase Dashboard → SQL Editor.
--   4. Idempotent — safe to re-run.
-- =============================================================================

\set legacy_email '''upendra.singh@antiersolutions.com'''

-- 1. Link the existing user_profile row to the new auth.users id ------------
UPDATE user_profile up
SET auth_user_id = au.id
FROM auth.users au
WHERE up.email = :legacy_email
  AND au.email = :legacy_email
  AND up.auth_user_id IS NULL;

-- 2. Backfill any pre-auth life_logs rows to the matched profile -----------
UPDATE life_logs ll
SET user_id = up.id
FROM user_profile up
WHERE up.email = :legacy_email
  AND ll.user_id IS NULL;

-- 3. Sanity-check: any rows still orphaned? --------------------------------
-- These SELECTs are diagnostic — they should return 0 rows on success.
SELECT 'orphaned_profile' AS issue, count(*) AS rows
FROM user_profile WHERE email = :legacy_email AND auth_user_id IS NULL
UNION ALL
SELECT 'orphaned_life_logs' AS issue, count(*) AS rows
FROM life_logs WHERE user_id IS NULL;

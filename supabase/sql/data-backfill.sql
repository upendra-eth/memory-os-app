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
--   2. Edit the email literal in BOTH places marked LEGACY_EMAIL below.
--   3. Paste into Supabase Dashboard → SQL Editor → Run.
--   4. Idempotent — safe to re-run. On a fresh DB with no pre-auth data,
--      the UPDATEs match zero rows and this is a no-op.
-- =============================================================================

DO $$
DECLARE
  legacy_email TEXT := 'veerupendrasingh@gmail.com'; -- LEGACY_EMAIL: edit me
  v_profile_id UUID;
  v_auth_user_id UUID;
  v_linked INT;
  v_lifelogs INT;
BEGIN
  -- Look up the auth.users id for this email
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = legacy_email
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row for %. Sign up + verify first, then re-run.', legacy_email;
    RETURN;
  END IF;

  -- 1. Link the existing user_profile row (matched by email) to that auth user
  UPDATE user_profile
  SET auth_user_id = v_auth_user_id
  WHERE email = legacy_email
    AND auth_user_id IS NULL;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  -- 2. Resolve the profile id for the life_logs backfill
  SELECT id INTO v_profile_id
  FROM user_profile
  WHERE email = legacy_email
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE NOTICE 'No user_profile row with email %. Complete onboarding first.', legacy_email;
    RETURN;
  END IF;

  -- 3. Backfill orphaned life_logs rows (created before life_logs.user_id existed)
  UPDATE life_logs
  SET user_id = v_profile_id
  WHERE user_id IS NULL;
  GET DIAGNOSTICS v_lifelogs = ROW_COUNT;

  RAISE NOTICE 'Backfill done. user_profile rows linked: %, life_logs rows assigned: %', v_linked, v_lifelogs;
END $$;

-- Diagnostic — both rows should report 0 after success ----------------------
SELECT 'orphaned_profile' AS issue,
       count(*) AS rows
FROM user_profile
WHERE email = 'veerupendrasingh@gmail.com'  -- LEGACY_EMAIL: edit me
  AND auth_user_id IS NULL
UNION ALL
SELECT 'orphaned_life_logs' AS issue,
       count(*) AS rows
FROM life_logs
WHERE user_id IS NULL;

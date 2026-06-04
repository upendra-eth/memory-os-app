-- =============================================================================
-- mcp_tokens — personal access tokens for the MCP server (connect Claude).
--
-- The MCP endpoint (service-role) looks tokens up by their SHA-256 hash; the
-- plaintext token is shown to the user once at creation and never stored.
--
-- Idempotent. Run AFTER auth-rls-migration.sql (needs get_my_profile_id()).
-- =============================================================================

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES user_profile(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mcp_tokens_hash_idx ON mcp_tokens (token_hash);

-- Users manage their own tokens from the app (RLS). The MCP server reads them
-- with the service role, which bypasses RLS, and scopes every query by user_id.
ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access own mcp_tokens" ON mcp_tokens;
CREATE POLICY "Users can access own mcp_tokens" ON mcp_tokens
  FOR ALL USING (user_id = public.get_my_profile_id());

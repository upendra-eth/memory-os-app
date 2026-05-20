-- =============================================================================
-- Memory OS — one-shot migrations to align DB with Phases 7, 9, 11.
-- Run in: Supabase dashboard → SQL Editor → paste → Run.
-- Idempotent: safe to re-run.
-- =============================================================================

-- Extensions ------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Phase 11 — ai_questions: add columns the app expects ------------------------
ALTER TABLE ai_questions
  ADD COLUMN IF NOT EXISTS expected_action text,
  ADD COLUMN IF NOT EXISTS options jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS answer text,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

CREATE INDEX IF NOT EXISTS ai_questions_user_status_idx
  ON ai_questions (user_id, status);

-- Phase 9 — day_digests: add the morning/afternoon/evening/full/patterns cols -
ALTER TABLE day_digests
  ADD COLUMN IF NOT EXISTS morning_summary text,
  ADD COLUMN IF NOT EXISTS afternoon_summary text,
  ADD COLUMN IF NOT EXISTS evening_summary text,
  ADD COLUMN IF NOT EXISTS full_day_digest text,
  ADD COLUMN IF NOT EXISTS patterns_noticed jsonb DEFAULT '[]'::jsonb;

-- Phase 9 needs UPSERT on (user_id, digest_date) — make sure that's unique.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'day_digests_user_date_unique'
  ) THEN
    ALTER TABLE day_digests
      ADD CONSTRAINT day_digests_user_date_unique UNIQUE (user_id, digest_date);
  END IF;
END $$;

-- Phase 7 — vector index + RPC for RAG search ---------------------------------
-- IMPORTANT: confirm the dimension of entries.embedding before running.
-- Gemini's `embedding-001` returns 768. If your column is vector(1536) you must
-- either re-create it as vector(768) and re-embed entries, OR change 768 below
-- to your actual dim — but then RAG won't work because lib/rag.ts produces 768.
DO $$
DECLARE
  embed_dim int;
BEGIN
  SELECT atttypmod INTO embed_dim
    FROM pg_attribute
   WHERE attrelid = 'entries'::regclass AND attname = 'embedding';
  RAISE NOTICE 'entries.embedding dimension is: %', embed_dim;
END $$;

CREATE INDEX IF NOT EXISTS entries_embedding_ivfflat
  ON entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_entries(
  query_embedding vector(768),
  match_user_id uuid,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  narrative_text text,
  extracted_json jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id, e.created_at, e.narrative_text, e.extracted_json,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entries e
  WHERE e.user_id = match_user_id
    AND e.embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

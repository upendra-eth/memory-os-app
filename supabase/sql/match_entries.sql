-- Run once in Supabase SQL editor.
-- Requires the `vector` extension (CREATE EXTENSION IF NOT EXISTS vector;).
-- Assumes entries.embedding is vector(768) — adjust the dimension if you changed it.

-- IVFFlat index for cosine similarity. Tune `lists` to ~sqrt(rows).
CREATE INDEX IF NOT EXISTS entries_embedding_ivfflat
  ON entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RPC consumed by lib/rag.ts → searchEntries() via supabase.rpc('match_entries', …).
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
    e.id,
    e.created_at,
    e.narrative_text,
    e.extracted_json,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entries e
  WHERE e.user_id = match_user_id
    AND e.embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

'use server'

import { createHash, randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'

async function getAuth(): Promise<{ userId: string; supabase: Awaited<ReturnType<typeof createClient>> } | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('user_profile')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return null
  return { userId: profile.id, supabase }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface McpTokenInfo {
  id: string
  label: string | null
  created_at: string
  last_used_at: string | null
}

export async function listMcpTokens(): Promise<McpTokenInfo[]> {
  const auth = await getAuth()
  if (!auth) return []
  const { data } = await auth.supabase
    .from('mcp_tokens')
    .select('id, label, created_at, last_used_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
  return (data || []) as McpTokenInfo[]
}

/** Create a token; returns the PLAINTEXT once (never stored or retrievable again). */
export async function createMcpToken(label?: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const auth = await getAuth()
  if (!auth) return { success: false, error: 'Not signed in.' }

  // Prefix makes it recognizable; 32 random bytes of entropy.
  const token = `mos_${randomBytes(32).toString('base64url')}`
  const { error } = await auth.supabase.from('mcp_tokens').insert({
    user_id: auth.userId,
    token_hash: hashToken(token),
    label: label?.trim() || 'Claude',
  })
  if (error) {
    console.error('[v0] createMcpToken error:', error.message)
    // Surface the underlying reason — the most common one is that the
    // `mcp_tokens` table was never created (run supabase/sql/mcp-tokens.sql).
    const hint = /relation .*mcp_tokens.* does not exist|could not find the table/i.test(error.message)
      ? 'The mcp_tokens table is missing — run supabase/sql/mcp-tokens.sql in the Supabase SQL editor.'
      : error.message
    return { success: false, error: `Failed to create token: ${hint}` }
  }
  return { success: true, token }
}

export async function revokeMcpToken(id: string): Promise<{ success: boolean }> {
  const auth = await getAuth()
  if (!auth) return { success: false }
  await auth.supabase.from('mcp_tokens').delete().eq('id', id).eq('user_id', auth.userId)
  return { success: true }
}

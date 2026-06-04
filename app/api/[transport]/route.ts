import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const maxDuration = 60

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const todayISO = () => new Date().toISOString().slice(0, 10)
const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] })

/** Resolve the user id that a tool call is authenticated as. */
function uid(extra: { authInfo?: { extra?: Record<string, unknown> } }): string {
  const id = extra?.authInfo?.extra?.userId
  if (!id || typeof id !== 'string') throw new Error('Unauthorized')
  return id
}

const handler = createMcpHandler(
  (server) => {
    // ---------------------------------------------------------------- READ
    server.tool(
      'get_profile',
      'Get the user’s profile: goals, body stats, activity level, preferences.',
      {},
      async (_args, extra) => {
        const db = createServiceClient()
        const { data } = await db.from('user_profile').select('*').eq('id', uid(extra)).single()
        return text(data ?? {})
      },
    )

    server.tool(
      'search_memory',
      'Search the user’s daily log entries by keyword. Returns matching entries (date + narrative + structured data).',
      { query: z.string().describe('keywords to search for'), limit: z.number().optional().describe('max results, default 15') },
      async ({ query, limit }, extra) => {
        const db = createServiceClient()
        const { data } = await db
          .from('entries')
          .select('created_at, narrative_text, extracted_json')
          .eq('user_id', uid(extra))
          .ilike('narrative_text', `%${query}%`)
          .order('created_at', { ascending: false })
          .limit(limit ?? 15)
        return text(data ?? [])
      },
    )

    server.tool(
      'get_recent_entries',
      'Get the user’s most recent full log entries (narrative + extracted JSON).',
      { days: z.number().optional().describe('look back this many days, default 14'), limit: z.number().optional() },
      async ({ days, limit }, extra) => {
        const db = createServiceClient()
        const since = new Date(Date.now() - (days ?? 14) * 86400000).toISOString()
        const { data } = await db
          .from('entries')
          .select('created_at, narrative_text, extracted_json')
          .eq('user_id', uid(extra))
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(limit ?? 30)
        return text(data ?? [])
      },
    )

    server.tool(
      'get_daily_trends',
      'Get day-by-day aggregates (calories, macros, sleep, mood, stress, workouts) for trend analysis.',
      { days: z.number().optional().describe('default 30') },
      async ({ days }, extra) => {
        const db = createServiceClient()
        const since = new Date(Date.now() - (days ?? 30) * 86400000).toISOString().slice(0, 10)
        const { data } = await db
          .from('daily_aggregates')
          .select('*')
          .eq('user_id', uid(extra))
          .gte('log_date', since)
          .order('log_date', { ascending: true })
        return text(data ?? [])
      },
    )

    server.tool(
      'get_health_reports',
      'Get the user’s saved health reports (lab panels, checkups, body-composition scans) with markers.',
      {},
      async (_args, extra) => {
        const db = createServiceClient()
        const { data } = await db
          .from('lab_results')
          .select('test_name, test_date, results, ai_analysis')
          .eq('user_id', uid(extra))
          .order('test_date', { ascending: false })
          .limit(50)
        return text(data ?? [])
      },
    )

    server.tool(
      'get_health_issues',
      'Get the user’s tracked ongoing health issues (pain, posture, hair fall, etc.) and their updates.',
      { status: z.enum(['active', 'improving', 'resolved', 'all']).optional() },
      async ({ status }, extra) => {
        const db = createServiceClient()
        let q = db.from('health_issues').select('*').eq('user_id', uid(extra))
        if (status && status !== 'all') q = q.eq('status', status)
        const { data } = await q.order('updated_at', { ascending: false })
        return text(data ?? [])
      },
    )

    server.tool(
      'get_habits',
      'Get the user’s daily habits with their completion history.',
      {},
      async (_args, extra) => {
        const db = createServiceClient()
        const { data } = await db.from('habits').select('*').eq('user_id', uid(extra)).eq('archived', false)
        return text(data ?? [])
      },
    )

    server.tool(
      'get_tasks',
      'Get the user’s tasks. Pass done=false for outstanding tasks only.',
      { done: z.boolean().optional() },
      async ({ done }, extra) => {
        const db = createServiceClient()
        let q = db.from('tasks').select('*').eq('user_id', uid(extra))
        if (typeof done === 'boolean') q = q.eq('done', done)
        const { data } = await q.order('task_date', { ascending: false }).limit(200)
        return text(data ?? [])
      },
    )

    server.tool(
      'get_exercise_plan',
      'Get the user’s current AI-generated weekly exercise plan.',
      {},
      async (_args, extra) => {
        const db = createServiceClient()
        const { data } = await db
          .from('exercise_plans')
          .select('goals, days_per_week, equipment, plan, created_at')
          .eq('user_id', uid(extra))
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        return text(data ?? {})
      },
    )

    // --------------------------------------------------------------- WRITE
    server.tool(
      'add_task',
      'Add a task/to-do for the user.',
      { title: z.string(), date: z.string().optional().describe('YYYY-MM-DD, defaults to today') },
      async ({ title, date }, extra) => {
        const db = createServiceClient()
        const { data, error } = await db
          .from('tasks')
          .insert({ user_id: uid(extra), title, task_date: date || todayISO(), done: false })
          .select()
          .single()
        return text(error ? { error: error.message } : { added: data })
      },
    )

    server.tool(
      'add_habit',
      'Create a new daily habit for the user to track.',
      { title: z.string() },
      async ({ title }, extra) => {
        const db = createServiceClient()
        const { data, error } = await db
          .from('habits')
          .insert({ user_id: uid(extra), title, completions: [] })
          .select()
          .single()
        return text(error ? { error: error.message } : { added: data })
      },
    )

    server.tool(
      'log_habit',
      'Mark a habit done for a day (defaults to today). Finds the habit by id or title.',
      { habit_id: z.string().optional(), title: z.string().optional(), date: z.string().optional() },
      async ({ habit_id, title, date }, extra) => {
        const db = createServiceClient()
        const userId = uid(extra)
        const day = date || todayISO()
        let row: { id: string; completions: string[] } | null = null
        if (habit_id) {
          const { data } = await db.from('habits').select('id, completions').eq('id', habit_id).eq('user_id', userId).single()
          row = data as any
        } else if (title) {
          const { data } = await db.from('habits').select('id, completions').eq('user_id', userId).ilike('title', title).limit(1).maybeSingle()
          row = data as any
        }
        if (!row) return text({ error: 'Habit not found. Use add_habit first or pass a valid habit_id.' })
        const set = new Set<string>(Array.isArray(row.completions) ? row.completions : [])
        set.add(day)
        const completions = Array.from(set).sort()
        await db.from('habits').update({ completions }).eq('id', row.id).eq('user_id', userId)
        return text({ habit_id: row.id, completions })
      },
    )

    server.tool(
      'create_issue',
      'Log an ongoing health issue the user is experiencing.',
      {
        title: z.string(),
        category: z.string().optional(),
        description: z.string().optional(),
        severity_1_10: z.number().optional(),
      },
      async ({ title, category, description, severity_1_10 }, extra) => {
        const db = createServiceClient()
        const { data, error } = await db
          .from('health_issues')
          .insert({
            user_id: uid(extra),
            title,
            category: category || 'other',
            description: description || null,
            severity_1_10: typeof severity_1_10 === 'number' ? severity_1_10 : null,
            status: 'active',
            updates: [],
          })
          .select()
          .single()
        return text(error ? { error: error.message } : { added: data })
      },
    )
  },
  {},
  {
    // Mounted under app/api/[transport] → endpoints become /api/mcp and /api/sse.
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: false,
  },
)

/**
 * Verify the bearer token: hash it, look it up, and return the AuthInfo with
 * the resolved user id. The MCP server scopes every query to extra.userId.
 */
const verifyToken = async (_req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined
  const db = createServiceClient()
  const { data } = await db
    .from('mcp_tokens')
    .select('id, user_id')
    .eq('token_hash', sha256(bearerToken))
    .maybeSingle()
  if (!data) return undefined
  // Best-effort touch; don't block on it.
  db.from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {})
  return {
    token: bearerToken,
    clientId: 'memory-os',
    scopes: ['read', 'write'],
    extra: { userId: data.user_id as string },
  }
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true })

export { authHandler as GET, authHandler as POST, authHandler as DELETE }

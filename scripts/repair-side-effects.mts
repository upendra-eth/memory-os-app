/**
 * Backfill daily_aggregates + entities from existing entries.
 *
 * One-time repair for data logged while both side-effect writes were failing
 * silently against a legacy schema (missing UNIQUE constraints on
 * daily_aggregates, missing entities.mention_count — see
 * supabase/sql/fix-schema-drift.sql). Runs the SAME functions the app uses
 * ([lib/entry-side-effects.ts](../lib/entry-side-effects.ts)), which no longer
 * depend on those constraints, so this needs no migration first.
 *
 * Idempotent: every run recomputes each day from its entries and updates in
 * place. Pass --dry to report what would change without writing.
 *
 *   npx tsx scripts/repair-side-effects.mts [--dry]
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { ExtractedJSON } from '../lib/extraction-schema'
import { buildDailyAggregate, recordEntities, writeDailyAggregate } from '../lib/entry-side-effects'

const DRY = process.argv.includes('--dry')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const effectiveDate = (ex: ExtractedJSON | null, createdAt: string) => ex?.log_date || createdAt.slice(0, 10)

const { data: profiles, error: profileError } = await db.from('user_profile').select('id, email')
if (profileError) throw profileError

for (const profile of profiles || []) {
  const { data: entries, error } = await db
    .from('entries')
    .select('extracted_json, created_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: true })
  if (error) throw error
  if (!entries?.length) continue

  const byDate = new Map<string, ExtractedJSON[]>()
  const entityNames: ExtractedJSON['entities'] = { people: [], foods: [], exercises: [], places: [] }
  for (const e of entries) {
    const ex = (e.extracted_json as ExtractedJSON) || {}
    const date = effectiveDate(ex, e.created_at)
    byDate.set(date, [...(byDate.get(date) ?? []), ex])
    for (const key of ['people', 'foods', 'exercises', 'places'] as const) {
      entityNames[key]!.push(...(ex.entities?.[key] ?? []))
    }
  }

  console.log(`\n${profile.email} — ${entries.length} entries across ${byDate.size} days`)

  const tally: Record<string, number> = {}
  for (const [date, dayEntries] of Array.from(byDate.entries()).sort()) {
    const row = buildDailyAggregate(profile.id, date, dayEntries)
    if (!row) continue
    if (DRY) {
      tally.wouldWrite = (tally.wouldWrite ?? 0) + 1
      continue
    }
    const result = await writeDailyAggregate(row, db)
    tally[result] = (tally[result] ?? 0) + 1
  }
  console.log('  daily_aggregates:', tally)

  if (DRY) {
    const unique = new Set(
      (['people', 'foods', 'exercises', 'places'] as const).flatMap((k) =>
        (entityNames[k] ?? []).map((n) => `${k}::${n.trim().toLowerCase()}`)
      )
    )
    console.log(`  entities: ${unique.size} distinct names seen (dry run, nothing written)`)
  } else {
    const { inserted } = await recordEntities(profile.id, entityNames, db)
    console.log(`  entities: ${inserted} inserted`)
  }
}

console.log(DRY ? '\nDry run complete — nothing was written.' : '\nRepair complete.')

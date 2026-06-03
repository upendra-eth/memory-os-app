/**
 * Durable retry queue for entry saves that fail due to a transient/API issue.
 *
 * When normalization (Gemini) or the save (Supabase) fails, the raw paste is
 * stashed in localStorage so it's never lost — the user can retry later, even
 * after a reload or browser restart. Cleared on a successful save.
 *
 * Client-only (guards for SSR). Intentionally not a DB table: it's per-device
 * scratch for un-saved input, and needs no migration.
 */

const KEY = 'memoryos.pendingEntries'
const MAX = 25

export interface PendingEntry {
  id: string
  paste: string
  logDate: string
  error: string
  step?: 'normalize' | 'save' | 'network'
  savedAt: string // ISO
}

function read(): PendingEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(items: PendingEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)))
  } catch {
    // localStorage full/unavailable — nothing we can safely do; fail silent.
  }
}

export function getPendingEntries(): PendingEntry[] {
  return read().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
}

/** Add or refresh a failed paste. De-dupes on identical (paste, logDate). */
export function addPendingEntry(input: {
  paste: string
  logDate: string
  error: string
  step?: PendingEntry['step']
}): PendingEntry {
  const items = read()
  const existing = items.find((i) => i.paste === input.paste && i.logDate === input.logDate)
  const stamp = new Date().toISOString()
  if (existing) {
    existing.error = input.error
    existing.step = input.step
    existing.savedAt = stamp
    write(items)
    return existing
  }
  const entry: PendingEntry = {
    id: `${stamp}-${Math.round(performance.now())}`,
    paste: input.paste,
    logDate: input.logDate,
    error: input.error,
    step: input.step,
    savedAt: stamp,
  }
  write([entry, ...items])
  return entry
}

export function removePendingEntry(id: string): void {
  write(read().filter((i) => i.id !== id))
}

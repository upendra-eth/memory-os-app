'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle, CalendarDays, Layers, RotateCw, Trash2, CloudOff } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { processAndSaveEntry, getDayLogStatus } from '@/app/entry-actions'
import {
  addPendingEntry,
  getPendingEntries,
  removePendingEntry,
  type PendingEntry,
} from '@/lib/pending-entries'
import { cn } from '@/lib/utils'

const addDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const todayStr = () => addDays(0)

const QUICK_DAYS = [
  { label: 'Today', offset: 0 },
  { label: 'Yesterday', offset: 1 },
  { label: '2 days ago', offset: 2 },
]

interface DayStatus {
  entryCount: number
  kcal: number | null
  workouts: number | null
  summaries: string[]
}

export function EntryForm() {
  const [paste, setPaste] = useState('')
  const [logDate, setLogDate] = useState<string>(todayStr())
  const [dayStatus, setDayStatus] = useState<DayStatus | null>(null)
  const [isPending, startTransition] = useTransition()
  const [parseError, setParseError] = useState<string | null>(null)
  const [savedEntry, setSavedEntry] = useState<{ id: string; summary: string; logDate?: string } | null>(null)
  const [processingStep, setProcessingStep] = useState<string>('')
  const [pending, setPending] = useState<PendingEntry[]>([])
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const { toast } = useToast()

  // Load any pastes that failed to save previously (survives reloads).
  useEffect(() => {
    setPending(getPendingEntries())
  }, [])

  // Show what's already logged for the chosen day, so the user knows a new
  // entry adds to it (rather than wondering if it overwrites).
  useEffect(() => {
    let active = true
    setDayStatus(null)
    getDayLogStatus(logDate).then((s) => {
      if (active) setDayStatus(s)
    })
    return () => {
      active = false
    }
  }, [logDate, savedEntry])

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPaste(e.target.value)
    setSavedEntry(null)
    setParseError(null)

    // Check if paste contains the sections
    if (e.target.value.includes('===')) {
      setParseError(null)
    }
  }

  /**
   * Run the full save. On a transient/API failure (normalize/save/network) the
   * paste is stashed in the retry queue so it's never lost. `fromPendingId` is
   * set when retrying a queued item, so we can clear it on success.
   */
  const runSave = (text: string, date: string, fromPendingId?: string): Promise<boolean> => {
    return (async () => {
      try {
        setProcessingStep('Normalizing with Gemini (may take 5-10 seconds)...')
        const result = await processAndSaveEntry(text, date)

        if (!result.success) {
          // A parse error is the user's format mistake — show it inline, don't queue.
          if (result.step === 'parse') {
            setParseError(result.error || 'Could not read the paste')
          } else {
            // normalize/save failure (often Gemini/Supabase API) — keep it for retry.
            addPendingEntry({ paste: text, logDate: date, error: result.error || 'Save failed', step: result.step })
            setPending(getPendingEntries())
            setParseError(
              `${result.error || 'Save failed'} — saved to "Pending" below; you can retry without re-pasting.`
            )
          }
          setProcessingStep('')
          return false
        }

        // Success — clear from the queue if this was a retry.
        if (fromPendingId) {
          removePendingEntry(fromPendingId)
          setPending(getPendingEntries())
        }
        setSavedEntry({
          id: result.entryId || '',
          summary: result.summary || 'Entry saved',
          logDate: result.logDate,
        })
        setProcessingStep('')
        toast({
          title: 'Success!',
          description: `Saved to ${result.logDate || 'today'}`,
        })
        return true
      } catch (error) {
        // Thrown = network/unexpected. Always preserve the paste for retry.
        console.error('Error:', error)
        addPendingEntry({
          paste: text,
          logDate: date,
          error: error instanceof Error ? error.message : 'Network error',
          step: 'network',
        })
        setPending(getPendingEntries())
        setParseError("Couldn't reach the server — saved to \"Pending\" below; retry when you're back online.")
        setProcessingStep('')
        return false
      }
    })()
  }

  const handleSave = () => {
    if (!paste.trim()) {
      setParseError('Please paste content')
      return
    }
    startTransition(async () => {
      const ok = await runSave(paste, logDate)
      if (ok) {
        setPaste('')
        setLogDate(todayStr())
      }
    })
  }

  const handleRetry = (item: PendingEntry) => {
    setRetryingId(item.id)
    startTransition(async () => {
      await runSave(item.paste, item.logDate, item.id)
      setRetryingId(null)
    })
  }

  const handleDiscard = (id: string) => {
    removePendingEntry(id)
    setPending(getPendingEntries())
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Instruction Card */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">How to use:</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Paste output from ChatGPT with === RAW ===, === NARRATIVE ===, === EXTRACTED === sections</li>
          <li>Click Save to parse and normalize the data</li>
          <li>Gemini will intelligently extract structured data from the EXTRACTED section</li>
          <li>Your entry is added to your timeline and dashboards automatically</li>
        </ol>
      </Card>

      {/* Entry date — quick picks + calendar; change it to back-fill a past day */}
      <div className="space-y-2">
        <label htmlFor="entry-date" className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4" /> Which day is this entry for?
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_DAYS.map((q) => {
            const value = addDays(q.offset)
            const active = logDate === value
            return (
              <button
                key={q.offset}
                type="button"
                disabled={isPending}
                onClick={() => setLogDate(value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-secondary'
                )}
              >
                {q.label}
              </button>
            )
          })}
          <input
            id="entry-date"
            type="date"
            value={logDate}
            max={todayStr()}
            disabled={isPending}
            onChange={(e) => setLogDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>

        {/* What's already logged for this day */}
        {dayStatus && dayStatus.entryCount > 0 ? (
          <div className="flex items-start gap-2 rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            <Layers className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
            <div>
              <span className="font-medium text-foreground">
                {dayStatus.entryCount} {dayStatus.entryCount === 1 ? 'entry' : 'entries'} already logged for this day
              </span>
              {(dayStatus.kcal || dayStatus.workouts) && (
                <span>
                  {' '}· so far {dayStatus.kcal ? `${dayStatus.kcal} kcal` : ''}
                  {dayStatus.kcal && dayStatus.workouts ? ', ' : ''}
                  {dayStatus.workouts ? `${dayStatus.workouts} workout${dayStatus.workouts > 1 ? 's' : ''}` : ''}
                </span>
              )}
              . Your new entry will be <span className="font-medium text-foreground">added</span>, not replace them.
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Logged a day in pieces? Pick the same date again — entries stack and totals add up.
          </p>
        )}
      </div>

      {/* Textarea */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Paste your ChatGPT output</label>
        <Textarea
          value={paste}
          onChange={handlePasteChange}
          placeholder={'=== RAW ===\n[Your raw transcript]\n\n=== NARRATIVE ===\n[Your journal entry]\n\n=== EXTRACTED ===\n[Your structured data]'}
          rows={12}
          disabled={isPending}
          className="font-mono text-sm"
        />
      </div>

      {/* Error Alert */}
      {parseError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {/* Processing Status */}
      {isPending && processingStep && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm text-amber-800">{processingStep}</p>
          </div>
        </Card>
      )}

      {/* Success Card */}
      {savedEntry && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="font-semibold text-emerald-900">
                Entry Saved{savedEntry.logDate ? ` for ${savedEntry.logDate}` : ''}!
              </p>
            </div>
            <p className="text-sm text-emerald-800">{savedEntry.summary}</p>
          </div>
        </Card>
      )}

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={isPending || !paste.trim()}
        size="lg"
        className="w-full"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing ({processingStep})
          </>
        ) : (
          'Save Entry'
        )}
      </Button>

      {/* Pending — pastes that failed to save (kept across reloads) */}
      {pending.length > 0 && (
        <Card className="p-4 border-amber-300 bg-amber-50/60">
          <div className="flex items-center gap-2 mb-3">
            <CloudOff className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">
              Pending ({pending.length}) — not saved yet
            </h3>
          </div>
          <p className="text-xs text-amber-800/80 mb-3">
            These failed to save (usually a temporary AI/network issue). Your text is safe here — retry anytime.
          </p>
          <div className="space-y-2">
            {pending.map((item) => (
              <div key={item.id} className="rounded-md border border-amber-200 bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">
                      For {item.logDate}
                      <span className="text-muted-foreground font-normal">
                        {' '}· {new Date(item.savedAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{item.error}</p>
                    <p className="mt-1 text-xs text-muted-foreground/80 line-clamp-2 font-mono">
                      {item.paste.replace(/===.*?===/g, '').trim().slice(0, 120)}…
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleRetry(item)}
                    >
                      {retryingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1">Retry</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => handleDiscard(item.id)}
                      aria-label="Discard"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

'use client'

/**
 * Every weigh-in in one place — correct or delete any of them directly.
 *
 * Dates with more than one reading (a correction attempt, a duplicate
 * backfill) show every entry stacked under that date, with the one the
 * analytics engine actually uses marked "in use" — so which number is live is
 * never a guess.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { correctWeightEntry, deleteWeightEntry, listWeightEntries, type WeightEntryRow } from '@/app/weight-actions'
import { cn } from '@/lib/utils'
import { Pencil, Trash2 } from 'lucide-react'

export interface WeightLogManagerHandle {
  /** Scroll to and open the correction input for a given date — used by the chart's click-to-edit dots. */
  focusDate: (date: string) => void
  refresh: () => void
}

export const WeightLogManager = forwardRef<WeightLogManagerHandle, { onChanged: () => void }>(function WeightLogManager(
  { onChanged },
  ref
) {
  const { toast } = useToast()
  const [rows, setRows] = useState<WeightEntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setRows(await listWeightEntries())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useImperativeHandle(ref, () => ({
    refresh: load,
    focusDate: (date: string) => {
      setEditingDate(date)
      const current = rows.find((r) => r.date === date && r.isEffective)
      setEditValue(current ? String(current.weightKg) : '')
      requestAnimationFrame(() => {
        document.getElementById(`weight-row-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    },
  }))

  const byDate = useMemo(() => {
    const groups = new Map<string, WeightEntryRow[]>()
    for (const r of rows) groups.set(r.date, [...(groups.get(r.date) ?? []), r])
    return Array.from(groups.entries())
  }, [rows])

  const startEdit = (date: string, currentKg: number) => {
    setEditingDate(date)
    setEditValue(String(currentKg))
  }

  const saveCorrection = async (date: string) => {
    const kg = Number.parseFloat(editValue)
    if (!Number.isFinite(kg)) {
      toast({ title: 'Enter a weight', variant: 'destructive' })
      return
    }
    setBusyId(date)
    try {
      const res = await correctWeightEntry(date, kg)
      if (res.success) {
        toast({ title: 'Updated', description: `${date} is now ${kg} kg` })
        setEditingDate(null)
        await load()
        onChanged()
      } else {
        toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
      }
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (row: WeightEntryRow) => {
    setBusyId(row.id)
    try {
      const res = await deleteWeightEntry(row.id)
      if (res.success) {
        toast({ title: 'Deleted', description: `${row.date} · ${row.weightKg} kg removed` })
        await load()
        onChanged()
      } else {
        toast({ title: 'Could not delete', description: res.error, variant: 'destructive' })
      }
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <Card className="flex justify-center p-8">
        <Spinner />
      </Card>
    )
  }

  if (byDate.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No weigh-ins logged yet — use the box above to add your first one.
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">All weigh-ins</h3>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Dates with more than one reading show every attempt — the one marked <b>in use</b> is what the charts and
        forecast actually read. Correcting a date logs a new reading rather than editing the old one, so nothing
        else you logged that day is ever touched.
      </p>

      <div className="mt-4 max-h-[480px] space-y-1 overflow-y-auto">
        {byDate.map(([date, entries]) => {
          const effective = entries.find((e) => e.isEffective) ?? entries[0]
          const isEditing = editingDate === date
          return (
            <div key={date} id={`weight-row-${date}`} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 flex-shrink-0 text-sm font-medium tabular-nums">{date}</span>

                {isEditing ? (
                  <>
                    <Input
                      type="number"
                      step="0.1"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveCorrection(date)}
                      className="h-8 w-24"
                    />
                    <Button size="sm" className="h-8" onClick={() => saveCorrection(date)} disabled={busyId === date}>
                      {busyId === date ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingDate(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-bold tabular-nums">{effective.weightKg} kg</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => startEdit(date, effective.weightKg)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {entries.length > 1 && (
                      <span className="text-[11px] text-muted-foreground">{entries.length} readings for this date</span>
                    )}
                  </>
                )}
              </div>

              {entries.length > 1 && !isEditing && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                  {entries.map((e) => (
                    <div
                      key={e.id}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                        e.isEffective ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <span className="tabular-nums font-medium">{e.weightKg} kg</span>
                      {e.isEffective && <span className="text-[10px] uppercase tracking-wide">in use</span>}
                      {!e.isEffective && (
                        <span className="text-[10px]">superseded {new Date(e.updatedAt).toLocaleString()}</span>
                      )}
                      {e.deletable ? (
                        <button
                          type="button"
                          onClick={() => remove(e)}
                          disabled={busyId === e.id}
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          title="Delete this reading"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : (
                        <span title="This entry also holds other logged data, so it can't be deleted from here.">
                          <Trash2 className="ml-1 h-3 w-3 opacity-25" />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
})

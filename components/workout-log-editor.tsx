'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { saveManualWorkout, type ExerciseLast } from '@/app/training-actions'
import { Pencil, Plus, X } from 'lucide-react'

/** Browser-local calendar date as YYYY-MM-DD (what the user thinks of as today). */
function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}

interface Props {
  /** Plan exercise name — used when adding a brand-new record. */
  exerciseName: string
  /** Existing matched record, if any (drives Edit mode + prefill). */
  existing: ExerciseLast | null
  onSaved: () => void
}

/**
 * Inline "add it myself" / "fix this" control for one exercise row.
 *  - No history → a "＋ Add result" button that logs against today.
 *  - Has history → a pencil that edits the shown record on its own date.
 */
export function WorkoutLogEditor({ exerciseName, existing, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Prefill from the existing record's first set / summary when editing.
  const firstSet = existing?.sets?.[0]
  const [sets, setSets] = useState(existing?.setsCount?.toString() ?? existing?.sets?.length?.toString() ?? '')
  const [reps, setReps] = useState(firstSet?.reps?.toString() ?? '')
  const [weight, setWeight] = useState(firstSet?.weight_kg?.toString() ?? '')
  const [duration, setDuration] = useState(existing?.durationMin?.toString() ?? '')

  const editing = !!existing && (existing.sets.length > 0 || !!existing.setsCount || !!existing.durationMin)
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  const save = async () => {
    setSaving(true)
    const res = await saveManualWorkout({
      // Edit the stored record under its own name/date; add new under today.
      exercise: editing ? existing!.exercise : exerciseName,
      date: editing ? existing!.date : todayLocal(),
      sets: num(sets),
      reps: num(reps),
      weightKg: num(weight),
      durationMin: num(duration),
    })
    setSaving(false)
    if (res.ok) {
      toast({ title: editing ? 'Updated' : 'Logged', description: `${exerciseName} saved.` })
      setOpen(false)
      onSaved()
    } else {
      toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
    }
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        {editing ? <Pencil className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
        {editing ? 'Edit' : 'Add result'}
      </Button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field id="sets" label="Sets" value={sets} onChange={setSets} placeholder="3" />
        <Field id="reps" label="Reps" value={reps} onChange={setReps} placeholder="10" />
        <Field id="weight" label="Weight (kg)" value={weight} onChange={setWeight} placeholder="60" />
        <Field id="duration" label="Duration (min)" value={duration} onChange={setDuration} placeholder="—" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Fill what applies — leave the rest blank. (Planks &amp; holds: just sets + duration.)
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving} className="flex-1">
          {saving ? <Spinner className="h-4 w-4" /> : editing ? 'Save changes' : 'Log it'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  )
}

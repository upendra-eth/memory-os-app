'use client'

/**
 * One-tap weight log for the Weight tab.
 *
 * This is the sustainable way to keep the trend line current: it writes a
 * dated weigh-in into a real entry (via `quickLogWeight`, which goes through
 * the normal `saveEntry` path), rather than the profile's "current weight"
 * field, which only ever holds one number with no history behind it.
 */

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { quickLogWeight } from '@/app/entry-actions'
import { Scale } from 'lucide-react'

const todayIso = () => new Date().toISOString().slice(0, 10)

export function QuickWeightLog({ lastKg, onLogged }: { lastKg: number | null; onLogged: () => void }) {
  const { toast } = useToast()
  const [weight, setWeight] = useState(lastKg != null ? String(lastKg) : '')
  const [date, setDate] = useState(todayIso())
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const kg = Number.parseFloat(weight)
    if (!Number.isFinite(kg)) {
      toast({ title: 'Enter a weight', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await quickLogWeight(kg, date)
      if (res.success) {
        toast({ title: 'Weight logged', description: `${kg} kg on ${res.logDate}` })
        onLogged()
      } else {
        toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Log today&apos;s weight</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        This is what actually builds the trend line — the profile page&apos;s weight field is just a single current
        number with no date behind it.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="text-muted-foreground">Weight (kg)</span>
          <Input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="mt-1 w-28"
            placeholder="87.7"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Date</span>
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block h-9 rounded-lg border border-input bg-background px-2 text-xs"
          />
        </label>
        <Button size="sm" onClick={submit} disabled={saving || !weight}>
          {saving ? 'Saving…' : 'Log it'}
        </Button>
      </div>
    </Card>
  )
}

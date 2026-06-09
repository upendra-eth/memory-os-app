'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { generateAndSavePlan, saveImportedPlan, type SavedPlan } from '@/app/plan-actions'
import { SCHEDULE_COPY_PROMPT } from '@/lib/prompts/schedule'
import { Sparkles, ClipboardPaste, Copy, Check, Loader2 } from 'lucide-react'

/**
 * Reusable plan setup: AI-generate from goals, or paste your own schedule.
 * Used on /plan and /workout. Calls onSaved with the new active plan.
 */
export function PlanSetup({
  onSaved,
  initial,
}: {
  onSaved: (plan: SavedPlan) => void
  initial?: { goals?: string; days?: number; equipment?: string }
}) {
  const [mode, setMode] = useState<'ai' | 'paste'>('ai')
  const [goals, setGoals] = useState(initial?.goals || '')
  const [days, setDays] = useState(initial?.days || 4)
  const [equipment, setEquipment] = useState(initial?.equipment || '')
  const [generating, setGenerating] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const generate = async () => {
    if (!goals.trim()) return
    setGenerating(true)
    const res = await generateAndSavePlan({ goals, daysPerWeek: days, equipment })
    setGenerating(false)
    if (res.success && res.plan) { onSaved(res.plan); toast({ title: 'Plan ready', description: 'Your weekly plan is set.' }) }
    else toast({ title: 'Error', description: res.error || 'Failed.', variant: 'destructive' })
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(SCHEDULE_COPY_PROMPT)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
      toast({ title: 'Copied', description: 'Run it in ChatGPT with your schedule, then paste the JSON back.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Select the text manually.', variant: 'destructive' })
    }
  }

  const importSchedule = async () => {
    if (!importText.trim()) return
    setImporting(true)
    const res = await saveImportedPlan(importText)
    setImporting(false)
    if (res.success && res.plan) { onSaved(res.plan); setImportText(''); toast({ title: 'Schedule imported', description: 'Your plan is set.' }) }
    else toast({ title: 'Error', description: res.error || 'Failed.', variant: 'destructive' })
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex gap-1.5">
        <Button size="sm" variant={mode === 'ai' ? 'default' : 'outline'} onClick={() => setMode('ai')}>
          <Sparkles className="h-4 w-4 mr-1.5" />AI builds it
        </Button>
        <Button size="sm" variant={mode === 'paste' ? 'default' : 'outline'} onClick={() => setMode('paste')}>
          <ClipboardPaste className="h-4 w-4 mr-1.5" />Paste my plan
        </Button>
      </div>

      {mode === 'ai' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Your goal &amp; any preferences</label>
            <Textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={2}
              placeholder="e.g. Build muscle, push/pull/legs, prioritize chest and back, intermediate" disabled={generating} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Days / week</label>
              <Input type="number" min={1} max={7} value={days} onChange={(e) => setDays(Math.min(7, Math.max(1, +e.target.value || 1)))} disabled={generating} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Equipment</label>
              <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="full gym / dumbbells / bodyweight" disabled={generating} />
            </div>
          </div>
          <Button onClick={generate} disabled={generating || !goals.trim()}>
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Building…</> : <><Sparkles className="h-4 w-4 mr-1.5" />Generate plan</>}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Have a plan already? Copy the prompt, run it in ChatGPT with your schedule, and paste the JSON it returns.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={copyPrompt} className="bg-white">
            {copied ? <Check className="h-4 w-4 mr-1.5 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copied ? 'Copied!' : 'Copy prompt for ChatGPT'}
          </Button>
          <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={5}
            placeholder="Paste the JSON block from ChatGPT here…" disabled={importing} className="font-mono text-xs" />
          <Button onClick={importSchedule} disabled={importing || !importText.trim()}>
            {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</> : 'Import schedule'}
          </Button>
        </div>
      )}
    </Card>
  )
}

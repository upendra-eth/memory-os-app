'use client'

import { useEffect, useState } from 'react'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/components/auth-provider'
import {
  getActivePlan, generateAndSavePlan, saveImportedPlan, type SavedPlan,
  getHabits, addHabit, toggleHabitDay, deleteHabit, type Habit,
  getTasks, addTask, toggleTask, deleteTask, type Task,
} from '@/app/plan-actions'
import { SCHEDULE_COPY_PROMPT } from '@/lib/prompts/schedule'
import { Dumbbell, Repeat, CheckSquare, Plus, Trash2, Loader2, Sparkles, Flame, Check, Copy, ClipboardPaste } from 'lucide-react'

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function PlanPage() {
  const { user, isLoading: authLoading } = useAuth()

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Plan &amp; Track</h1>
            <p className="text-muted-foreground mt-1">Turn goals into a workout plan, build daily habits, and run your day.</p>
          </header>

          {authLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !user ? (
            <Card className="p-10 text-center text-muted-foreground">Please sign in.</Card>
          ) : (
            <Tabs defaultValue="plan">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="plan"><Dumbbell className="h-4 w-4 mr-1.5" />Plan</TabsTrigger>
                <TabsTrigger value="habits"><Repeat className="h-4 w-4 mr-1.5" />Habits</TabsTrigger>
                <TabsTrigger value="tasks"><CheckSquare className="h-4 w-4 mr-1.5" />Tasks</TabsTrigger>
              </TabsList>
              <TabsContent value="plan" className="mt-5"><PlanTab /></TabsContent>
              <TabsContent value="habits" className="mt-5"><HabitsTab /></TabsContent>
              <TabsContent value="tasks" className="mt-5"><TasksTab /></TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  )
}

// ---- Exercise plan --------------------------------------------------------

function PlanTab() {
  const [plan, setPlan] = useState<SavedPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState('')
  const [days, setDays] = useState(4)
  const [equipment, setEquipment] = useState('')
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const { toast } = useToast()

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(SCHEDULE_COPY_PROMPT)
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 2000)
      toast({ title: 'Copied', description: 'Run it in ChatGPT with your schedule, then paste the JSON back here.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Select the text manually.', variant: 'destructive' })
    }
  }

  const importSchedule = async () => {
    if (!importText.trim()) return
    setImporting(true)
    const res = await saveImportedPlan(importText)
    setImporting(false)
    if (res.success && res.plan) {
      setPlan(res.plan)
      setEditing(false)
      setImportText('')
      toast({ title: 'Schedule imported', description: 'Your plan is set.' })
    } else {
      toast({ title: 'Error', description: res.error || 'Failed.', variant: 'destructive' })
    }
  }

  useEffect(() => {
    getActivePlan().then((p) => {
      setPlan(p)
      if (p) { setGoals(p.goals); setDays(p.days_per_week || 4); setEquipment(p.equipment || '') }
      else setEditing(true)
      setLoading(false)
    })
  }, [])

  const generate = async () => {
    if (!goals.trim()) return
    setGenerating(true)
    const res = await generateAndSavePlan({ goals, daysPerWeek: days, equipment })
    setGenerating(false)
    if (res.success && res.plan) {
      setPlan(res.plan)
      setEditing(false)
      toast({ title: 'Plan ready', description: 'Your weekly plan is set.' })
    } else {
      toast({ title: 'Error', description: res.error || 'Failed.', variant: 'destructive' })
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="space-y-5">
      {(editing || !plan) && (
        <Card className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">What&apos;s your goal?</label>
            <Textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={2}
              placeholder="e.g. Build muscle and lose fat, focus on legs and core, intermediate level" disabled={generating} />
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
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Building your plan…</> : <><Sparkles className="h-4 w-4 mr-1.5" />Generate plan</>}
          </Button>
        </Card>
      )}

      {/* Import your own schedule */}
      {(editing || !plan) && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Already have a schedule?</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Built one in ChatGPT or elsewhere? Copy the prompt, run it in ChatGPT with your schedule, and paste the JSON it returns here.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={copyPrompt} className="bg-white">
            {copiedPrompt ? <Check className="h-4 w-4 mr-1.5 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copiedPrompt ? 'Copied!' : 'Copy prompt for ChatGPT'}
          </Button>
          <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={5}
            placeholder='Paste the JSON block from ChatGPT here…' disabled={importing} className="font-mono text-xs" />
          <Button onClick={importSchedule} disabled={importing || !importText.trim()}>
            {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</> : 'Import schedule'}
          </Button>
        </Card>
      )}

      {plan && !editing && (
        <div className="space-y-4 stagger">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">{plan.plan.summary}</p>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="flex-shrink-0">Regenerate</Button>
          </div>
          {plan.plan.weekly?.map((d, i) => {
            const rest = !d.exercises?.length
            return (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-semibold">{d.day}</span>
                  <Badge variant={rest ? 'outline' : 'secondary'} className="capitalize">{d.focus}</Badge>
                </div>
                {rest ? (
                  <p className="text-sm text-muted-foreground">Rest &amp; recover.</p>
                ) : (
                  <div className="space-y-1.5">
                    {d.exercises.map((ex, j) => (
                      <div key={j} className="flex items-baseline justify-between gap-3 text-sm border-b border-border/50 last:border-0 py-1">
                        <span className="font-medium">{ex.name}</span>
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap">{ex.sets} × {ex.reps}{ex.notes ? ` · ${ex.notes}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
          {plan.plan.tips?.length > 0 && (
            <Card className="p-4 bg-primary/5 border-primary/20">
              <p className="text-sm font-medium mb-2">Coach tips</p>
              <ul className="space-y-1.5">
                {plan.plan.tips.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm"><Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />{t}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Habits ---------------------------------------------------------------

function currentStreak(completions: string[]): number {
  const set = new Set(completions)
  let streak = 0
  const d = new Date()
  // If today isn't done yet, start counting from yesterday so the streak doesn't read 0 mid-day.
  if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (set.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function HabitsTab() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const today = todayStr()
  const { toast } = useToast()

  useEffect(() => { getHabits().then((h) => { setHabits(h); setLoading(false) }) }, [])

  const add = async () => {
    if (!title.trim()) return
    setBusy(true)
    const res = await addHabit(title)
    setBusy(false)
    if (res.success && res.habit) { setHabits((p) => [...p, res.habit!]); setTitle('') }
    else toast({ title: 'Error', description: 'Failed to add habit.', variant: 'destructive' })
  }

  const toggle = async (h: Habit) => {
    const res = await toggleHabitDay(h.id, today)
    if (res.success && res.completions) setHabits((p) => p.map((x) => x.id === h.id ? { ...x, completions: res.completions! } : x))
  }

  const remove = async (id: string) => { setHabits((p) => p.filter((x) => x.id !== id)); await deleteHabit(id) }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="space-y-4">
      <Card className="p-3 flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New habit, e.g. Drink 3L water"
          onKeyDown={(e) => e.key === 'Enter' && add()} disabled={busy} />
        <Button onClick={add} disabled={busy || !title.trim()}><Plus className="h-4 w-4" /></Button>
      </Card>

      {habits.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No habits yet. Add one above and check it off daily.</Card>
      ) : (
        <div className="space-y-2 stagger">
          {habits.map((h) => {
            const done = h.completions.includes(today)
            const streak = currentStreak(h.completions)
            return (
              <Card key={h.id} className="p-3 flex items-center gap-3">
                <button onClick={() => toggle(h)} aria-label="Toggle done"
                  className={`h-9 w-9 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${done ? 'bg-primary border-primary text-primary-foreground' : 'border-input hover:border-primary'}`}>
                  {done && <Check className="h-5 w-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${done ? 'text-muted-foreground line-through' : ''}`}>{h.title}</p>
                  {streak > 0 && <p className="text-xs text-orange-600 flex items-center gap-1"><Flame className="h-3 w-3" />{streak}-day streak</p>}
                </div>
                <button onClick={() => remove(h.id)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"><Trash2 className="h-4 w-4" /></button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---- Tasks ----------------------------------------------------------------

function TasksTab() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const today = todayStr()
  const { toast } = useToast()

  useEffect(() => { getTasks(today).then((t) => { setTasks(t); setLoading(false) }) }, [today])

  const add = async () => {
    if (!title.trim()) return
    setBusy(true)
    const res = await addTask(title, today)
    setBusy(false)
    if (res.success && res.task) { setTasks((p) => [...p, res.task!]); setTitle('') }
    else toast({ title: 'Error', description: 'Failed to add task.', variant: 'destructive' })
  }

  const toggle = async (t: Task) => {
    setTasks((p) => p.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))
    await toggleTask(t.id, !t.done)
  }

  const remove = async (id: string) => { setTasks((p) => p.filter((x) => x.id !== id)); await deleteTask(id) }

  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="space-y-4">
      <Card className="p-3 flex gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task for today"
          onKeyDown={(e) => e.key === 'Enter' && add()} disabled={busy} />
        <Button onClick={add} disabled={busy || !title.trim()}><Plus className="h-4 w-4" /></Button>
      </Card>

      {tasks.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No tasks. Add what you want to get done today.</Card>
      ) : (
        <div className="space-y-2">
          {open.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onDelete={() => remove(t.id)} />)}
          {done.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground uppercase tracking-wide pt-2">Done ({done.length})</p>
              {done.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onDelete={() => remove(t.id)} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const stale = task.task_date && task.task_date < todayStr() && !task.done
  return (
    <Card className="p-3 flex items-center gap-3">
      <button onClick={onToggle} aria-label="Toggle done"
        className={`h-6 w-6 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${task.done ? 'bg-primary border-primary text-primary-foreground' : 'border-input hover:border-primary'}`}>
        {task.done && <Check className="h-4 w-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.done ? 'text-muted-foreground line-through' : ''}`}>{task.title}</p>
        {stale && <p className="text-xs text-amber-600">carried over from {new Date(task.task_date!).toLocaleDateString('en-IN')}</p>}
      </div>
      <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"><Trash2 className="h-4 w-4" /></button>
    </Card>
  )
}

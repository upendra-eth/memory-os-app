'use client'

import { useEffect, useState } from 'react'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/components/auth-provider'
import {
  getHealthIssues,
  saveHealthIssue,
  updateHealthIssue,
  deleteHealthIssue,
  type HealthIssue,
} from '@/app/health-actions'
import { Loader2, Trash2, Plus, HeartPulse, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-amber-500/10 text-amber-600',
  improving: 'bg-blue-500/10 text-blue-600',
  resolved: 'bg-emerald-500/10 text-emerald-600',
}
const STATUSES = ['active', 'improving', 'resolved'] as const

export default function IssuesPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [issues, setIssues] = useState<HealthIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    getHealthIssues()
      .then(setIssues)
      .finally(() => setLoading(false))
  }, [authLoading, user])

  const handleSave = async () => {
    if (!text.trim()) return
    setSaving(true)
    const res = await saveHealthIssue(text)
    setSaving(false)
    if (res.success && res.issue) {
      setIssues((prev) => [res.issue!, ...prev])
      setText('')
      toast({ title: 'Logged', description: `“${res.issue.title}” is now being tracked.` })
    } else {
      toast({ title: 'Error', description: res.error || 'Failed to save.', variant: 'destructive' })
    }
  }

  const handleUpdated = (issue: HealthIssue) => {
    setIssues((prev) => prev.map((i) => (i.id === issue.id ? issue : i)))
  }

  const handleDelete = async (id: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== id))
    await deleteHealthIssue(id)
  }

  const active = issues.filter((i) => i.status !== 'resolved')
  const resolved = issues.filter((i) => i.status === 'resolved')

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Health Issues</h1>
            <p className="text-muted-foreground mt-1">
              Track ongoing things you&apos;re dealing with — pain, posture, hair fall, sleep, skin, energy — and how they change over time.
            </p>
          </header>

          {/* Add an issue */}
          <Card className="p-4 space-y-3">
            <label className="block text-sm font-medium">What&apos;s bothering you?</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Hair fall getting worse over the last 2 months, especially at the crown. Started around April."
              rows={3}
              disabled={saving}
            />
            <Button onClick={handleSave} disabled={saving || !text.trim()}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Plus className="h-4 w-4 mr-1.5" /> Track this issue</>}
            </Button>
          </Card>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : issues.length === 0 ? (
            <Card className="p-10 text-center space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto">
                <HeartPulse className="h-6 w-6" />
              </div>
              <p className="text-muted-foreground">No issues tracked yet. Describe anything you&apos;re dealing with above.</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {active.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active ({active.length})</h2>
                  {active.map((i) => <IssueCard key={i.id} issue={i} onUpdated={handleUpdated} onDelete={() => handleDelete(i.id)} />)}
                </section>
              )}
              {resolved.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Resolved ({resolved.length})</h2>
                  {resolved.map((i) => <IssueCard key={i.id} issue={i} onUpdated={handleUpdated} onDelete={() => handleDelete(i.id)} />)}
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function IssueCard({
  issue,
  onUpdated,
  onDelete,
}: {
  issue: HealthIssue
  onUpdated: (i: HealthIssue) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const apply = async (patch: { note?: string; status?: string }) => {
    setBusy(true)
    const res = await updateHealthIssue(issue.id, patch)
    setBusy(false)
    if (res.success && res.issue) {
      onUpdated(res.issue)
      setNote('')
      if (patch.status) toast({ title: 'Updated', description: `Marked “${issue.title}” as ${patch.status}.` })
    } else {
      toast({ title: 'Error', description: res.error || 'Failed.', variant: 'destructive' })
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold leading-tight">{issue.title}</h3>
            <Badge className={`capitalize ${STATUS_STYLES[issue.status] || ''}`} variant="secondary">{issue.status}</Badge>
            {issue.category && <Badge variant="outline" className="capitalize text-[10px]">{issue.category}</Badge>}
            {typeof issue.severity_1_10 === 'number' && (
              <span className="text-xs text-muted-foreground">severity {issue.severity_1_10}/10</span>
            )}
          </div>
          {issue.description && <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>}
          {issue.started_on && (
            <p className="text-xs text-muted-foreground mt-1">Since {new Date(issue.started_on).toLocaleDateString('en-IN')}</p>
          )}
        </div>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0" aria-label="Delete issue">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Status quick-actions */}
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.filter((s) => s !== issue.status).map((s) => (
          <Button key={s} size="sm" variant="outline" disabled={busy} onClick={() => apply({ status: s })} className="h-7 text-xs capitalize">
            Mark {s}
          </Button>
        ))}
      </div>

      {/* Updates log */}
      {issue.updates.length > 0 && (
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {issue.updates.length} update{issue.updates.length > 1 ? 's' : ''}
        </button>
      )}
      {open && (
        <ul className="space-y-2 border-l-2 border-border pl-3">
          {issue.updates.slice().reverse().map((u, idx) => (
            <li key={idx} className="text-sm">
              <span className="text-xs text-muted-foreground">{new Date(u.at).toLocaleDateString('en-IN')}</span>
              {u.status && <Badge variant="outline" className="ml-2 text-[10px] capitalize">{u.status}</Badge>}
              {u.note && <p className="text-foreground/90">{u.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Add an update */}
      <div className="flex gap-2 pt-1">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add an update (e.g. tried new shampoo, slightly better)…"
          disabled={busy}
          onKeyDown={(e) => e.key === 'Enter' && note.trim() && apply({ note })}
          className="text-sm"
        />
        <Button size="sm" variant="secondary" disabled={busy || !note.trim()} onClick={() => apply({ note })}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log'}
        </Button>
      </div>
    </Card>
  )
}

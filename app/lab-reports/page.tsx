'use client'

import { useEffect, useState } from 'react'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/components/auth-provider'
import {
  getHealthReports,
  saveHealthReport,
  deleteHealthReport,
  type HealthReport,
} from '@/app/health-actions'
import { REPORT_COPY_PROMPT } from '@/lib/prompts/health'
import {
  FlaskConical,
  Copy,
  Check,
  Loader2,
  Trash2,
  AlertTriangle,
  Stethoscope,
  Scale,
} from 'lucide-react'

const TYPE_META: Record<string, { label: string; icon: typeof FlaskConical }> = {
  lab: { label: 'Lab panel', icon: FlaskConical },
  checkup: { label: 'Full checkup', icon: Stethoscope },
  body_composition: { label: 'Body composition', icon: Scale },
}

export default function HealthReportsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [reports, setReports] = useState<HealthReport[]>([])
  const [loading, setLoading] = useState(true)
  const [paste, setPaste] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    getHealthReports()
      .then(setReports)
      .finally(() => setLoading(false))
  }, [authLoading, user])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(REPORT_COPY_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast({ title: 'Copied', description: 'Paste it into ChatGPT with your report, then paste its reply back here.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Select the text manually.', variant: 'destructive' })
    }
  }

  const handleSave = async () => {
    if (!paste.trim()) return
    setSaving(true)
    const res = await saveHealthReport(paste)
    setSaving(false)
    if (res.success && res.report) {
      setReports((prev) => [res.report!, ...prev])
      setPaste('')
      toast({ title: 'Saved', description: `${res.report.test_name} added to your history.` })
    } else {
      toast({ title: 'Error', description: res.error || 'Failed to save.', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id))
    await deleteHealthReport(id)
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Health Reports</h1>
            <p className="text-muted-foreground mt-1">
              Lab panels, full-body checkups, and gym body-composition (InBody) scans — all in one place.
            </p>
          </header>

          {/* How-to / paste box */}
          <Card className="p-4 bg-blue-50 border-blue-200 space-y-3">
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Add a report</h3>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Copy the prompt below and open ChatGPT (or Google AI Studio).</li>
                <li>Paste the prompt, then attach your report PDF or a photo of it.</li>
                <li>Copy ChatGPT&apos;s JSON reply and paste it in the box here, then Save.</li>
              </ol>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={handleCopy} className="bg-white">
              {copied ? <Check className="h-4 w-4 mr-1.5 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1.5" />}
              {copied ? 'Copied!' : 'Copy report prompt for ChatGPT'}
            </Button>
          </Card>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Paste ChatGPT&apos;s reply (or the raw report text)</label>
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Paste the JSON block ChatGPT returns, or just paste the raw report text and we\'ll structure it.'}
              rows={8}
              disabled={saving}
              className="font-mono text-sm"
            />
            <Button onClick={handleSave} disabled={saving || !paste.trim()} className="w-full sm:w-auto">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Save report'}
            </Button>
          </div>

          {/* History */}
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Your reports</h2>
            {loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : reports.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                No reports yet. Add your first lab panel, checkup, or body scan above.
              </Card>
            ) : (
              reports.map((r) => <ReportCard key={r.id} report={r} onDelete={() => handleDelete(r.id)} />)
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function ReportCard({ report, onDelete }: { report: HealthReport; onDelete: () => void }) {
  const meta = TYPE_META[report.report_type] || TYPE_META.lab
  const Icon = meta.icon
  const flagged = report.markers.filter((m) => m.flag === 'low' || m.flag === 'high')

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">{report.test_name}</h3>
            <p className="text-xs text-muted-foreground">
              {meta.label}
              {report.test_date ? ` · ${new Date(report.test_date).toLocaleDateString('en-IN')}` : ''}
            </p>
          </div>
        </div>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete report">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {report.summary && (
        <p className="text-sm text-foreground/90 bg-secondary/50 rounded-md p-3">{report.summary}</p>
      )}

      {report.markers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Marker</th>
                <th className="py-1 pr-3 font-medium">Value</th>
                <th className="py-1 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody>
              {report.markers.map((m, i) => {
                const out = m.flag === 'low' || m.flag === 'high'
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-1.5 pr-3">{m.name}</td>
                    <td className={`py-1.5 pr-3 tabular-nums font-medium ${out ? 'text-amber-600' : ''}`}>
                      {m.value ?? '—'}{m.unit ? ` ${m.unit}` : ''}
                      {m.flag && m.flag !== 'normal' ? <Badge variant="outline" className="ml-2 text-[10px] capitalize">{m.flag}</Badge> : null}
                    </td>
                    <td className="py-1.5 text-muted-foreground tabular-nums">
                      {m.reference_min != null || m.reference_max != null
                        ? `${m.reference_min ?? '—'}–${m.reference_max ?? '—'}`
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {flagged.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{flagged.length} marker{flagged.length > 1 ? 's' : ''} outside the reference range. Educational only — discuss with your doctor.</span>
        </div>
      )}
    </Card>
  )
}

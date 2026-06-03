'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { getMindData, type MindData } from '@/app/insights-actions'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { Quote, Sparkles, Lightbulb, Flag, HelpCircle, AlertTriangle } from 'lucide-react'

const TALK_STYLES: Record<string, string> = {
  distortion: 'text-orange-600 border-orange-300',
  belief: 'text-blue-600 border-blue-300',
  identity: 'text-violet-600 border-violet-300',
}

const THOUGHT_META: Record<string, { icon: typeof Sparkles; tint: string; label: string }> = {
  insight: { icon: Sparkles, tint: 'text-emerald-600', label: 'insight' },
  idea: { icon: Lightbulb, tint: 'text-amber-600', label: 'idea' },
  decision: { icon: Flag, tint: 'text-blue-600', label: 'decision' },
  question: { icon: HelpCircle, tint: 'text-violet-600', label: 'question' },
  problem: { icon: AlertTriangle, tint: 'text-orange-600', label: 'problem' },
}

export function MindView() {
  const [data, setData] = useState<MindData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMindData()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  if (!data) return null

  const hasAny =
    data.mentalSeries.length > 0 ||
    data.emotions.length > 0 ||
    data.thoughts.length > 0 ||
    data.selfTalk.length > 0 ||
    data.ruminations.length > 0
  if (!hasAny) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        Nothing logged for mind & mood yet. Mention how you felt, your stress/focus, or recurring thoughts in your entries.
      </Card>
    )
  }

  const chartData = data.mentalSeries.map((m) => ({
    date: new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    stress: m.stress,
    anxiety: m.anxiety,
    focus: m.focus,
    motivation: m.motivation,
  }))

  return (
    <div className="space-y-6">
      {/* Mental state trend */}
      {chartData.length > 1 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Mental state over time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis domain={[0, 10]} fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="stress" stroke="#ef4444" name="Stress" dot={false} connectNulls />
              <Line type="monotone" dataKey="anxiety" stroke="#f59e0b" name="Anxiety" dot={false} connectNulls />
              <Line type="monotone" dataKey="focus" stroke="#3b82f6" name="Focus" dot={false} connectNulls />
              <Line type="monotone" dataKey="motivation" stroke="#10b981" name="Motivation" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Thoughts & analysis — ChatGPT's cognition (insights/ideas/decisions/…) */}
      {data.thoughts.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Thoughts & analysis</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Insights, ideas and decisions captured from your logs.
          </p>
          <div className="space-y-2.5">
            {data.thoughts.slice(0, 20).map((t, i) => {
              const meta = THOUGHT_META[t.kind] || THOUGHT_META.insight
              const Icon = meta.icon
              return (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${meta.tint}`} />
                  <span className="flex-1">{t.text}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap mt-0.5">
                    {meta.label} ·{' '}
                    {new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Emotions */}
      {data.emotions.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Feelings & triggers</h3>
          <div className="space-y-3">
            {data.emotions.slice(0, 8).map((e) => (
              <div key={e.feeling} className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <span className="font-medium capitalize">{e.feeling}</span>
                  {e.triggers.length > 0 && (
                    <span className="text-xs text-muted-foreground"> · often from {e.triggers.join(', ')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                  <span>{e.count}×</span>
                  <span className="tabular-nums">avg {e.avgIntensity}/10</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Self-talk */}
      {data.selfTalk.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Self-talk</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Recurring thoughts, tagged. Watch the <span className="text-orange-600 font-medium">distortions</span> — those
            are worth reframing.
          </p>
          <div className="space-y-2">
            {data.selfTalk.slice(0, 12).map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Quote className="h-3.5 w-3.5 mt-1 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1">{s.text}</span>
                <Badge variant="outline" className={TALK_STYLES[s.type] || ''}>
                  {s.type}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Ruminations */}
      {data.ruminations.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">Things on your mind</h3>
          <div className="space-y-2">
            {data.ruminations.slice(0, 8).map((r, i) => (
              <div key={i} className="text-sm">
                <span className="text-xs text-muted-foreground tabular-nums mr-2">
                  {new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {r.note}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

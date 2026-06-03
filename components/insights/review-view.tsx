'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { generateReview } from '@/app/insights-actions'
import { Sparkles, AlertCircle } from 'lucide-react'

export function ReviewView() {
  const [period, setPeriod] = useState<'7' | '30'>('7')
  const [loading, setLoading] = useState(false)
  const [review, setReview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    setReview(null)
    const res = await generateReview(period === '7' ? 7 : 30)
    if (res.success && res.review) setReview(res.review)
    else setError(res.error || 'Failed to generate review')
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs
          value={period}
          onValueChange={(v) => {
            setPeriod(v as '7' | '30')
            setReview(null)
            setError(null)
          }}
        >
          <TabsList>
            <TabsTrigger value="7">This Week</TabsTrigger>
            <TabsTrigger value="30">This Month</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={run} disabled={loading}>
          <Sparkles className="h-4 w-4 mr-2" />
          {loading ? 'Generating…' : review ? 'Regenerate' : 'Generate review'}
        </Button>
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Spinner />
          <p className="text-sm">Reading your {period === '7' ? 'week' : 'month'}…</p>
        </div>
      )}

      {error && (
        <Card className="p-4 flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
          {error}
        </Card>
      )}

      {review && (
        <Card className="p-6">
          <Markdown text={review} />
        </Card>
      )}

      {!loading && !review && !error && (
        <Card className="p-10 text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-40" />
          Get an AI-written summary of your {period === '7' ? 'week' : 'month'} — wins, patterns, and what to focus on next.
        </Card>
      )}
    </div>
  )
}

/** Minimal markdown renderer: ## headings, - bullets, **bold**, paragraphs. */
function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let list: string[] = []

  const flushList = (key: string) => {
    if (list.length === 0) return
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1 my-2 text-sm">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    )
    list = []
  }

  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      flushList(`l-${i}`)
      blocks.push(
        <h3 key={i} className="text-base font-semibold mt-4 mb-1 first:mt-0">
          {inline(line.slice(3))}
        </h3>
      )
    } else if (line.startsWith('# ')) {
      flushList(`l-${i}`)
      blocks.push(
        <h2 key={i} className="text-lg font-bold mt-4 mb-1 first:mt-0">
          {inline(line.slice(2))}
        </h2>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      list.push(line.slice(2))
    } else if (line === '') {
      flushList(`l-${i}`)
    } else {
      flushList(`l-${i}`)
      blocks.push(
        <p key={i} className="text-sm my-2 leading-relaxed">
          {inline(line)}
        </p>
      )
    }
  })
  flushList('l-end')

  return <div>{blocks}</div>
}

/** Render **bold** segments within a line. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  )
}

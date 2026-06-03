'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { getCorrelations, type Correlation } from '@/app/insights-actions'
import { ArrowUpRight, ArrowDownRight, Link2 } from 'lucide-react'

export function CorrelationsView() {
  const [data, setData] = useState<{ n: number; correlations: Correlation[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCorrelations()
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

  if (data.n < 5) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        <Link2 className="h-8 w-8 mx-auto mb-3 opacity-40" />
        Correlations need at least ~5 logged days to be meaningful. You have {data.n}. Keep logging daily and patterns will appear here.
      </Card>
    )
  }

  if (data.correlations.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        No strong patterns yet across your {data.n} logged days. As more data accumulates, real relationships will surface.
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Relationships found across your <strong>{data.n}</strong> logged days. Correlation isn't causation — treat these as
        leads to test, not laws.
      </p>
      {data.correlations.map((c, i) => {
        const positive = c.r > 0
        const strong = Math.abs(c.r) >= 0.6
        return (
          <Card key={i} className="p-4 flex items-start gap-3">
            <div
              className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                positive ? 'text-emerald-600 bg-emerald-500/10' : 'text-orange-600 bg-orange-500/10'
              }`}
            >
              {positive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{c.sentence}</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="capitalize">{c.a}</span> ↔ <span className="capitalize">{c.b}</span> · r={c.r} ·{' '}
                {c.n} days · {strong ? 'strong' : 'moderate'} link
              </p>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

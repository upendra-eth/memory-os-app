'use client'

import { Card } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'
import type { DayDigest } from '@/app/day-actions'

interface DigestCardProps {
  digest: DayDigest
}

export function DigestCard({ digest }: DigestCardProps) {
  return (
    <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 to-cyan-500/5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
          AI Day Digest
        </h2>
      </div>

      {digest.full_day_digest && (
        <p className="text-base leading-relaxed mb-4">{digest.full_day_digest}</p>
      )}

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        {digest.morning_summary && (
          <div>
            <p className="font-medium text-muted-foreground mb-1">Morning</p>
            <p>{digest.morning_summary}</p>
          </div>
        )}
        {digest.afternoon_summary && (
          <div>
            <p className="font-medium text-muted-foreground mb-1">Afternoon</p>
            <p>{digest.afternoon_summary}</p>
          </div>
        )}
        {digest.evening_summary && (
          <div>
            <p className="font-medium text-muted-foreground mb-1">Evening</p>
            <p>{digest.evening_summary}</p>
          </div>
        )}
      </div>

      {digest.patterns_noticed && digest.patterns_noticed.length > 0 && (
        <div className="mt-4 pt-4 border-t border-primary/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Patterns noticed
          </p>
          <ul className="space-y-1 text-sm">
            {digest.patterns_noticed.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

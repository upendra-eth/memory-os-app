'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { Entry } from '@/lib/types'
import type { ExtractedJSON } from '@/lib/extraction-schema'

interface EntryCardProps {
  entry: Entry
  index: number
}

export function EntryCard({ entry, index }: EntryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const extracted = entry.extracted_json as ExtractedJSON | undefined

  const getTimeFromEntry = (created: string) => {
    try {
      const date = new Date(created)
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return '—'
    }
  }

  const getSummaryItems = () => {
    const items: string[] = []

    if (extracted?.body?.weight_today_kg) {
      items.push(`Weight: ${extracted.body.weight_today_kg}kg`)
    }
    if (extracted?.body?.sleep_hours) {
      items.push(`Sleep: ${extracted.body.sleep_hours}h`)
    }
    if (extracted?.nutrition && extracted.nutrition.length > 0) {
      const totalKcal = extracted.nutrition.reduce((sum, n) => sum + (n.est_kcal || 0), 0)
      items.push(`${totalKcal} kcal`)
    }
    if (extracted?.workouts && extracted.workouts.length > 0) {
      items.push(`${extracted.workouts.length} workout(s)`)
    }
    if (extracted?.cardio && extracted.cardio.length > 0) {
      items.push(`${extracted.cardio.length} cardio`)
    }
    if (extracted?.symptoms && extracted.symptoms.length > 0) {
      items.push(`${extracted.symptoms.length} symptom(s)`)
    }
    if (extracted?.emotions && extracted.emotions.length > 0) {
      items.push(`${extracted.emotions.length} emotion(s)`)
    }

    return items
  }

  const summaryItems = getSummaryItems()

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <p className="text-sm font-medium text-muted-foreground">
                {getTimeFromEntry(entry.created_at)}
              </p>
            </div>
            <p className="text-sm line-clamp-2">{entry.narrative_text || entry.raw_text}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {/* Summary Tags */}
        {summaryItems.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summaryItems.map((item, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {item}
              </Badge>
            ))}
          </div>
        )}

        {/* Expanded Details */}
        {isExpanded && (
          <div className="pt-3 border-t space-y-3">
            {entry.summary && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                <p className="text-sm">{entry.summary}</p>
              </div>
            )}

            {extracted?.nutrition && extracted.nutrition.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Nutrition</p>
                <div className="space-y-1 text-sm">
                  {extracted.nutrition.map((n, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{n.item}</span>
                      <span className="text-muted-foreground">
                        {n.est_kcal} kcal
                        {n.protein_g && ` (${n.protein_g}g P)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {extracted?.workouts && extracted.workouts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Workouts</p>
                <div className="space-y-1 text-sm">
                  {extracted.workouts.map((w, idx) => (
                    <div key={idx}>
                      <span className="font-medium">{w.exercise}</span>
                      {w.sets && w.reps && <span className="text-muted-foreground"> × {w.sets} × {w.reps}</span>}
                      {w.weight_kg && <span className="text-muted-foreground"> @ {w.weight_kg}kg</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {extracted?.reflection && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Reflection</p>
                <div className="text-sm space-y-1">
                  <p>
                    <strong>Rating:</strong> {extracted.reflection.rating_1_10}/10
                  </p>
                  <p>
                    <strong>High:</strong> {extracted.reflection.high}
                  </p>
                  <p>
                    <strong>Low:</strong> {extracted.reflection.low}
                  </p>
                  <p>
                    <strong>Lesson:</strong> {extracted.reflection.lesson}
                  </p>
                </div>
              </div>
            )}

            {extracted?.social && extracted.social.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Social</p>
                <div className="space-y-1 text-sm">
                  {extracted.social.map((s, idx) => (
                    <div key={idx}>
                      <span className="font-medium">{s.person}</span>
                      <span className="text-muted-foreground"> ({s.mode})</span>
                      {s.quality_1_10 && <span className="text-muted-foreground"> - {s.quality_1_10}/10</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

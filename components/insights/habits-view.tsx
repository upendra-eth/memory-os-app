'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { getHabitsData, type HabitsData } from '@/app/insights-actions'
import { Flame, CalendarCheck, Trophy } from 'lucide-react'

export function HabitsView() {
  const [data, setData] = useState<HabitsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getHabitsData()
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

  // Colour scale for the heatmap. -1 = not logged, null = logged-unrated, 1-10 = day rating.
  const cellColor = (rating: number | null) => {
    if (rating === -1) return 'bg-muted/40'
    if (rating == null) return 'bg-emerald-500/30'
    if (rating >= 8) return 'bg-emerald-600'
    if (rating >= 6) return 'bg-emerald-500'
    if (rating >= 4) return 'bg-amber-400'
    return 'bg-orange-400'
  }

  // Build 14 columns (weeks) × 7 rows (days)
  const weeks: { date: string; rating: number | null }[][] = []
  for (let w = 0; w < data.heatmap.length; w += 7) {
    weeks.push(data.heatmap.slice(w, w + 7))
  }

  return (
    <div className="space-y-6">
      {/* Streak stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Flame className="h-4 w-4" />} label="Current streak" value={`${data.loggingStreak}d`} tint="text-orange-600 bg-orange-500/10" />
        <StatCard icon={<Trophy className="h-4 w-4" />} label="Longest streak" value={`${data.longestStreak}d`} tint="text-amber-600 bg-amber-500/10" />
        <StatCard icon={<CalendarCheck className="h-4 w-4" />} label="Days logged" value={`${data.daysLogged}`} tint="text-emerald-600 bg-emerald-500/10" />
      </div>

      {/* Heatmap */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Logging consistency · last 14 weeks</h3>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((cell) => (
                <div
                  key={cell.date}
                  title={`${cell.date}${cell.rating === -1 ? ' · not logged' : cell.rating == null ? ' · logged' : ` · day ${cell.rating}/10`}`}
                  className={`h-3.5 w-3.5 rounded-sm ${cellColor(cell.rating)}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-muted/40 inline-block" /> none</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-400 inline-block" /> low</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-600 inline-block" /> great day</span>
        </div>
      </Card>

      {/* Per-habit */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Habits</h3>
        {data.habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No habits logged yet. Mention things like "meditated", "skipped sugar", or "took vitamins" in your entries and they'll show up here.
          </p>
        ) : (
          <div className="space-y-3">
            {data.habits.map((h) => (
              <div key={h.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium capitalize">
                    {h.name}
                    {h.currentStreak > 1 && (
                      <span className="ml-2 text-xs text-orange-600">🔥 {h.currentStreak}d</span>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {h.done}✓ {h.skipped > 0 && `· ${h.skipped}✗`} · {h.consistency}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${h.consistency}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: string; tint: string }) {
  return (
    <Card className="p-4">
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg mb-2 ${tint}`}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  )
}

'use client'

import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Moon, Flame, Smile, Dumbbell } from 'lucide-react'
import type { DailyAggregate } from '@/lib/types'

interface DayStatsStripProps {
  aggregate?: DailyAggregate
  tdee?: number
}

export function DayStatsStrip({ aggregate, tdee = 2500 }: DayStatsStripProps) {
  const sleepTarget = 8
  const sleepPercent = aggregate?.sleep_hours ? Math.min((aggregate.sleep_hours / sleepTarget) * 100, 100) : 0

  const caloriePercent = aggregate?.calories ? Math.min((aggregate.calories / tdee) * 100, 100) : 0
  const calorieBalance = aggregate?.calories ? aggregate.calories - tdee : 0

  const getMoodColor = (score?: number) => {
    if (!score) return 'text-gray-400'
    if (score >= 4) return 'text-emerald-600'
    if (score >= 3) return 'text-amber-600'
    return 'text-red-600'
  }

  const getEnergyColor = (level?: number) => {
    if (!level) return 'bg-gray-200'
    if (level >= 4) return 'bg-emerald-500'
    if (level >= 3) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <Card className="p-4 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 border-primary/20">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Sleep */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium text-muted-foreground">Sleep</span>
          </div>
          <div className="space-y-1">
            <Progress value={sleepPercent} className="h-2" />
            <p className="text-sm font-semibold">
              {aggregate?.sleep_hours?.toFixed(1) || '—'}h
              {aggregate?.sleep_quality && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({aggregate.sleep_quality}/10)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Calories */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-medium text-muted-foreground">Calories</span>
          </div>
          <div className="space-y-1">
            <Progress value={caloriePercent} className="h-2" />
            <div>
              <p className="text-sm font-semibold">
                {aggregate?.calories || 0} / {tdee}
              </p>
              <p className={`text-xs font-medium ${calorieBalance >= 0 ? 'text-orange-600' : 'text-blue-600'}`}>
                {calorieBalance >= 0 ? '+' : ''}{calorieBalance} kcal
              </p>
            </div>
          </div>
        </div>

        {/* Mood */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Smile className={`h-4 w-4 ${getMoodColor(aggregate?.mood_score)}`} />
            <span className="text-xs font-medium text-muted-foreground">Mood</span>
          </div>
          <div>
            <p className={`text-sm font-semibold ${getMoodColor(aggregate?.mood_score)}`}>
              {aggregate?.mood_score ? `${aggregate.mood_score}/10` : '—'}
            </p>
            {aggregate?.stress_level && (
              <p className="text-xs text-muted-foreground">
                Stress: {aggregate.stress_level}/10
              </p>
            )}
          </div>
        </div>

        {/* Workouts */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium text-muted-foreground">Workouts</span>
          </div>
          <div>
            <p className="text-sm font-semibold">{aggregate?.workouts_count || 0}</p>
            {aggregate?.workout_duration_min && (
              <p className="text-xs text-muted-foreground">
                {aggregate.workout_duration_min} min
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

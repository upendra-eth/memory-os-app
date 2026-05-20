'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import Link from 'next/link'
import { ChevronRight, Calendar } from 'lucide-react'
import type { DailyAggregate } from '@/lib/types'

interface DayEntry {
  date: string
  aggregate?: DailyAggregate
  entryCount: number
}

export default function TimelinePage() {
  const [days, setDays] = useState<DayEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')
  const { profileId } = useAuth()

  useEffect(() => {
    const loadTimeline = async () => {
      setIsLoading(true)
      if (!profileId) { setIsLoading(false); return }

      try {
        const supabase = createClient()
        const numDays = range === '7d' ? 7 : range === '30d' ? 30 : 90
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - numDays)

        const { data: entries } = await supabase
          .from('entries')
          .select('created_at')
          .eq('user_id', profileId)
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false })

        const { data: aggregates } = await supabase
          .from('daily_aggregates')
          .select('*')
          .eq('user_id', profileId)
          .gte('log_date', startDate.toISOString().split('T')[0])
          .order('log_date', { ascending: false })

        const timelineMap = new Map<string, DayEntry>()

        aggregates?.forEach((agg: any) => {
          if (!timelineMap.has(agg.log_date)) {
            timelineMap.set(agg.log_date, { date: agg.log_date, aggregate: agg, entryCount: 0 })
          } else {
            timelineMap.get(agg.log_date)!.aggregate = agg
          }
        })

        entries?.forEach((entry: any) => {
          const date = entry.created_at.split('T')[0]
          if (!timelineMap.has(date)) {
            timelineMap.set(date, { date, entryCount: 1 })
          } else {
            timelineMap.get(date)!.entryCount += 1
          }
        })

        const sorted = Array.from(timelineMap.values()).sort((a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        setDays(sorted)
      } catch (error) {
        console.error('Error loading timeline:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadTimeline()
  }, [range, profileId])

  const formatDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-4xl font-bold">Timeline</h1>
          </div>
          <p className="text-muted-foreground">Your logged life over time</p>
        </div>

        <Tabs value={range} onValueChange={(v) => setRange(v as '7d' | '30d' | '90d')} className="mb-8">
          <TabsList>
            <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
            <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
            <TabsTrigger value="90d">Last 90 Days</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading timeline...</p>
          </Card>
        )}

        {!isLoading && days.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No entries in this period</p>
            <Link href="/add"><Button>Start logging</Button></Link>
          </Card>
        )}

        {!isLoading && days.length > 0 && (
          <div className="space-y-3">
            {days.map((day) => {
              const date = new Date(`${day.date}T00:00:00`)
              const isToday = date.toDateString() === new Date().toDateString()
              return (
                <Link key={day.date} href={`/day/${day.date}`}>
                  <Card className="p-4 hover:shadow-md transition-all hover:border-primary/50 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{formatDate(day.date)}</h3>
                          {isToday && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Today</span>}
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>{day.entryCount} entr{day.entryCount !== 1 ? 'ies' : 'y'}</span>
                          {day.aggregate?.calories && <span>{day.aggregate.calories} kcal</span>}
                          {day.aggregate?.sleep_hours && <span>{day.aggregate.sleep_hours.toFixed(1)}h sleep</span>}
                          {day.aggregate?.workouts_count && <span>{day.aggregate.workouts_count} workout(s)</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

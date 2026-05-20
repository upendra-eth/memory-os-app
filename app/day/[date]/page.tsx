'use client'

import { useState, useEffect, use } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DayStatsStrip } from '@/components/day-stats-strip'
import { EntryCard } from '@/components/entry-card'
import { DigestCard } from '@/components/digest-card'
import { getEntriesForDate, getDailyAggregate, getUserTDEE, getDayDigest, type DayDigest } from '@/app/day-actions'
import type { Entry, DailyAggregate } from '@/lib/types'

interface DayPageProps {
  params: Promise<{ date: string }>
}

export default function DayPage({ params }: DayPageProps) {
  const { date } = use(params)
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>([])
  const [aggregate, setAggregate] = useState<DailyAggregate | undefined>()
  const [digest, setDigest] = useState<DayDigest | undefined>()
  const [tdee, setTdee] = useState<number>(2500)
  const [isLoading, setIsLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(date)

  // Parse and validate date
  const getDateObject = (dateStr: string) => {
    try {
      const parts = dateStr.split('-')
      if (parts.length !== 3) return new Date()
      return new Date(`${dateStr}T00:00:00`)
    } catch {
      return new Date()
    }
  }

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const dateObj = getDateObject(currentDate)
  const displayDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const userEmail = localStorage.getItem('user_email')
        if (!userEmail) {
          setIsLoading(false)
          return
        }

        const [entriesResult, aggregateResult, tdeeResult, digestResult] = await Promise.all([
          getEntriesForDate(userEmail, currentDate),
          getDailyAggregate(userEmail, currentDate),
          getUserTDEE(userEmail),
          getDayDigest(userEmail, currentDate),
        ])

        setEntries(entriesResult.entries || [])
        setAggregate(aggregateResult.aggregate)
        setDigest(digestResult.digest)
        if (tdeeResult) setTdee(tdeeResult)
      } catch (error) {
        console.error('Error loading day data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [currentDate])

  const handlePrevDay = () => {
    const prev = new Date(dateObj)
    prev.setDate(prev.getDate() - 1)
    const newDate = formatDate(prev)
    setCurrentDate(newDate)
    router.push(`/day/${newDate}`)
  }

  const handleNextDay = () => {
    const next = new Date(dateObj)
    next.setDate(next.getDate() + 1)
    const newDate = formatDate(next)
    setCurrentDate(newDate)
    router.push(`/day/${newDate}`)
  }

  const handleToday = () => {
    const today = formatDate(new Date())
    setCurrentDate(today)
    router.push(`/day/${today}`)
  }

  const isToday = formatDate(new Date()) === currentDate

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header with Navigation */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h1 className="text-3xl font-bold">{displayDate}</h1>
              {isToday && <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Today</span>}
            </div>
            <p className="text-muted-foreground">{entries.length} entries logged</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrevDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" size="sm" onClick={handleToday}>
                Today
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleNextDay}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading day data...</p>
          </Card>
        )}

        {!isLoading && (
          <>
            {/* Stats Strip */}
            {(aggregate || entries.length > 0) && <DayStatsStrip aggregate={aggregate} tdee={tdee} />}

            {/* AI Day Digest (Phase 9) */}
            {digest && (
              <div className="mt-6">
                <DigestCard digest={digest} />
              </div>
            )}

            {/* Empty State */}
            {entries.length === 0 && !aggregate && (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No entries for this day</p>
                <Button onClick={() => router.push('/add')}>Add an entry</Button>
              </Card>
            )}

            {/* Entries Feed */}
            {entries.length > 0 && (
              <div className="mt-8 space-y-4">
                <h2 className="text-lg font-semibold">Timeline</h2>
                {entries.map((entry, idx) => (
                  <EntryCard key={entry.id} entry={entry} index={idx} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

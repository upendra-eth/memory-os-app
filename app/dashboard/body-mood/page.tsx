'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

interface DailyData {
  date: string
  sleep_hours?: number
  sleep_quality?: number
  mood_score?: number
  stress_level?: number
  energy?: number
  workouts?: number
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6']

export default function BodyMoodDashboard() {
  const [data, setData] = useState<DailyData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')
  const { profileId, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    const loadData = async () => {
      setIsLoading(true)
      try {
        if (!profileId) {
          setIsLoading(false)
          return
        }

        const supabase = createClient()

        // Calculate date range
        const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        // Fetch aggregates (RLS scopes to this user)
        const { data: aggregates } = await supabase
          .from('daily_aggregates')
          .select('*')
          .eq('user_id', profileId)
          .gte('log_date', startDate.toISOString().split('T')[0])
          .order('log_date', { ascending: true })

        if (aggregates) {
          const chartData = aggregates.map((agg: any) => ({
            date: new Date(agg.log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            sleep_hours: agg.sleep_hours,
            sleep_quality: agg.sleep_quality,
            mood_score: agg.mood_score,
            stress_level: agg.stress_level,
            energy: 5,
          }))
          setData(chartData)
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [range, profileId, authLoading])

  if (isLoading) {
    return <Card className="p-8 text-center">Loading...</Card>
  }

  if (data.length === 0) {
    return <Card className="p-8 text-center text-muted-foreground">No data available</Card>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Body & Mood</h1>
          <p className="text-muted-foreground">Sleep, energy, mood, and wellness metrics</p>
        </div>

        {/* Range Selector */}
        <Tabs value={range} onValueChange={(v) => setRange(v as '7d' | '30d' | '90d')} className="mb-8">
          <TabsList>
            <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
            <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
            <TabsTrigger value="90d">Last 90 Days</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sleep Chart */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Sleep Hours</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sleep_hours" stroke="#3b82f6" name="Hours" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Mood Chart */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Mood & Stress</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="mood_score" stroke="#10b981" name="Mood (1-10)" />
                <Line type="monotone" dataKey="stress_level" stroke="#ef4444" name="Stress (1-10)" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Sleep Quality */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Sleep Quality</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="sleep_quality" fill="#8b5cf6" name="Quality (1-10)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Summary Stats */}
          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-sm font-medium">Average Sleep</span>
                <span className="font-semibold">
                  {(data.reduce((sum, d) => sum + (d.sleep_hours || 0), 0) / data.length).toFixed(1)}h
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-sm font-medium">Average Mood</span>
                <span className="font-semibold">
                  {(data.reduce((sum, d) => sum + (d.mood_score || 0), 0) / data.length).toFixed(1)}/10
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="text-sm font-medium">Average Stress</span>
                <span className="font-semibold">
                  {(data.reduce((sum, d) => sum + (d.stress_level || 0), 0) / data.length).toFixed(1)}/10
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

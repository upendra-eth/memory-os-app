'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, AreaChart } from 'recharts'

interface DailyData {
  date: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  workouts?: number
}

export default function NutritionFitnessDashboard() {
  const [data, setData] = useState<DailyData[]>([])
  const [tdee, setTdee] = useState(2500)
  const [isLoading, setIsLoading] = useState(true)
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const userEmail = localStorage.getItem('user_email')
        if (!userEmail) {
          setIsLoading(false)
          return
        }

        const supabase = createClient()

        // Get user profile
        const { data: profile } = await supabase
          .from('user_profile')
          .select('*')
          .eq('email', userEmail)
          .single()

        if (!profile) {
          setIsLoading(false)
          return
        }

        // Calculate TDEE
        const { calculateBMR, calculateTDEE } = await import('@/lib/health-metrics')
        if (profile.current_weight_kg && profile.height_cm && profile.gender && profile.dob) {
          const age = new Date().getFullYear() - parseInt(profile.dob.split('-')[0])
          const bmr = calculateBMR(profile.current_weight_kg, profile.height_cm, age, profile.gender)
          const calculatedTdee = calculateTDEE(bmr, profile.activity_level || 'moderate')
          setTdee(calculatedTdee)
        }

        // Calculate date range
        const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        // Fetch aggregates
        const { data: aggregates } = await supabase
          .from('daily_aggregates')
          .select('*')
          .eq('user_id', profile.id)
          .gte('log_date', startDate.toISOString().split('T')[0])
          .order('log_date', { ascending: true })

        if (aggregates) {
          const chartData = aggregates.map((agg: any) => ({
            date: new Date(agg.log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            calories: agg.calories,
            protein: agg.protein_g,
            carbs: agg.carbs_g,
            fat: agg.fat_g,
            workouts: agg.workouts_count,
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
  }, [range])

  if (isLoading) {
    return <Card className="p-8 text-center">Loading...</Card>
  }

  if (data.length === 0) {
    return <Card className="p-8 text-center text-muted-foreground">No data available</Card>
  }

  const avgCalories = Math.round(data.reduce((sum, d) => sum + (d.calories || 0), 0) / data.length)
  const avgProtein = Math.round(data.reduce((sum, d) => sum + (d.protein || 0), 0) / data.length)
  const totalWorkouts = data.reduce((sum, d) => sum + (d.workouts || 0), 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Nutrition & Fitness</h1>
          <p className="text-muted-foreground">Calories, macros, and workout tracking</p>
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
          {/* Calorie Balance */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Calorie Balance vs TDEE ({tdee} kcal)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="calories" fill="#f59e0b" name="Calories" />
                <Bar dataKey={() => tdee} fill="#3b82f6" name="TDEE Target" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Macros Stacked */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Macronutrients</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="protein" fill="#3b82f6" stroke="#3b82f6" name="Protein (g)" />
                <Area type="monotone" dataKey="carbs" fill="#f59e0b" stroke="#f59e0b" name="Carbs (g)" />
                <Area type="monotone" dataKey="fat" fill="#ef4444" stroke="#ef4444" name="Fat (g)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Workout Volume */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Workout Count</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="workouts" fill="#10b981" name="Workouts" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Summary Stats */}
          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                <span className="text-sm font-medium">Average Calories</span>
                <span className="font-semibold">{avgCalories} kcal</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-sm font-medium">Average Protein</span>
                <span className="font-semibold">{avgProtein}g</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-sm font-medium">Total Workouts</span>
                <span className="font-semibold">{totalWorkouts}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-amber-50 rounded-lg">
                <span className="text-sm font-medium">Your TDEE</span>
                <span className="font-semibold">{tdee} kcal/day</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

'use client'

import { Card } from '@/components/ui/card'
import type { HealthMetrics } from '@/lib/types'

interface HealthMetricsCardProps {
  metrics: HealthMetrics
}

export function HealthMetricsCard({ metrics }: HealthMetricsCardProps) {
  return (
    <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <h3 className="text-lg font-semibold mb-4">Your Health Metrics</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">BMI</p>
          <p className="text-2xl font-bold">{metrics.bmi}</p>
          <p className="text-xs text-muted-foreground">Normal Range</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">BMR</p>
          <p className="text-2xl font-bold">{metrics.bmr}</p>
          <p className="text-xs text-muted-foreground">kcal/day</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">TDEE</p>
          <p className="text-2xl font-bold">{metrics.tdee}</p>
          <p className="text-xs text-muted-foreground">kcal/day</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Daily Calories</p>
          <p className="text-2xl font-bold">{metrics.daily_calories}</p>
          <p className="text-xs text-muted-foreground">target</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Daily Protein</p>
          <p className="text-2xl font-bold">{metrics.daily_protein_g}g</p>
          <p className="text-xs text-muted-foreground">recommended</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Ideal Weight</p>
          <p className="text-2xl font-bold">
            {metrics.ideal_weight_range.min}-{metrics.ideal_weight_range.max} kg
          </p>
          <p className="text-xs text-muted-foreground">range</p>
        </div>
      </div>
    </Card>
  )
}

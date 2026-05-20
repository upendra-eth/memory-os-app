'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { saveUserProfile, type OnboardingFormData } from '@/app/onboarding-actions'
import { calculateHealthMetrics } from '@/lib/health-metrics'
import { useToast } from '@/hooks/use-toast'

type Step = 'personal' | 'physical' | 'health' | 'goals' | 'review'

const STEPS: { id: Step; title: string; description: string }[] = [
  { id: 'personal', title: 'Personal Info', description: 'Basic information' },
  { id: 'physical', title: 'Physical Metrics', description: 'Height and weight' },
  { id: 'health', title: 'Health History', description: 'Medical information' },
  { id: 'goals', title: 'Goals', description: 'Fitness and nutrition' },
  { id: 'review', title: 'Review', description: 'Confirm your data' },
]

const healthConditions = [
  'Hypertension',
  'Diabetes',
  'Heart Disease',
  'Asthma',
  'Arthritis',
  'Thyroid',
  'Sleep Apnea',
  'Other',
]

export function OnboardingForm({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState<Step>('personal')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const [formData, setFormData] = useState<OnboardingFormData>({
    email: '',
    display_name: '',
    age: 30,
    gender: 'male',
    height_cm: 180,
    current_weight_kg: 75,
    target_weight_kg: 75,
    activity_level: 'moderate',
    nutrition_goal: 'maintain',
    fitness_goal: '',
    health_conditions: [],
    medications: [],
    allergies: [],
  })

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const progress = ((stepIndex + 1) / STEPS.length) * 100

  const handleInputChange = (field: keyof OnboardingFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleHealthConditionToggle = (condition: string) => {
    setFormData((prev) => ({
      ...prev,
      health_conditions: prev.health_conditions?.includes(condition)
        ? prev.health_conditions.filter((c) => c !== condition)
        : [...(prev.health_conditions || []), condition],
    }))
  }

  const handleNext = () => {
    const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].id)
    }
  }

  const handlePrev = () => {
    const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep)
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].id)
    }
  }

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await saveUserProfile(formData)
      if (result.success) {
        // Save email to localStorage for future reference
        localStorage.setItem('user_email', formData.email)
        
        // Initialize daily reminder
        try {
          const { initializeDailyReminder } = await import('@/lib/notification-store')
          initializeDailyReminder(formData.email, '09:00')
        } catch (error) {
          console.error('[v0] Failed to initialize reminder:', error)
        }
        
        toast({
          title: 'Success!',
          description: 'Your profile has been saved.',
        })
        onComplete?.()
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to save profile',
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Welcome to Memory OS</h1>
          <p className="text-muted-foreground">
            {STEPS[stepIndex].title}: {STEPS[stepIndex].description}
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>

        {/* Step Indicators */}
        <div className="flex gap-2">
          {STEPS.map((step) => {
            const isActive = step.id === currentStep
            const isCompleted = STEPS.findIndex((s) => s.id === currentStep) > STEPS.findIndex((s) => s.id === step.id)
            return (
              <div
                key={step.id}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  isActive
                    ? 'bg-primary'
                    : isCompleted
                      ? 'bg-primary/50'
                      : 'bg-muted'
                }`}
              />
            )
          })}
        </div>

        {/* Form Content */}
        <Card className="p-6">
          {currentStep === 'personal' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your.email@example.com"
                />
              </div>
              <div>
                <Label htmlFor="display_name">Display Name</Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) => handleInputChange('display_name', e.target.value)}
                  placeholder="Your Name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    value={formData.age}
                    onChange={(e) => handleInputChange('age', parseInt(e.target.value))}
                    min="18"
                    max="120"
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                    <SelectTrigger id="gender">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'physical' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  value={formData.height_cm}
                  onChange={(e) => handleInputChange('height_cm', parseFloat(e.target.value))}
                  min="120"
                  max="250"
                />
              </div>
              <div>
                <Label htmlFor="current_weight">Current Weight (kg)</Label>
                <Input
                  id="current_weight"
                  type="number"
                  value={formData.current_weight_kg}
                  onChange={(e) => handleInputChange('current_weight_kg', parseFloat(e.target.value))}
                  step="0.1"
                  min="30"
                  max="300"
                />
              </div>
              <div>
                <Label htmlFor="target_weight">Target Weight (kg)</Label>
                <Input
                  id="target_weight"
                  type="number"
                  value={formData.target_weight_kg}
                  onChange={(e) => handleInputChange('target_weight_kg', parseFloat(e.target.value))}
                  step="0.1"
                  min="30"
                  max="300"
                />
              </div>
              <div>
                <Label htmlFor="activity_level">Activity Level</Label>
                <Select value={formData.activity_level} onValueChange={(value) => handleInputChange('activity_level', value)}>
                  <SelectTrigger id="activity_level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentary (little or no exercise)</SelectItem>
                    <SelectItem value="light">Light (exercise 1-3 days/week)</SelectItem>
                    <SelectItem value="moderate">Moderate (exercise 3-5 days/week)</SelectItem>
                    <SelectItem value="active">Active (exercise 6-7 days/week)</SelectItem>
                    <SelectItem value="very_active">Very Active (intense exercise daily)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {currentStep === 'health' && (
            <div className="space-y-4">
              <div>
                <Label>Health Conditions (select all that apply)</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {healthConditions.map((condition) => (
                    <div key={condition} className="flex items-center space-x-2">
                      <Checkbox
                        id={condition}
                        checked={formData.health_conditions?.includes(condition) || false}
                        onCheckedChange={() => handleHealthConditionToggle(condition)}
                      />
                      <label htmlFor={condition} className="text-sm cursor-pointer">
                        {condition}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="medications">Current Medications (comma-separated)</Label>
                <Input
                  id="medications"
                  value={formData.medications?.join(', ') || ''}
                  onChange={(e) => handleInputChange('medications', e.target.value.split(',').map((m) => m.trim()))}
                  placeholder="e.g., Aspirin, Vitamin D"
                />
              </div>
              <div>
                <Label htmlFor="allergies">Allergies (comma-separated)</Label>
                <Input
                  id="allergies"
                  value={formData.allergies?.join(', ') || ''}
                  onChange={(e) => handleInputChange('allergies', e.target.value.split(',').map((a) => a.trim()))}
                  placeholder="e.g., Peanuts, Penicillin"
                />
              </div>
            </div>
          )}

          {currentStep === 'goals' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="nutrition_goal">Nutrition Goal</Label>
                <Select value={formData.nutrition_goal} onValueChange={(value) => handleInputChange('nutrition_goal', value)}>
                  <SelectTrigger id="nutrition_goal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lose_weight">Lose Weight</SelectItem>
                    <SelectItem value="maintain">Maintain Weight</SelectItem>
                    <SelectItem value="gain_muscle">Gain Muscle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fitness_goal">Fitness Goal</Label>
                <Input
                  id="fitness_goal"
                  value={formData.fitness_goal || ''}
                  onChange={(e) => handleInputChange('fitness_goal', e.target.value)}
                  placeholder="e.g., Run a 5K, increase strength"
                />
              </div>
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="font-semibold mb-3">Your Profile Summary</h3>
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>Name:</strong> {formData.display_name}
                  </p>
                  <p>
                    <strong>Email:</strong> {formData.email}
                  </p>
                  <p>
                    <strong>Age:</strong> {formData.age} years
                  </p>
                  <p>
                    <strong>Height/Weight:</strong> {formData.height_cm} cm / {formData.current_weight_kg} kg
                  </p>
                  <p>
                    <strong>Target Weight:</strong> {formData.target_weight_kg} kg
                  </p>
                  <p>
                    <strong>Activity Level:</strong> {formData.activity_level}
                  </p>
                  <p>
                    <strong>Nutrition Goal:</strong> {formData.nutrition_goal}
                  </p>
                </div>
              </div>

              {formData.height_cm && formData.current_weight_kg && formData.age && (
                <div className="bg-primary/10 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3">Calculated Health Metrics</h3>
                  {(() => {
                    const metrics = calculateHealthMetrics(
                      formData.current_weight_kg,
                      formData.height_cm,
                      formData.age,
                      formData.gender,
                      formData.activity_level,
                      formData.nutrition_goal
                    )
                    return (
                      <div className="space-y-2 text-sm">
                        <p>
                          <strong>BMI:</strong> {metrics.bmi}
                        </p>
                        <p>
                          <strong>BMR:</strong> {metrics.bmr} kcal/day
                        </p>
                        <p>
                          <strong>TDEE:</strong> {metrics.tdee} kcal/day
                        </p>
                        <p>
                          <strong>Daily Calories:</strong> {metrics.daily_calories} kcal
                        </p>
                        <p>
                          <strong>Daily Protein:</strong> {metrics.daily_protein_g}g
                        </p>
                        <p>
                          <strong>Ideal Weight Range:</strong> {metrics.ideal_weight_range.min}-{metrics.ideal_weight_range.max} kg
                        </p>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Navigation Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={stepIndex === 0 || isPending}
            className="flex-1"
          >
            Previous
          </Button>
          {currentStep === 'review' ? (
            <Button
              onClick={handleSubmit}
              disabled={isPending || !formData.email || !formData.display_name}
              className="flex-1"
            >
              {isPending ? 'Completing...' : 'Complete Onboarding'}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceedToNext(currentStep, formData)}
              className="flex-1"
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function canProceedToNext(step: Step, data: OnboardingFormData): boolean {
  switch (step) {
    case 'personal':
      return !!(data.email && data.display_name && data.age > 0)
    case 'physical':
      return !!(data.height_cm > 0 && data.current_weight_kg > 0 && data.target_weight_kg > 0 && data.activity_level)
    case 'health':
      return true // Optional fields
    case 'goals':
      return !!(data.nutrition_goal)
    case 'review':
      return false
    default:
      return false
  }
}

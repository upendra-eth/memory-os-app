'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { calculateBMR, calculateTDEE, calculateBMI } from '@/lib/health-metrics'
import type { ActivityLevel } from '@/lib/types'

interface ProfileData {
  full_name?: string
  dob?: string
  gender?: 'male' | 'female' | 'other'
  height_cm?: number
  current_weight_kg?: number
  target_weight_kg?: number
  activity_level?: ActivityLevel
  location?: string
  timezone?: string
  diet_preference?: string
  fitness_goals?: string[]
  health_goals?: string[]
}

export function ProfileContent() {
  const [profile, setProfile] = useState<ProfileData>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const userEmail = localStorage.getItem('user_email')
        if (!userEmail) {
          setError('User email not found')
          setIsLoading(false)
          return
        }

        const supabase = createClient()
        const { data, error: queryError } = await supabase
          .from('user_profile')
          .select('*')
          .eq('email', userEmail)
          .single()

        if (queryError) {
          setError('Failed to load profile')
          setIsLoading(false)
          return
        }

        setProfile(data || {})
        setIsLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading profile')
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const userEmail = localStorage.getItem('user_email')
      if (!userEmail) {
        setError('User email not found')
        setIsSaving(false)
        return
      }

      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('user_profile')
        .update(profile)
        .eq('email', userEmail)

      if (updateError) {
        setError(updateError.message)
        setIsSaving(false)
        return
      }

      setSuccess('Profile saved successfully!')
      toast({ title: 'Success!', description: 'Your profile has been updated.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving profile')
    } finally {
      setIsSaving(false)
    }
  }

  // Calculate metrics
  const bmr = profile.current_weight_kg && profile.height_cm && profile.gender
    ? calculateBMR(profile.current_weight_kg, profile.height_cm, new Date().getFullYear() - parseInt(profile.dob?.split('-')[0] || '1990'), profile.gender)
    : null

  const tdee = bmr && profile.activity_level
    ? calculateTDEE(bmr, profile.activity_level)
    : null

  const bmi = profile.current_weight_kg && profile.height_cm
    ? calculateBMI(profile.current_weight_kg, profile.height_cm)
    : null

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading your profile...</p>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {/* Metrics Cards */}
      {(bmr || tdee || bmi) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {bmr && (
            <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
              <p className="text-sm text-muted-foreground mb-1">Basal Metabolic Rate</p>
              <p className="text-3xl font-bold text-blue-900">{bmr}</p>
              <p className="text-xs text-blue-700 mt-1">kcal/day at rest</p>
            </Card>
          )}
          {tdee && (
            <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200">
              <p className="text-sm text-muted-foreground mb-1">Total Daily Energy Expenditure</p>
              <p className="text-3xl font-bold text-orange-900">{tdee}</p>
              <p className="text-xs text-orange-700 mt-1">kcal/day with activity</p>
            </Card>
          )}
          {bmi && (
            <Card className="p-6 bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200">
              <p className="text-sm text-muted-foreground mb-1">Body Mass Index</p>
              <p className="text-3xl font-bold text-emerald-900">{bmi.toFixed(1)}</p>
              <p className="text-xs text-emerald-700 mt-1">
                {bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200 text-green-800">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="basics" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
        </TabsList>

        {/* Basics Tab */}
        <TabsContent value="basics" className="space-y-6">
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={profile.full_name || ''}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="Your name"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={profile.dob || ''}
                    onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={profile.gender || ''} onValueChange={(v) => setProfile({ ...profile, gender: v as 'male' | 'female' | 'other' })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={profile.location || ''}
                    onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                    placeholder="City, Country"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={profile.timezone || ''} onValueChange={(v) => setProfile({ ...profile, timezone: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                      <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                      <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                      <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                      <SelectItem value="Australia/Sydney">Australia/Sydney (AEDT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="space-y-6">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="height">Height (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={profile.height_cm || ''}
                    onChange={(e) => setProfile({ ...profile, height_cm: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="175"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="current_weight">Current Weight (kg)</Label>
                  <Input
                    id="current_weight"
                    type="number"
                    step="0.1"
                    value={profile.current_weight_kg || ''}
                    onChange={(e) => setProfile({ ...profile, current_weight_kg: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="70"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="target_weight">Target Weight (kg)</Label>
                  <Input
                    id="target_weight"
                    type="number"
                    step="0.1"
                    value={profile.target_weight_kg || ''}
                    onChange={(e) => setProfile({ ...profile, target_weight_kg: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="70"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="activity">Activity Level</Label>
                  <Select value={profile.activity_level || ''} onValueChange={(v) => setProfile({ ...profile, activity_level: v as ActivityLevel })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sedentary">Sedentary (little exercise)</SelectItem>
                      <SelectItem value="light">Light (1-3 days/week)</SelectItem>
                      <SelectItem value="moderate">Moderate (3-5 days/week)</SelectItem>
                      <SelectItem value="active">Active (6-7 days/week)</SelectItem>
                      <SelectItem value="very_active">Very Active (twice daily)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="diet">Diet Preference</Label>
                <Select value={profile.diet_preference || ''} onValueChange={(v) => setProfile({ ...profile, diet_preference: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="omnivore">Omnivore</SelectItem>
                    <SelectItem value="vegetarian">Vegetarian</SelectItem>
                    <SelectItem value="vegan">Vegan</SelectItem>
                    <SelectItem value="keto">Keto</SelectItem>
                    <SelectItem value="paleo">Paleo</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Goals Tab */}
        <TabsContent value="goals" className="space-y-6">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground mb-4">
              Goals help personalize insights and recommendations
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="fitness_goals">Fitness Goals</Label>
                <Input
                  id="fitness_goals"
                  value={(profile.fitness_goals || []).join(', ')}
                  onChange={(e) => setProfile({ ...profile, fitness_goals: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="e.g., build muscle, lose weight, improve endurance (comma separated)"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="health_goals">Health Goals</Label>
                <Input
                  id="health_goals"
                  value={(profile.health_goals || []).join(', ')}
                  onChange={(e) => setProfile({ ...profile, health_goals: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="e.g., better sleep, reduce stress, better digestion (comma separated)"
                  className="mt-1"
                />
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={isSaving} size="lg" className="w-full">
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </>
        )}
      </Button>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, AlertCircle, Sparkles, Brain, Heart, Target, Moon, Briefcase, MessageSquare } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { calculateBMR, calculateTDEE, calculateBMI } from '@/lib/health-metrics'
import { getFullProfile, updateProfileFields } from '@/app/profile-actions'
import { ProfileChat } from '@/components/profile-chat'
import type { ActivityLevel } from '@/lib/types'

export function ProfileContent() {
  const [profile, setProfile] = useState<Record<string, any>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('identity')
  const { toast } = useToast()

  const loadProfile = async () => {
    try {
      const data = await getFullProfile()
      if (data) setProfile(data)
      setIsLoading(false)
    } catch {
      setError('Failed to load profile')
      setIsLoading(false)
    }
  }

  useEffect(() => { loadProfile() }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    const result = await updateProfileFields(profile)
    if (result.success) {
      toast({ title: 'Saved!', description: 'Profile updated successfully.' })
    } else {
      setError(result.error || 'Failed to save')
    }
    setIsSaving(false)
  }

  const completeness = profile.profile_completeness_score || 0
  const bmr = profile.current_weight_kg && profile.height_cm && profile.age && profile.gender
    ? calculateBMR(profile.current_weight_kg, profile.height_cm, profile.age, profile.gender)
    : null
  const tdee = bmr && profile.activity_level ? calculateTDEE(bmr, profile.activity_level) : null
  const bmi = profile.current_weight_kg && profile.height_cm ? calculateBMI(profile.current_weight_kg, profile.height_cm) : null

  if (isLoading) {
    return <Card className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" /><p className="text-muted-foreground">Loading profile...</p></Card>
  }

  return (
    <div className="space-y-6">
      {/* Completeness Banner */}
      <Card className="p-6 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Profile Completeness</h3>
          </div>
          <span className="text-2xl font-bold text-primary">{completeness}%</span>
        </div>
        <Progress value={completeness} className="h-2.5 mb-2" />
        <p className="text-xs text-muted-foreground">
          {completeness < 50
            ? '🔓 Complete 50% to unlock basic trend comparisons'
            : completeness < 80
              ? '🔓 Complete 80% to unlock personalized parameter insights'
              : '✅ Full insights unlocked — the more data, the deeper your analysis'}
        </p>
      </Card>

      {/* Health Metric Cards */}
      {(bmr || tdee || bmi) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {bmr && (
            <Card className="p-5 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <p className="text-xs text-muted-foreground mb-1">BMR</p>
              <p className="text-2xl font-bold">{bmr}</p>
              <p className="text-xs text-muted-foreground">kcal/day at rest</p>
            </Card>
          )}
          {tdee && (
            <Card className="p-5 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
              <p className="text-xs text-muted-foreground mb-1">TDEE</p>
              <p className="text-2xl font-bold">{tdee}</p>
              <p className="text-xs text-muted-foreground">kcal/day with activity</p>
            </Card>
          )}
          {bmi && (
            <Card className="p-5 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
              <p className="text-xs text-muted-foreground mb-1">BMI</p>
              <p className="text-2xl font-bold">{bmi.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">{bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'}</p>
            </Card>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-7">
          <TabsTrigger value="identity" className="text-xs"><Brain className="h-3.5 w-3.5 md:mr-1.5" /><span className="hidden md:inline">Identity</span></TabsTrigger>
          <TabsTrigger value="body" className="text-xs"><Heart className="h-3.5 w-3.5 md:mr-1.5" /><span className="hidden md:inline">Body</span></TabsTrigger>
          <TabsTrigger value="health" className="text-xs"><AlertCircle className="h-3.5 w-3.5 md:mr-1.5" /><span className="hidden md:inline">Health</span></TabsTrigger>
          <TabsTrigger value="lifestyle" className="text-xs"><Moon className="h-3.5 w-3.5 md:mr-1.5" /><span className="hidden md:inline">Lifestyle</span></TabsTrigger>
          <TabsTrigger value="goals" className="text-xs"><Target className="h-3.5 w-3.5 md:mr-1.5" /><span className="hidden md:inline">Goals</span></TabsTrigger>
          <TabsTrigger value="work" className="text-xs"><Briefcase className="h-3.5 w-3.5 md:mr-1.5" /><span className="hidden md:inline">Work</span></TabsTrigger>
          <TabsTrigger value="ai" className="text-xs"><MessageSquare className="h-3.5 w-3.5 md:mr-1.5" /><span className="hidden md:inline">AI Chat</span></TabsTrigger>
        </TabsList>

        {/* Identity */}
        <TabsContent value="identity"><Card className="p-6"><div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Full Name</Label><Input value={profile.display_name || ''} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} className="mt-1" /></div>
            <div><Label>Age</Label><Input type="number" value={profile.age || ''} onChange={(e) => setProfile({ ...profile, age: parseInt(e.target.value) || undefined })} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Gender</Label>
              <Select value={profile.gender || ''} onValueChange={(v) => setProfile({ ...profile, gender: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Location</Label><Input value={profile.location || ''} onChange={(e) => setProfile({ ...profile, location: e.target.value })} placeholder="City, Country" className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Timezone</Label>
              <Select value={profile.timezone || ''} onValueChange={(v) => setProfile({ ...profile, timezone: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select timezone" /></SelectTrigger>
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
            <div><Label>Personality Type</Label><Input value={profile.personality_type || ''} onChange={(e) => setProfile({ ...profile, personality_type: e.target.value })} placeholder="e.g., INTJ, Type 5" className="mt-1" /></div>
          </div>
        </div></Card></TabsContent>

        {/* Body */}
        <TabsContent value="body"><Card className="p-6"><div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Height (cm)</Label><Input type="number" value={profile.height_cm || ''} onChange={(e) => setProfile({ ...profile, height_cm: parseInt(e.target.value) || undefined })} className="mt-1" /></div>
            <div><Label>Current Weight (kg)</Label><Input type="number" step="0.1" value={profile.current_weight_kg || ''} onChange={(e) => setProfile({ ...profile, current_weight_kg: parseFloat(e.target.value) || undefined })} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Target Weight (kg)</Label><Input type="number" step="0.1" value={profile.target_weight_kg || ''} onChange={(e) => setProfile({ ...profile, target_weight_kg: parseFloat(e.target.value) || undefined })} className="mt-1" /></div>
            <div><Label>Activity Level</Label>
              <Select value={profile.activity_level || ''} onValueChange={(v) => setProfile({ ...profile, activity_level: v as ActivityLevel })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sedentary">Sedentary</SelectItem><SelectItem value="light">Light</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem><SelectItem value="active">Active</SelectItem>
                  <SelectItem value="very_active">Very Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div></Card></TabsContent>

        {/* Health */}
        <TabsContent value="health"><Card className="p-6"><div className="space-y-4">
          <div><Label>Health Conditions (comma-separated)</Label><Input value={(profile.health_conditions || []).join(', ')} onChange={(e) => setProfile({ ...profile, health_conditions: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="e.g., Hypertension, Diabetes" className="mt-1" /></div>
          <div><Label>Medications (comma-separated)</Label><Input value={(profile.medications || []).join(', ')} onChange={(e) => setProfile({ ...profile, medications: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="e.g., Aspirin, Vitamin D" className="mt-1" /></div>
          <div><Label>Allergies (comma-separated)</Label><Input value={(profile.allergies || []).join(', ')} onChange={(e) => setProfile({ ...profile, allergies: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="e.g., Peanuts, Penicillin" className="mt-1" /></div>
          <div><Label>Therapy Status</Label>
            <Select value={profile.therapy_status || ''} onValueChange={(v) => setProfile({ ...profile, therapy_status: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Currently in therapy</SelectItem><SelectItem value="past">Past therapy</SelectItem>
                <SelectItem value="considering">Considering</SelectItem><SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Stress Baseline (1-10)</Label><Input type="number" min={1} max={10} value={profile.stress_baseline_1_10 || ''} onChange={(e) => setProfile({ ...profile, stress_baseline_1_10: parseInt(e.target.value) || undefined })} className="mt-1" /></div>
        </div></Card></TabsContent>

        {/* Lifestyle */}
        <TabsContent value="lifestyle"><Card className="p-6"><div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Wake Time</Label><Input type="time" value={profile.sleep_schedule_wake || ''} onChange={(e) => setProfile({ ...profile, sleep_schedule_wake: e.target.value })} className="mt-1" /></div>
            <div><Label>Bed Time</Label><Input type="time" value={profile.sleep_schedule_bed || ''} onChange={(e) => setProfile({ ...profile, sleep_schedule_bed: e.target.value })} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Sedentary Hours/Day</Label><Input type="number" value={profile.sedentary_hours || ''} onChange={(e) => setProfile({ ...profile, sedentary_hours: parseInt(e.target.value) || undefined })} className="mt-1" /></div>
            <div><Label>Screen Time Hours/Day</Label><Input type="number" value={profile.screen_time_hours || ''} onChange={(e) => setProfile({ ...profile, screen_time_hours: parseInt(e.target.value) || undefined })} className="mt-1" /></div>
          </div>
          <div><Label>Diet Preference</Label>
            <Select value={profile.diet_preference || ''} onValueChange={(v) => setProfile({ ...profile, diet_preference: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="omnivore">Omnivore</SelectItem><SelectItem value="vegetarian">Vegetarian</SelectItem>
                <SelectItem value="vegan">Vegan</SelectItem><SelectItem value="keto">Keto</SelectItem>
                <SelectItem value="paleo">Paleo</SelectItem><SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div></Card></TabsContent>

        {/* Goals */}
        <TabsContent value="goals"><Card className="p-6">
          <p className="text-sm text-muted-foreground mb-4">Goals help personalize your insights and unlock deeper analysis</p>
          <div className="space-y-4">
            <div><Label>Fitness Goal</Label><Input value={profile.fitness_goal || ''} onChange={(e) => setProfile({ ...profile, fitness_goal: e.target.value })} placeholder="e.g., Run 5K, gain muscle" className="mt-1" /></div>
            <div><Label>Career Goals (comma-separated)</Label><Input value={(profile.career_goals || []).join(', ')} onChange={(e) => setProfile({ ...profile, career_goals: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="e.g., Get promoted, learn Rust" className="mt-1" /></div>
            <div><Label>Mental Health Goals (comma-separated)</Label><Input value={(profile.mental_goals || []).join(', ')} onChange={(e) => setProfile({ ...profile, mental_goals: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="e.g., Meditate daily, reduce anxiety" className="mt-1" /></div>
            <div><Label>Financial Goals (comma-separated)</Label><Input value={(profile.financial_goals || []).join(', ')} onChange={(e) => setProfile({ ...profile, financial_goals: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="e.g., Save 6 months expenses, invest" className="mt-1" /></div>
          </div>
        </Card></TabsContent>

        {/* Work */}
        <TabsContent value="work"><Card className="p-6"><div className="space-y-4">
          <div><Label>Occupation</Label><Input value={profile.occupation || ''} onChange={(e) => setProfile({ ...profile, occupation: e.target.value })} placeholder="e.g., Software Engineer" className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Work Type</Label>
              <Select value={profile.work_type || ''} onValueChange={(v) => setProfile({ ...profile, work_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote">Remote</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem><SelectItem value="office">Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Commute (minutes)</Label><Input type="number" value={profile.commute_min || ''} onChange={(e) => setProfile({ ...profile, commute_min: parseInt(e.target.value) || undefined })} className="mt-1" /></div>
          </div>
        </div></Card></TabsContent>

        {/* AI Chat */}
        <TabsContent value="ai">
          <ProfileChat onProfileUpdated={() => loadProfile()} />
        </TabsContent>
      </Tabs>

      {/* Save Button (not shown on AI tab) */}
      {activeTab !== 'ai' && (
        <Button onClick={handleSave} disabled={isSaving} size="lg" className="w-full">
          {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Changes</>}
        </Button>
      )}
    </div>
  )
}

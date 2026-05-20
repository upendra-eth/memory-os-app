'use client'

import { useRouter } from 'next/navigation'
import { OnboardingForm } from '@/components/onboarding-form'

export default function OnboardingPage() {
  const router = useRouter()

  const handleComplete = () => {
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center p-4">
      <OnboardingForm onComplete={handleComplete} />
    </div>
  )
}

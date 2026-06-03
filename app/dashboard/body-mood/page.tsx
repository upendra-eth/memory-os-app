import { redirect } from 'next/navigation'

// Merged into the unified analytics hub at /dashboard (Sleep / Mood & Stress charts).
export default function BodyMoodPage() {
  redirect('/dashboard')
}

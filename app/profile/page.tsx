import { ProfileContent } from '@/components/profile-content'
import { Navigation } from '@/components/navigation'

export const metadata = {
  title: 'Profile - Memory OS',
  description: 'Manage your health profile and metrics',
}

export default function ProfilePage() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 bg-gradient-to-br from-background via-primary/5 to-background pb-24 md:pb-0">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Profile Settings</h1>
            <p className="text-muted-foreground">
              Manage your health data. Changes apply to all future calculations.
            </p>
          </div>

          <ProfileContent />
        </div>
      </main>
    </div>
  )
}

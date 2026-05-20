import { ProfileContent } from '@/components/profile-content'

export const metadata = {
  title: 'Profile - Memory OS',
  description: 'Manage your health profile and metrics',
}

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Profile Settings</h1>
          <p className="text-muted-foreground">
            Manage your health data. Changes apply to all future calculations.
          </p>
        </div>

        <ProfileContent />
      </div>
    </div>
  )
}

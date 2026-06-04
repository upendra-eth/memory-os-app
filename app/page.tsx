import { redirect } from 'next/navigation'

// `/dashboard` is the canonical home (login, middleware, and the PWA all target
// it). The bare `/` route used to render a second, simpler dashboard, which was
// orphaned and duplicated the real one — redirect so there is a single home.
export default function RootPage() {
  redirect('/dashboard')
}

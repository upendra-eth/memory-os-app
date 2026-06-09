import { EntryForm } from '@/components/entry-form'
import { Navigation } from '@/components/navigation'

export const metadata = {
  title: 'Add Entry - Memory OS',
  description: 'Paste your ChatGPT output to log a new life entry',
}

export default function AddEntryPage() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 bg-gradient-to-br from-background via-primary/5 to-background pb-24 md:pb-0">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Add New Entry</h1>
            <p className="text-muted-foreground text-lg">
              Paste your ChatGPT output with RAW, NARRATIVE, and EXTRACTED sections
            </p>
          </div>

          <EntryForm />
        </div>
      </main>
    </div>
  )
}

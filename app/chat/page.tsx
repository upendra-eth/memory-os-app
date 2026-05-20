import { Navigation } from '@/components/navigation'
import { ChatInterface } from '@/components/chat-interface'

export default function ChatPage() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto space-y-6 h-full">
          <header>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Intelligence Chat</h1>
            <p className="text-muted-foreground mt-1">
              Ask questions about your data and get AI-powered insights
            </p>
          </header>
          
          <ChatInterface />
        </div>
      </main>
    </div>
  )
}

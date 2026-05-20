'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/ui/spinner'
import { Send, Sparkles } from 'lucide-react'

interface Citation {
  date: string
  excerpt: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

interface AskInterfaceProps {
  userId: string
}

export function AskInterface({ userId }: AskInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const suggestedQuestions = [
    'How was my gym performance this week?',
    "What's my typical sleep pattern?",
    'How has my mood been trending?',
    'What foods have I been eating most?',
  ]

  const handleSendMessage = async (text: string = input) => {
    if (!text.trim()) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, userId }),
      })

      if (!response.ok) {
        throw new Error('Failed to get answer')
      }

      const data = await response.json()

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
        },
      ])
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get answer',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat history */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="w-12 h-12 text-primary/30 mx-auto mb-4" />
            <p className="text-muted-foreground mb-6">Ask questions about your life logs</p>
            <div className="space-y-2">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSendMessage(q)}
                  className="block w-full text-left p-3 rounded-lg hover:bg-secondary transition text-sm"
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <Card
                className={`max-w-lg p-4 ${
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-current/20 text-xs">
                    <p className="font-semibold mb-1">Sources:</p>
                    {msg.citations.map((c, j) => (
                      <div key={j} className="text-xs opacity-75">
                        {new Date(c.date).toLocaleDateString()} - {c.excerpt}...
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ask a question about your health..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
            disabled={loading}
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={loading || !input.trim()}
            size="sm"
          >
            {loading ? <Spinner className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

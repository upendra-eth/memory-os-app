'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { DynamicDisplay } from '@/components/dynamic-display'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ChatMessage, GeminiResponse } from '@/lib/types'
import { Send, Loader2, User, Brain, Sparkles } from 'lucide-react'

const SUGGESTED_QUESTIONS = [
  'How was my gym performance this week?',
  'What are my sleep patterns like?',
  'Summarize my nutrition data',
  'Show my workout progress',
]

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async (question: string) => {
    if (!question.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get response')
      }

      const data = await response.json()
      
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response.type === 'summary' ? data.response.text : 'Here is your data visualization:',
        response: data.response as GeminiResponse,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
      
      if (data.logsCount === 0) {
        toast.info('No recent logs found', {
          description: 'Add some data via the Ingestor to get personalized insights',
        })
      }
    } catch (error) {
      toast.error('Failed to process question', {
        description: error instanceof Error ? error.message : 'Please try again',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] md:h-[calc(100vh-8rem)]">
      <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
        <div className="space-y-4 pb-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-8 w-8" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Intelligence Chat</h3>
                <p className="text-muted-foreground max-w-sm">
                  Ask questions about your health and fitness data. I&apos;ll analyze your logs and provide insights or visualizations.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(q)}
                    disabled={isLoading}
                    className="text-xs"
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="space-y-3">
                <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground flex-shrink-0">
                      <Brain className="h-4 w-4" />
                    </div>
                  )}
                  <Card className={`max-w-[80%] ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
                    <CardContent className="p-3">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </CardContent>
                  </Card>
                  {message.role === 'user' && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground flex-shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
                
                {message.response && (
                  <div className="ml-11">
                    <DynamicDisplay response={message.response} />
                  </div>
                )}
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground flex-shrink-0">
                <Brain className="h-4 w-4" />
              </div>
              <Card className="bg-card">
                <CardContent className="p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Analyzing your data...</span>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t border-border">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your health data..."
          className="min-h-[48px] max-h-[120px] resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          disabled={isLoading}
        />
        <Button type="submit" disabled={!input.trim() || isLoading} size="icon" className="h-12 w-12">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </form>
    </div>
  )
}

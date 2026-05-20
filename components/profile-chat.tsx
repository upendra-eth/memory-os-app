'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Send, Sparkles, Check, Loader2, Bot, User } from 'lucide-react'
import { extractProfileFromChat, saveExtractedProfile } from '@/app/profile-actions'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  extractedFields?: Record<string, any>
  saved?: boolean
}

const SUGGESTIONS = [
  "I'm 28 years old, male, 180cm tall, weigh 82kg",
  "I work as a software engineer, remotely from Bangalore",
  "I usually wake up at 6:30 AM and sleep by 11 PM",
  "I'm vegetarian, allergic to peanuts, and take vitamin D daily",
  "My stress level is usually around 6/10, and I meditate sometimes",
  "I want to lose 5kg and run a half marathon this year",
]

export function ProfileChat({ onProfileUpdated }: { onProfileUpdated?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isProcessing) return
    setInput('')

    const userMsg: ChatMessage = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setIsProcessing(true)

    try {
      const result = await extractProfileFromChat(text)

      if (result.success && result.extractedFields) {
        const fieldCount = Object.keys(result.extractedFields).length
        const fieldNames = Object.keys(result.extractedFields)
          .map((k) => k.replace(/_/g, ' '))
          .join(', ')

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: `I extracted ${fieldCount} field${fieldCount !== 1 ? 's' : ''}: **${fieldNames}**. Click "Save" to update your profile.`,
          extractedFields: result.extractedFields,
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.error || "I couldn't extract any profile fields from that. Try something like: \"I'm 28, work as a developer, and wake up at 7 AM\"",
          },
        ])
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSave = async (msgIndex: number) => {
    const msg = messages[msgIndex]
    if (!msg.extractedFields) return

    const result = await saveExtractedProfile(msg.extractedFields)
    if (result.success) {
      setMessages((prev) =>
        prev.map((m, i) =>
          i === msgIndex ? { ...m, saved: true } : m
        )
      )
      onProfileUpdated?.()
    }
  }

  return (
    <Card className="flex flex-col h-[500px] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Profile Builder</h3>
            <p className="text-xs text-muted-foreground">Type naturally — I&apos;ll extract your data</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-6">
            <Bot className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Tell me about yourself and I&apos;ll fill in your profile
            </p>
            <div className="space-y-2">
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="block w-full text-left text-xs p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition text-muted-foreground hover:text-foreground"
                >
                  &quot;{s}&quot;
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${msg.role === 'user' ? '' : ''}`}>
                <div className="flex items-start gap-2">
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-secondary rounded-bl-md'
                    }`}
                  >
                    <p>{msg.content}</p>

                    {msg.extractedFields && (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(msg.extractedFields).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs bg-background/50">
                              {key.replace(/_/g, ' ')}: {Array.isArray(value) ? value.join(', ') : String(value)}
                            </Badge>
                          ))}
                        </div>
                        {!msg.saved ? (
                          <Button
                            size="sm"
                            onClick={() => handleSave(i)}
                            className="mt-2 h-7 text-xs"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Save to Profile
                          </Button>
                        ) : (
                          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            Saved to profile!
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="h-3.5 w-3.5 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary rounded-2xl rounded-bl-md">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Extracting data...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleSend()}
            placeholder="e.g., I'm 28, work remotely as a developer..."
            disabled={isProcessing}
            className="text-sm"
          />
          <Button
            onClick={() => handleSend()}
            disabled={isProcessing || !input.trim()}
            size="sm"
            className="px-3"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Card>
  )
}

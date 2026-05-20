'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getDailyProfilePrompt, answerProfilePrompt, extractProfileFromChat, saveExtractedProfile } from '@/app/profile-actions'
import { Sparkles, X, Send, Check, Loader2 } from 'lucide-react'

export function ProfilePromptCard({ onAnswered }: { onAnswered?: () => void }) {
  const [prompt, setPrompt] = useState<{ text: string; emoji: string; targetField: string } | null>(null)
  const [answer, setAnswer] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Check if already dismissed today
    const dismissed = localStorage.getItem('profile_prompt_dismissed')
    if (dismissed === new Date().toISOString().split('T')[0]) {
      setIsDismissed(true)
      setIsLoading(false)
      return
    }

    getDailyProfilePrompt()
      .then(({ prompt: p }) => {
        setPrompt(p || null)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [])

  const handleSubmit = async () => {
    if (!answer.trim() || !prompt) return
    setIsSaving(true)

    try {
      // Use AI to extract the value
      const result = await extractProfileFromChat(answer)
      if (result.success && result.extractedFields) {
        await saveExtractedProfile(result.extractedFields)
        setSaved(true)
        onAnswered?.()
      } else {
        // Fallback: save raw answer
        await answerProfilePrompt(prompt.targetField, answer, answer)
        setSaved(true)
        onAnswered?.()
      }
    } catch {
      // ignore
    } finally {
      setIsSaving(false)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('profile_prompt_dismissed', new Date().toISOString().split('T')[0])
    setIsDismissed(true)
  }

  if (isLoading || isDismissed || !prompt || saved) return null

  return (
    <Card className="p-4 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-primary/20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      
      <button onClick={handleDismiss} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1">
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 relative">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
          <span className="text-lg">{prompt.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">Daily Question</span>
          </div>
          <p className="text-sm font-medium mb-3">{prompt.text}</p>
          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Type your answer..."
              className="text-sm h-8"
              disabled={isSaving}
            />
            <Button size="sm" onClick={handleSubmit} disabled={isSaving || !answer.trim()} className="h-8 px-3">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

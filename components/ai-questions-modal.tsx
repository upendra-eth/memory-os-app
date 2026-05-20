'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { X, Brain } from 'lucide-react'

interface Question {
  id: string
  question: string
  context: string
  expected_action: string
  options?: string[]
}

interface AIQuestionsModalProps {
  isOpen: boolean
  onClose: () => void
  questions: Question[]
  onAnswer: (questionId: string, answer: string) => void
}

export function AIQuestionsModal({ isOpen, onClose, questions, onAnswer }: AIQuestionsModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  if (!isOpen || questions.length === 0) return null

  const current = questions[currentIndex]

  const handleAnswer = (answer: string) => {
    setAnswers((prev) => ({ ...prev, [current.id]: answer }))
    onAnswer(current.id, answer)

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-secondary rounded"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </span>
        </div>

        <h2 className="text-xl font-semibold mb-2">{current.question}</h2>
        <p className="text-sm text-muted-foreground mb-6">{current.context}</p>

        <div className="space-y-2">
          {current.options && current.options.length > 0 ? (
            current.options.map((option) => (
              <Button
                key={option}
                onClick={() => handleAnswer(option)}
                variant="outline"
                className="w-full justify-start text-left"
              >
                {option}
              </Button>
            ))
          ) : (
            <Input
              placeholder="Your answer..."
              onKeyPress={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value) {
                  handleAnswer(e.currentTarget.value)
                  e.currentTarget.value = ''
                }
              }}
              autoFocus
            />
          )}
          <Button onClick={onClose} variant="ghost" className="w-full mt-4">
            Skip for now
          </Button>
        </div>
      </Card>
    </div>
  )
}

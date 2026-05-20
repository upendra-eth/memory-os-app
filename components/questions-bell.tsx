'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { AIQuestionsModal } from '@/components/ai-questions-modal'
import {
  getPendingQuestions,
  answerQuestion,
  type PendingQuestion,
} from '@/app/questions-actions'

export function QuestionsBell() {
  const [questions, setQuestions] = useState<PendingQuestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const userEmail = typeof window !== 'undefined' ? localStorage.getItem('user_email') : null
    if (!userEmail) return

    getPendingQuestions(userEmail)
      .then(setQuestions)
      .catch((err) => console.error('[v0] questions fetch failed:', err))
  }, [])

  if (!mounted || questions.length === 0) return null

  const handleAnswer = async (questionId: string, answer: string) => {
    const userEmail = localStorage.getItem('user_email')
    if (!userEmail) return
    await answerQuestion(userEmail, questionId, answer)
    setQuestions((prev) => prev.filter((q) => q.id !== questionId))
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${questions.length} pending question${questions.length === 1 ? '' : 's'}`}
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-40 flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute -top-1 -right-1 flex items-center justify-center h-5 w-5 rounded-full bg-red-500 text-white text-xs font-semibold">
          {questions.length}
        </span>
      </button>

      <AIQuestionsModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        questions={questions}
        onAnswer={handleAnswer}
      />
    </>
  )
}

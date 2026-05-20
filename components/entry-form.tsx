'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  getKnownEntities,
  normalizeWithGemini,
  saveEntry,
} from '@/app/entry-actions'
import { parseThreeSectionPaste } from '@/lib/parse-entry'
import type { ExtractedJSON } from '@/lib/extraction-schema'

export function EntryForm() {
  const [paste, setPaste] = useState('')
  const [isPending, startTransition] = useTransition()
  const [parseError, setParseError] = useState<string | null>(null)
  const [savedEntry, setSavedEntry] = useState<{ id: string; summary: string; auditCount: number } | null>(null)
  const [processingStep, setProcessingStep] = useState<string>('')
  const { toast } = useToast()

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPaste(e.target.value)
    setSavedEntry(null)
    setParseError(null)

    // Check if paste contains the sections
    if (e.target.value.includes('===')) {
      setParseError(null)
    }
  }

  const handleSave = () => {
    if (!paste.trim()) {
      setParseError('Please paste content')
      return
    }

    startTransition(async () => {
      try {
        setProcessingStep('Parsing sections...')

        // Parse the 3-section paste
        const parsed = parseThreeSectionPaste(paste)

        if (!parsed.extracted.trim()) {
          setParseError('No EXTRACTED section found. Expected format: === RAW ===...=== NARRATIVE ===...=== EXTRACTED ===...')
          return
        }

        setProcessingStep('Fetching known entities...')
        const knownEntities = await getKnownEntities()

        setProcessingStep('Normalizing with Gemini (may take 5-10 seconds)...')
        const normResult = await normalizeWithGemini(parsed.extracted, knownEntities)

        if (!normResult.success || !normResult.data) {
          setParseError(normResult.error || 'Normalization failed')
          setProcessingStep('')
          return
        }

        setProcessingStep('Saving to database...')
        const saveResult = await saveEntry({
          rawText: parsed.raw,
          narrative: parsed.narrative,
          extractedJson: normResult.data,
        })

        if (!saveResult.success) {
          setParseError(saveResult.error || 'Failed to save entry')
          setProcessingStep('')
          return
        }

        setSavedEntry({
          id: saveResult.entryId || '',
          summary: normResult.data.audit ? 'Entry saved successfully' : 'Entry saved',
          auditCount: saveResult.auditCount || 0,
        })
        setPaste('')
        setProcessingStep('')

        toast({
          title: 'Success!',
          description: `Entry saved with ${saveResult.auditCount || 0} items pending review`,
        })
      } catch (error) {
        console.error('Error:', error)
        setParseError(error instanceof Error ? error.message : 'An error occurred')
        setProcessingStep('')
      }
    })
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Instruction Card */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">How to use:</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Paste output from ChatGPT with === RAW ===, === NARRATIVE ===, === EXTRACTED === sections</li>
          <li>Click Save to parse and normalize the data</li>
          <li>Gemini will intelligently extract structured data from the EXTRACTED section</li>
          <li>Review and confirm any flagged items in the Audit Inbox</li>
        </ol>
      </Card>

      {/* Textarea */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Paste your ChatGPT output</label>
        <Textarea
          value={paste}
          onChange={handlePasteChange}
          placeholder={'=== RAW ===\n[Your raw transcript]\n\n=== NARRATIVE ===\n[Your journal entry]\n\n=== EXTRACTED ===\n[Your structured data]'}
          rows={12}
          disabled={isPending}
          className="font-mono text-sm"
        />
      </div>

      {/* Error Alert */}
      {parseError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {/* Processing Status */}
      {isPending && processingStep && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm text-amber-800">{processingStep}</p>
          </div>
        </Card>
      )}

      {/* Success Card */}
      {savedEntry && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="font-semibold text-emerald-900">Entry Saved!</p>
            </div>
            <p className="text-sm text-emerald-800">{savedEntry.summary}</p>
            {savedEntry.auditCount > 0 && (
              <p className="text-sm text-emerald-700">
                <strong>{savedEntry.auditCount}</strong> items need your review in the Audit Inbox
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={isPending || !paste.trim()}
        size="lg"
        className="w-full"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing ({processingStep})
          </>
        ) : (
          'Save Entry'
        )}
      </Button>
    </div>
  )
}

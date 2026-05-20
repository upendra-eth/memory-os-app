'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Loader2, ClipboardPaste, Eye } from 'lucide-react'
import { saveLifeLog } from '@/app/actions'

export function IngestorForm() {
  const [jsonInput, setJsonInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [savedData, setSavedData] = useState<Record<string, unknown> | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const validateJson = (input: string): Record<string, unknown> | null => {
    if (!input.trim()) return null
    try {
      const parsed = JSON.parse(input)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null
      }
      return parsed
    } catch {
      return null
    }
  }

  const handleInputChange = (value: string) => {
    setJsonInput(value)
    setSavedData(null)
    
    if (!value.trim()) {
      setParseError(null)
      return
    }
    
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed !== 'object' || parsed === null) {
        setParseError('Input must be a JSON object')
      } else if (Array.isArray(parsed)) {
        setParseError('Input must be a JSON object, not an array')
      } else {
        setParseError(null)
      }
    } catch (e) {
      setParseError(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`)
    }
  }

  const handleSave = async () => {
    const parsed = validateJson(jsonInput)
    if (!parsed) {
      toast.error('Invalid JSON', {
        description: 'Please enter a valid JSON object',
      })
      return
    }

    setIsLoading(true)
    try {
      const result = await saveLifeLog(parsed)
      
      if (result.success) {
        setSavedData(parsed)
        toast.success('Data saved successfully!', {
          description: 'Your log has been stored in the database',
        })
        setJsonInput('')
        setParseError(null)
      } else {
        toast.error('Failed to save', {
          description: result.error || 'An error occurred while saving',
        })
      }
    } catch (error) {
      toast.error('Failed to save', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      handleInputChange(text)
      toast.info('Pasted from clipboard')
    } catch {
      toast.error('Failed to paste', {
        description: 'Please allow clipboard access or paste manually',
      })
    }
  }

  const isValid = !parseError && jsonInput.trim().length > 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-primary" />
            JSON Input
          </CardTitle>
          <CardDescription>
            Paste your JSON data below. It will be stored with a timestamp for later analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Textarea
              placeholder={`{
  "type": "workout",
  "date": "2024-01-15",
  "exercises": [
    { "name": "Bench Press", "sets": 4, "reps": 10, "weight": 135 },
    { "name": "Squats", "sets": 4, "reps": 8, "weight": 185 }
  ],
  "duration_minutes": 45,
  "notes": "Great session, increased weight on squats"
}`}
              value={jsonInput}
              onChange={(e) => handleInputChange(e.target.value)}
              className="min-h-[300px] font-mono text-sm resize-none"
            />
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={handlePaste}
            >
              <ClipboardPaste className="h-4 w-4 mr-1" />
              Paste
            </Button>
          </div>
          
          {parseError && (
            <p className="text-sm text-destructive">{parseError}</p>
          )}
          
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={!isValid || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save to Database'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setJsonInput('')
                setSavedData(null)
                setParseError(null)
              }}
              disabled={!jsonInput && !savedData}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {savedData && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              Successfully Saved
            </CardTitle>
            <CardDescription>
              Here&apos;s a preview of the data that was stored
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-card rounded-lg p-4 border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Eye className="h-4 w-4" />
                Data Preview
              </div>
              <pre className="text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[300px] text-foreground">
                {JSON.stringify(savedData, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

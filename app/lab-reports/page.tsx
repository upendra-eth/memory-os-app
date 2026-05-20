'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Upload, AlertCircle, CheckCircle } from 'lucide-react'

interface LabResult {
  id: string
  test_name: string
  test_date: string
  results: Record<string, unknown>
  ai_analysis: string
}

export default function LabReportsPage() {
  const [results, setResults] = useState<LabResult[]>([])
  const [uploading, setUploading] = useState(false)
  const { toast } = useToast()

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/lab-reports', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Upload failed')

      const data = await response.json()
      setResults((prev) => [data.result, ...prev])

      toast({
        title: 'Success',
        description: `${data.result.test_name} uploaded and analyzed`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to upload lab report',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Lab Reports</h1>
        <p className="text-muted-foreground">Upload and track your medical test results</p>
      </div>

      {/* Upload Section */}
      <Card className="p-8 mb-8 border-dashed border-2 hover:bg-secondary transition">
        <label className="cursor-pointer flex flex-col items-center justify-center">
          <Upload className="w-12 h-12 text-primary/50 mb-4" />
          <p className="text-lg font-semibold mb-1">Upload Lab Report</p>
          <p className="text-sm text-muted-foreground mb-4">PDF or image of your lab results</p>
          <Button disabled={uploading} variant="outline">
            {uploading ? 'Uploading...' : 'Choose File'}
          </Button>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </Card>

      {/* Results */}
      <div className="space-y-4">
        {results.map((result) => (
          <Card key={result.id} className="p-6">
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">{result.test_name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Test Date: {new Date(result.test_date).toLocaleDateString('en-IN')}
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                  <p className="text-sm text-blue-900">{result.ai_analysis}</p>
                </div>
                <div className="flex items-start gap-2 p-3 rounded bg-amber-50 border border-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">
                    Discuss with your doctor for personalized interpretation of these results.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {results.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No lab reports uploaded yet</p>
        </Card>
      )}
    </div>
  )
}

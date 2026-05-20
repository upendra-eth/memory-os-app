import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) {
      return Response.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      )
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // Convert file to base64
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    // Determine MIME type
    const mimeType = file.type || 'application/pdf'

    // Extract markers from lab report using Vision
    const extractPrompt = `You are analyzing a medical lab report image.
Extract all test markers and their values in JSON format:
{
  "test_name": "Full test name",
  "test_date": "YYYY-MM-DD if visible",
  "markers": [
    {
      "name": "Marker name",
      "value": number,
      "unit": "unit",
      "reference_min": number,
      "reference_max": number
    }
  ]
}
Return only valid JSON.`

    const extractResult = await model.generateContent([
      extractPrompt,
      {
        inlineData: {
          mimeType: mimeType,
          data: base64,
        },
      },
    ])

    let extractedData
    try {
      const text = extractResult.response.text()
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch {
      extractedData = { test_name: 'Lab Report', markers: [] }
    }

    // Generate analysis
    const analyzePrompt = `Based on these lab markers, provide a brief educational summary (never diagnose):
${JSON.stringify(extractedData.markers)}

Return JSON:
{
  "summary": "Brief summary",
  "notable": ["Notable finding 1"],
  "next_steps": "Suggest discussing with doctor"
}`

    const analysisResult = await model.generateContent(analyzePrompt)
    let analysis = analysisResult.response.text()

    // Save to database
    const supabase = await createClient()
    const { data: result, error } = await supabase
      .from('lab_results')
      .insert({
        test_name: extractedData.test_name || 'Lab Report',
        test_date: extractedData.test_date || new Date().toISOString().split('T')[0],
        results: extractedData,
        ai_analysis: analysis,
      })
      .select()
      .single()

    if (error) throw error

    return Response.json({ result })
  } catch (error) {
    console.error('Lab report API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to process lab report' },
      { status: 500 }
    )
  }
}

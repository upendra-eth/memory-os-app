export interface ParsedEntry {
  raw: string
  narrative: string
  extracted: string
}

export function parseThreeSectionPaste(fullText: string): ParsedEntry {
  const rawMatch = fullText.match(/===\s*RAW\s*===\s*([\s\S]*?)(?===\s*NARRATIVE|$)/)
  const narrativeMatch = fullText.match(/===\s*NARRATIVE\s*===\s*([\s\S]*?)(?===\s*EXTRACTED|$)/)
  const extractedMatch = fullText.match(/===\s*EXTRACTED\s*===\s*([\s\S]*?)$/)

  return {
    raw: rawMatch ? rawMatch[1].trim() : fullText,
    narrative: narrativeMatch ? narrativeMatch[1].trim() : '',
    extracted: extractedMatch ? extractedMatch[1].trim() : '',
  }
}

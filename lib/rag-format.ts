export interface SearchResult {
  id: string
  created_at: string
  narrative_text: string
  extracted_json: Record<string, unknown>
  relevance_score: number
}

export function formatEntriesForContext(entries: SearchResult[]): string {
  if (entries.length === 0) return 'No relevant entries found in the last 30 days.'

  return entries
    .map((entry) => {
      const date = new Date(entry.created_at).toLocaleDateString('en-IN')
      return `[${date}] ${entry.narrative_text || 'Entry without narrative'}`
    })
    .join('\n\n')
}

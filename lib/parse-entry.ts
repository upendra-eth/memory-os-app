export interface ParsedEntry {
  raw: string
  narrative: string
  extracted: string
}

/**
 * Locate a section header line for `name`, tolerant of however the assistant
 * decorated it. All of these match:
 *   === RAW ===      ### RAW      ## NARRATIVE      **EXTRACTED**      RAW:
 * The header must be on its own line (optionally wrapped in #, =, or *), so the
 * word appearing mid-sentence in the body (e.g. "raw chicken") never matches.
 */
function findHeader(text: string, name: string): { contentStart: number; headerStart: number } | null {
  const re = new RegExp(
    `(?:^|\\n)[ \\t]*(?:#{1,6}[ \\t]*|={2,}[ \\t]*|\\*{1,2}[ \\t]*)?${name}\\b[ \\t]*(?:={2,}|\\*{1,2}|:)?[ \\t]*(?=\\n|$)`,
    'i',
  )
  const m = re.exec(text)
  if (!m) return null
  return { headerStart: m.index, contentStart: m.index + m[0].length }
}

export function parseThreeSectionPaste(fullText: string): ParsedEntry {
  const raw = findHeader(fullText, 'RAW')
  const narrative = findHeader(fullText, 'NARRATIVE')
  const extracted = findHeader(fullText, 'EXTRACTED')

  const sliceFrom = (
    from: { contentStart: number } | null,
    ...nexts: ({ headerStart: number } | null)[]
  ): string => {
    if (!from) return ''
    const ends = nexts
      .map((n) => n?.headerStart)
      .filter((v): v is number => typeof v === 'number' && v > from.contentStart)
    const end = ends.length ? Math.min(...ends) : fullText.length
    // Strip markdown horizontal rules ("---") left between sections, leading or trailing.
    return fullText
      .slice(from.contentStart, end)
      .replace(/^\s*-{3,}\s*/, '')
      .replace(/\s*-{3,}\s*$/, '')
      .trim()
  }

  return {
    raw: raw ? sliceFrom(raw, narrative, extracted) : fullText.trim(),
    narrative: sliceFrom(narrative, extracted),
    extracted: sliceFrom(extracted),
  }
}

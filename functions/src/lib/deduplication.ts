import type { NewsItem } from '../types/news'

function normalizeTitle(title: string): string {
  return title
    .replace(/\[.*?\]|【.*?】|〔.*?〕/g, '')
    .replace(/[^\w가-힣\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(ngrams(a, 2))
  const setB = new Set(ngrams(b, 2))

  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0

  let intersection = 0
  for (const gram of setA) {
    if (setB.has(gram)) intersection++
  }

  return intersection / (setA.size + setB.size - intersection)
}

function ngrams(text: string, n: number): string[] {
  const result: string[] = []
  for (let i = 0; i <= text.length - n; i++) {
    result.push(text.slice(i, i + n))
  }
  return result
}

export function deduplicateNews(items: NewsItem[], threshold = 0.6): NewsItem[] {
  const unique: NewsItem[] = []
  const normalizedTitles: string[] = []

  for (const item of items) {
    const normalized = normalizeTitle(item.title)
    let isDuplicate = false

    for (const existing of normalizedTitles) {
      const similarity = jaccardSimilarity(normalized, existing)
      if (similarity >= threshold) {
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      unique.push(item)
      normalizedTitles.push(normalized)
    }
  }

  return unique
}

export function deduplicateByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const cleanUrl = item.url.split('?')[0]
    if (seen.has(cleanUrl)) return false
    seen.add(cleanUrl)
    return true
  })
}

export function processNewsItems(items: NewsItem[]): NewsItem[] {
  const byUrl = deduplicateByUrl(items)
  const byTitle = deduplicateNews(byUrl, 0.65)
  return byTitle.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

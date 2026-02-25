import type { NewsItem } from '@/types/news'

// ─── 제목 정규화 ──────────────────────────────────────────
function normalizeTitle(title: string): string {
  return title
    .replace(/\[.*?\]|【.*?】|〔.*?〕/g, '')  // 언론사 태그 제거
    .replace(/[^\w가-힣\s]/g, '')              // 특수문자 제거
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// ─── 자카드 유사도 ────────────────────────────────────────
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

// ─── 중복 제거 ────────────────────────────────────────────
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

// ─── URL 기준 중복 제거 ───────────────────────────────────
export function deduplicateByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    // URL에서 쿼리스트링 제거 후 비교
    const cleanUrl = item.url.split('?')[0]
    if (seen.has(cleanUrl)) return false
    seen.add(cleanUrl)
    return true
  })
}

// ─── 최신순 정렬 + 중복 제거 조합 ────────────────────────
export function processNewsItems(items: NewsItem[]): NewsItem[] {
  const byUrl = deduplicateByUrl(items)
  const byTitle = deduplicateNews(byUrl, 0.65)
  return byTitle.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

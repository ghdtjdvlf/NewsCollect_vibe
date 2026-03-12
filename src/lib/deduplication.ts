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

// ─── URL 기준 중복 제거 ───────────────────────────────────
export function deduplicateByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const cleanUrl = item.url.split('?')[0]
    if (seen.has(cleanUrl)) return false
    seen.add(cleanUrl)
    return true
  })
}

// ─── 제목 유사도 중복 제거 (기존 DB 제목 포함 교차 검사) ──
// threshold=0.9 → 90% 이상 일치 시 중복으로 간주
export function deduplicateNews(
  items: NewsItem[],
  existingTitles: string[] = [],
  threshold = 0.7
): NewsItem[] {
  const unique: NewsItem[] = []
  // 기존 DB 제목 미리 정규화해서 pool에 추가
  const pool: string[] = existingTitles.map(normalizeTitle)

  for (const item of items) {
    const normalized = normalizeTitle(item.title)
    let isDuplicate = false

    for (const existing of pool) {
      if (jaccardSimilarity(normalized, existing) >= threshold) {
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      unique.push(item)
      pool.push(normalized) // 배치 내 중복도 방지
    }
  }

  return unique
}

// ─── 최신순 정렬 + 중복 제거 조합 ────────────────────────
export function processNewsItems(items: NewsItem[], existingTitles: string[] = []): NewsItem[] {
  const byUrl = deduplicateByUrl(items)
  const byTitle = deduplicateNews(byUrl, existingTitles, 0.7)
  return byTitle.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

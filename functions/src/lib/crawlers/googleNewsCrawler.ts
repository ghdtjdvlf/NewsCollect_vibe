import { fetchWithRetry, parseRss } from '../fetcher'
import { logCrawl } from '../crawlLogger'
import type { NewsItem, NewsCategory } from '../../types/news'
import { stableId, toIso, guessCategory } from './utils'

const GOOGLE_RSS_BASE = 'https://news.google.com/rss'

const CATEGORY_FEEDS: Record<NewsCategory, string> = {
  경제: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  사회: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  정치: `${GOOGLE_RSS_BASE}/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtdHZLQUFQAQ?hl=ko&gl=KR&ceid=KR:ko`,
  'IT/과학': `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  스포츠: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNR1ptZDNZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  연예: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtdHZIZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  세계: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtdHZIZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  사건사고: `${GOOGLE_RSS_BASE}/search?q=사건+사고&hl=ko&gl=KR&ceid=KR:ko`,
  기타: `${GOOGLE_RSS_BASE}?hl=ko&gl=KR&ceid=KR:ko`,
}

const HEADLINES_FEED = `${GOOGLE_RSS_BASE}?hl=ko&gl=KR&ceid=KR:ko`

export async function fetchGoogleNewsHeadlines(limit = 20): Promise<NewsItem[]> {
  const start = Date.now()
  let failed = 0

  try {
    const xml = await fetchWithRetry(HEADLINES_FEED, { timeout: 8000 })
    const rssItems = parseRss(xml).slice(0, limit)

    const items: NewsItem[] = rssItems.map((r) => ({
      id: stableId(r.link, 'g'),
      title: r.title,
      url: r.link,
      source: 'google' as const,
      sourceName: r.source ?? '구글뉴스',
      category: guessCategory(r.title),
      publishedAt: toIso(r.pubDate),
      collectedAt: new Date().toISOString(),
      summary: r.description,
      thumbnail: r.thumbnail,
    }))

    logCrawl({
      source: 'google',
      method: 'firecrawl',
      collected: items.length,
      deduplicated: items.length,
      filtered: 0,
      failed,
      duration_ms: Date.now() - start,
    })

    return items
  } catch (err) {
    failed = 1
    logCrawl({
      source: 'google',
      method: 'firecrawl',
      collected: 0,
      deduplicated: 0,
      filtered: 0,
      failed,
      duration_ms: Date.now() - start,
    })
    console.error('[GoogleNews] 크롤링 실패:', err)
    return []
  }
}

export async function fetchGoogleNewsByCategory(
  category: NewsCategory,
  limit = 15
): Promise<NewsItem[]> {
  const start = Date.now()
  const feed = CATEGORY_FEEDS[category] ?? HEADLINES_FEED

  try {
    const xml = await fetchWithRetry(feed, { timeout: 8000 })
    const rssItems = parseRss(xml).slice(0, limit)

    const items: NewsItem[] = rssItems.map((r) => ({
      id: stableId(r.link, 'g'),
      title: r.title,
      url: r.link,
      source: 'google' as const,
      sourceName: r.source ?? '구글뉴스',
      category,
      publishedAt: toIso(r.pubDate),
      collectedAt: new Date().toISOString(),
      summary: r.description,
      thumbnail: r.thumbnail,
    }))

    logCrawl({
      source: 'google',
      method: 'firecrawl',
      collected: items.length,
      deduplicated: items.length,
      filtered: 0,
      failed: 0,
      duration_ms: Date.now() - start,
    })

    return items
  } catch (err) {
    logCrawl({
      source: 'google',
      method: 'firecrawl',
      collected: 0,
      deduplicated: 0,
      filtered: 0,
      failed: 1,
      duration_ms: Date.now() - start,
    })
    console.error(`[GoogleNews:${category}] 실패:`, err)
    return []
  }
}

import { fetchWithRetry, parseRss } from '@/lib/fetcher'
import { logCrawl } from '@/lib/crawlLogger'
import type { NewsItem, NewsCategory } from '@/types/news'
import { randomId, toIso } from './utils'

// 구글 뉴스 KR RSS 엔드포인트
const GOOGLE_RSS_BASE = 'https://news.google.com/rss'

const CATEGORY_FEEDS: Record<NewsCategory, string> = {
  경제: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  사회: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  정치: `${GOOGLE_RSS_BASE}/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtdHZLQUFQAQ?hl=ko&gl=KR&ceid=KR:ko`,
  'IT/과학': `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  스포츠: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNR1ptZDNZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  연예: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  세계: `${GOOGLE_RSS_BASE}/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko`,
  사건사고: `${GOOGLE_RSS_BASE}/search?q=사건+사고&hl=ko&gl=KR&ceid=KR:ko`,
  기타: `${GOOGLE_RSS_BASE}?hl=ko&gl=KR&ceid=KR:ko`,
}

// 메인 헤드라인 (화제뉴스용)
const HEADLINES_FEED = `${GOOGLE_RSS_BASE}?hl=ko&gl=KR&ceid=KR:ko`

export async function fetchGoogleNewsHeadlines(limit = 20): Promise<NewsItem[]> {
  const start = Date.now()
  let failed = 0

  try {
    const xml = await fetchWithRetry(HEADLINES_FEED, { timeout: 8000 })
    const rssItems = parseRss(xml).slice(0, limit)

    const items: NewsItem[] = rssItems.map((r) => ({
      id: randomId('g'),
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
      id: randomId('g'),
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

// 제목에서 카테고리 추정
function guessCategory(title: string): NewsCategory {
  if (/코스피|코스닥|금리|환율|주가|경제|GDP|물가|금융|주식|부동산/.test(title)) return '경제'
  if (/사고|화재|추락|사망|부상|범죄|경찰|검거|체포|살인|강도/.test(title)) return '사건사고'
  if (/대통령|국회|정부|여당|야당|선거|장관|총리|국정/.test(title)) return '정치'
  if (/AI|반도체|삼성|LG|카카오|네이버|애플|구글|메타|IT|챗GPT/.test(title)) return 'IT/과학'
  if (/월드컵|올림픽|축구|야구|농구|배구|스포츠|선수|경기/.test(title)) return '스포츠'
  if (/드라마|영화|아이돌|연예|가수|배우|음악|콘서트/.test(title)) return '연예'
  if (/미국|중국|일본|러시아|북한|유럽|해외|외교/.test(title)) return '세계'
  if (/복지|교육|의료|병원|환경|사회|시민/.test(title)) return '사회'
  return '기타'
}

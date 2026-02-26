/**
 * 뉴스 수집 파이프라인 총괄
 * 크롤링 → 중복 제거 → 커뮤니티 필터 → 결과 반환
 */
import { fetchGoogleNewsHeadlines, fetchGoogleNewsByCategory } from './crawlers/googleNewsCrawler'
import { fetchNaverRss, fetchNaverRanking, fetchNaverSection } from './crawlers/naverCrawler'
import { fetchDaumRss, fetchDaumHotIssues } from './crawlers/daumCrawler'
import { fetchAllCommunities } from './crawlers/communityCrawler'
import { processNewsItems } from './deduplication'
import { filterTrendingNews, clusterByTopic } from './communityFilter'
import { fetchWithRetry, parseRss } from './fetcher'
import { randomId, toIso, guessCategory } from './crawlers/utils'
import type { NewsItem, NewsCategory, TrendingResponse, NewsResponse, SearchResponse } from '@/types/news'

// ─── 전체 파이프라인 타임아웃 래퍼 ──────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

// ─── 인메모리 캐시 ────────────────────────────────────────
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()

// ─── 기사 아이템 캐시 (상세 페이지용) ────────────────────
const ITEM_CACHE_MAX = 500
const itemCache = new Map<string, NewsItem>()

function cacheNewsItems(items: NewsItem[]) {
  for (const item of items) {
    itemCache.set(item.id, item)
  }
  // 크기 초과 시 오래된 항목 제거
  if (itemCache.size > ITEM_CACHE_MAX) {
    const toDelete = [...itemCache.keys()].slice(0, 100)
    toDelete.forEach((k) => itemCache.delete(k))
  }
}

export function getCachedNewsItem(id: string): NewsItem | undefined {
  return itemCache.get(id)
}

function getCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache<T>(key: string, data: T, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// ─── 화제뉴스 파이프라인 ──────────────────────────────────
export async function getTrendingNews(): Promise<TrendingResponse> {
  const cacheKey = 'trending'
  const cached = getCache<TrendingResponse>(cacheKey)
  if (cached) return cached

  // 뉴스 수집 (최대 12초) — Naver/Daum HTML 크롤링 우선 (이미지 포함)
  const rawNews = await withTimeout(
    Promise.allSettled([
      fetchNaverRss(15),                          // Naver 섹션 HTML (이미지 O)
      fetchDaumRss(['경제', '사회', '정치'], 10),   // Daum 섹션 HTML (이미지 O)
      fetchGoogleNewsHeadlines(20),               // Google News RSS (폴백)
    ]).then((results) =>
      results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    ),
    12000,
    [] as NewsItem[]
  )

  // 커뮤니티 수집 (최대 8초, 실패 허용)
  const communityPosts = await withTimeout(fetchAllCommunities(), 8000, [])

  const deduplicated = processNewsItems(rawNews)
  const trending = filterTrendingNews(deduplicated, communityPosts, 0, 20)

  cacheNewsItems(trending)

  const response: TrendingResponse = {
    items: trending,
    updatedAt: new Date().toISOString(),
  }

  setCache(cacheKey, response, 60 * 1000)
  return response
}

// ─── 최신뉴스 파이프라인 ──────────────────────────────────
export async function getLatestNews(
  category?: NewsCategory,
  page = 1,
  limit = 10
): Promise<NewsResponse> {
  const cacheKey = `latest:${category ?? 'all'}:${page}`
  const cached = getCache<NewsResponse>(cacheKey)
  if (cached) return cached

  // 전용 크롤링 섹션 없는 카테고리는 관련 섹션에서 수집 후 필터링
  const CRAWL_FALLBACK: Partial<Record<NewsCategory, NewsCategory[]>> = {
    '사건사고': ['사회', '정치'],
    '기타': ['사회', '경제'],
  }
  const targetCategories: NewsCategory[] = category
    ? (CRAWL_FALLBACK[category] ?? [category])
    : ['경제', '사회', '사건사고', '정치', 'IT/과학']

  // 최대 12초 내에 수집 — Naver/Daum HTML 크롤링 우선 (이미지 포함)
  const raw = await withTimeout(
    Promise.allSettled([
      Promise.all(targetCategories.map((cat) => fetchNaverSection(cat, 20))).then((r) => r.flat()),
      fetchDaumRss(targetCategories, 20),
      Promise.all(targetCategories.map((cat) => fetchGoogleNewsByCategory(cat, 5))).then((r) => r.flat()),
    ]).then((results) =>
      results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    ),
    12000,
    [] as NewsItem[]
  )

  let items = processNewsItems(raw)
  if (category) {
    items = items.filter((item) => item.category === category)
  }

  cacheNewsItems(items)

  const total = items.length
  const start = (page - 1) * limit
  const pageItems = items.slice(start, start + limit)

  const response: NewsResponse = {
    items: pageItems,
    total,
    page,
    hasMore: start + limit < total,
    updatedAt: new Date().toISOString(),
  }

  setCache(cacheKey, response, 60 * 1000)
  return response
}

// ─── 검색 파이프라인 ──────────────────────────────────────
export async function searchNews(
  keyword: string,
  sort: 'latest' | 'relevance' = 'relevance',
  page = 1,
  limit = 10
): Promise<SearchResponse> {
  if (!keyword.trim()) {
    return { keyword, total: 0, clusters: [], suggestions: [] }
  }

  const cacheKey = `search:${keyword}:${sort}:${page}`
  const cached = getCache<SearchResponse>(cacheKey)
  if (cached) return cached

  const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`

  // 검색 결과 (최대 8초)
  const items = await withTimeout(
    fetchWithRetry(searchUrl, { timeout: 7000 })
      .then((xml) =>
        parseRss(xml).map((r) => ({
          id: randomId('s'),
          title: r.title,
          url: r.link,
          source: 'google' as const,
          sourceName: r.source ?? '구글뉴스',
          category: guessCategory(r.title),
          publishedAt: toIso(r.pubDate),
          collectedAt: new Date().toISOString(),
          summary: r.description,
          thumbnail: r.thumbnail,
          relevanceScore: 0.9,
        } satisfies NewsItem))
      )
      .catch(() => [] as NewsItem[]),
    8000,
    [] as NewsItem[]
  )

  const sorted =
    sort === 'latest'
      ? [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      : items

  const deduplicated = processNewsItems(sorted)
  cacheNewsItems(deduplicated)
  const clusters = clusterByTopic(deduplicated, keyword).map((c) => ({
    id: randomId('cl'),
    topic: keyword,
    ...c,
  }))

  // 관련 키워드 추천 (최대 3초)
  const suggestions = await withTimeout(
    fetchDaumHotIssues().then((kws) =>
      kws.filter((k) => k !== keyword).slice(0, 5)
    ).catch(() => [`${keyword} 최신`, `${keyword} 원인`, `${keyword} 오늘`]),
    3000,
    [`${keyword} 최신`, `${keyword} 원인`]
  )

  const response: SearchResponse = {
    keyword,
    total: deduplicated.length,
    clusters,
    suggestions,
  }

  setCache(cacheKey, response, 30 * 1000)
  return response
}

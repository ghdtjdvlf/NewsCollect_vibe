import { fetchGoogleNewsHeadlines, fetchGoogleNewsByCategory } from './crawlers/googleNewsCrawler'
import { fetchNaverRss, fetchNaverSection } from './crawlers/naverCrawler'
import { fetchDaumRss } from './crawlers/daumCrawler'
import { fetchAllCommunities } from './crawlers/communityCrawler'
import { processNewsItems } from './deduplication'
import { filterTrendingNews } from './communityFilter'
import type { NewsItem, NewsCategory, TrendingResponse, NewsResponse } from '../types/news'

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

// ─── 화제뉴스 파이프라인 ──────────────────────────────────
export async function getTrendingNews(): Promise<TrendingResponse> {
  const rawNews = await withTimeout(
    Promise.allSettled([
      fetchNaverRss(15),
      fetchDaumRss(['경제', '사회', '정치'], 10),
      fetchGoogleNewsHeadlines(20),
    ]).then((results) =>
      results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    ),
    15000,
    [] as NewsItem[]
  )

  const communityPosts = await withTimeout(fetchAllCommunities(), 10000, [])

  const deduplicated = processNewsItems(rawNews)
  const trending = filterTrendingNews(deduplicated, communityPosts, 0, 20)

  return {
    items: trending,
    updatedAt: new Date().toISOString(),
  }
}

// ─── 최신뉴스 파이프라인 ──────────────────────────────────
export async function getLatestNews(
  category?: NewsCategory,
  page = 1,
  limit = 10
): Promise<NewsResponse> {
  const CRAWL_FALLBACK: Partial<Record<NewsCategory, NewsCategory[]>> = {
    '사건사고': ['사회', '정치'],
    '기타': ['사회', '경제'],
  }
  const targetCategories: NewsCategory[] = category
    ? (CRAWL_FALLBACK[category] ?? [category])
    : ['경제', '사회', '사건사고', '정치', 'IT/과학']

  const raw = await withTimeout(
    Promise.allSettled([
      Promise.all(targetCategories.map((cat) => fetchNaverSection(cat, 20))).then((r) => r.flat()),
      fetchDaumRss(targetCategories, 20),
      Promise.all(targetCategories.map((cat) => fetchGoogleNewsByCategory(cat, 5))).then((r) => r.flat()),
    ]).then((results) =>
      results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    ),
    15000,
    [] as NewsItem[]
  )

  let items = processNewsItems(raw)
  if (category) {
    items = items.filter((item) => item.category === category)
  }

  const total = items.length
  const start = (page - 1) * limit
  const pageItems = items.slice(start, start + limit)

  return {
    items: pageItems,
    total,
    page,
    hasMore: start + limit < total,
    updatedAt: new Date().toISOString(),
  }
}

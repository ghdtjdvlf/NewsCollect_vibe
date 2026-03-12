// ─── CrawlerAgent: 뉴스 수집 ─────────────────────────────
import { BaseAgent } from './base'
import { fetchNaverRss, fetchNaverSection } from '@/lib/crawlers/naverCrawler'
import { fetchDaumRss } from '@/lib/crawlers/daumCrawler'
import { fetchGoogleNewsHeadlines, fetchGoogleNewsByCategory } from '@/lib/crawlers/googleNewsCrawler'
import { fetchAllCommunities } from '@/lib/crawlers/communityCrawler'
import type { NewsItem, NewsCategory } from '@/types/news'
import type { CommunityPost } from '@/lib/crawlers/communityCrawler'

export interface CrawlerInput {
  mode: 'trending' | 'latest'
  categories?: NewsCategory[]
  limit?: number
}

export interface CrawlerOutput {
  newsItems: NewsItem[]
  communityPosts: CommunityPost[]
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

export class CrawlerAgent extends BaseAgent<CrawlerInput, CrawlerOutput> {
  readonly name = 'CrawlerAgent'

  async execute(input: CrawlerInput): Promise<CrawlerOutput> {
    const { mode, categories = ['경제', '사회', '정치', 'IT/과학'], limit = 50 } = input

    // 뉴스 포털 크롤링
    const newsItems = await withTimeout(
      Promise.allSettled(
        mode === 'trending'
          ? [
              fetchNaverRss(limit),
              fetchDaumRss(['경제', '사회', '정치'], limit),
              fetchGoogleNewsHeadlines(limit),
            ]
          : [
              Promise.all(categories.map((cat) => fetchNaverSection(cat, limit))).then((r) => r.flat()),
              fetchDaumRss(categories, limit),
              Promise.all(categories.map((cat) => fetchGoogleNewsByCategory(cat, 5))).then((r) => r.flat()),
            ]
      ).then((results) => results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))),
      8000,
      [] as NewsItem[]
    )

    // 커뮤니티 크롤링 (화제뉴스 점수용)
    const communityPosts = await withTimeout(fetchAllCommunities(), 5000, [] as CommunityPost[])

    console.log(`[CrawlerAgent] 뉴스 ${newsItems.length}개, 커뮤니티 ${communityPosts.length}개 수집`)

    return { newsItems, communityPosts }
  }
}

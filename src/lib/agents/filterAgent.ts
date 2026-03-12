// ─── FilterAgent: 중복제거 + 트렌드 스코어링 ──────────────
import { BaseAgent } from './base'
import { processNewsItems } from '@/lib/deduplication'
import { filterTrendingNews } from '@/lib/communityFilter'
import type { NewsItem, NewsCategory } from '@/types/news'
import type { CommunityPost } from '@/lib/crawlers/communityCrawler'

export interface FilterInput {
  newsItems: NewsItem[]
  communityPosts: CommunityPost[]
  mode: 'trending' | 'latest'
  category?: NewsCategory
  existingTitles?: string[]  // Firestore 기존 기사 제목 (교차 중복 방지)
}

export interface FilterOutput {
  items: NewsItem[]
  totalBefore: number
  totalAfter: number
}

export class FilterAgent extends BaseAgent<FilterInput, FilterOutput> {
  readonly name = 'FilterAgent'

  async execute(input: FilterInput): Promise<FilterOutput> {
    const { newsItems, communityPosts, mode, category, existingTitles = [] } = input
    const totalBefore = newsItems.length

    // URL 중복 제거 + 90% 제목 유사도 기준 중복 제거 (기존 DB 포함)
    let items = processNewsItems(newsItems, existingTitles)

    // 카테고리 필터
    if (category) {
      items = items.filter((item) => item.category === category)
    }

    if (mode === 'trending') {
      // 커뮤니티 키워드 매칭 → trendScore 계산 (전체 보관, 자르지 않음)
      items = filterTrendingNews(items, communityPosts, 0, items.length)
    }

    console.log(`[FilterAgent] ${totalBefore}개 → 중복제거 후 ${items.length}개 (기존 DB 참조: ${existingTitles.length}개)`)

    return { items, totalBefore, totalAfter: items.length }
  }
}

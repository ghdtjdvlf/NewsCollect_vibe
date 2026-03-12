// ─── FilterAgent: 중복제거 + 트렌드 필터링 ───────────────
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
  limit?: number
}

export interface FilterOutput {
  items: NewsItem[]
  totalBefore: number
  totalAfter: number
}

export class FilterAgent extends BaseAgent<FilterInput, FilterOutput> {
  readonly name = 'FilterAgent'

  async execute(input: FilterInput): Promise<FilterOutput> {
    const { newsItems, communityPosts, mode, category, limit = 20 } = input
    const totalBefore = newsItems.length

    // 중복 제거 (URL + Jaccard 유사도)
    let items = processNewsItems(newsItems)

    if (mode === 'trending') {
      // 커뮤니티 키워드 매칭 → trendScore 계산
      items = filterTrendingNews(items, communityPosts, 0, limit)
    } else {
      // 카테고리 필터
      if (category) {
        items = items.filter((item) => item.category === category)
      }
      items = items.slice(0, limit)
    }

    console.log(`[FilterAgent] ${totalBefore}개 → 중복제거 후 ${items.length}개`)

    return { items, totalBefore, totalAfter: items.length }
  }
}

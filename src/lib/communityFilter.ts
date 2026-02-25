import type { NewsItem } from '@/types/news'
import type { CommunityPost } from './crawlers/communityCrawler'
import { toMention } from './crawlers/communityCrawler'

// ─── 커뮤니티 키워드와 뉴스 제목 매칭 ───────────────────
function matchScore(newsTitle: string, communityPosts: CommunityPost[]): {
  score: number
  matches: CommunityPost[]
} {
  const normalizedTitle = newsTitle
    .replace(/[^\w가-힣\s]/g, ' ')
    .toLowerCase()

  let score = 0
  const matches: CommunityPost[] = []

  for (const post of communityPosts) {
    let postScore = 0

    for (const keyword of post.keywords) {
      if (keyword.length >= 2 && normalizedTitle.includes(keyword.toLowerCase())) {
        // 키워드 길이에 비례한 가중치
        postScore += keyword.length >= 4 ? 3 : keyword.length >= 3 ? 2 : 1
      }
    }

    if (postScore > 0) {
      // 댓글/조회수 기반 가중치 추가
      const engagementBonus = Math.log10(Math.max(post.commentCount + 1, 1)) * 0.5
      score += postScore + engagementBonus
      matches.push(post)
    }
  }

  return { score, matches }
}

// ─── 화제뉴스 선별 ────────────────────────────────────────
export function filterTrendingNews(
  newsItems: NewsItem[],
  communityPosts: CommunityPost[],
  minScore = 1,
  limit = 20
): NewsItem[] {
  if (communityPosts.length === 0) {
    // 커뮤니티 데이터 없으면 뉴스 그대로 반환
    return newsItems.slice(0, limit)
  }

  const scored = newsItems
    .map((item) => {
      const { score, matches } = matchScore(item.title, communityPosts)

      return {
        item: {
          ...item,
          trendScore: Math.round(score * 10),
          communityMentions: matches.slice(0, 3).map(toMention),
        },
        score,
      }
    })
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)

  // 점수 없는 뉴스도 일부 포함 (최신순)
  const trending = scored.map((s) => s.item).slice(0, limit)
  const remaining = newsItems
    .filter((item) => !trending.some((t) => t.id === item.id))
    .slice(0, Math.max(0, limit - trending.length))

  return [...trending, ...remaining].slice(0, limit)
}

// ─── 검색 키워드 기반 클러스터링 ────────────────────────
export function clusterByTopic(
  items: NewsItem[],
  keyword: string
): { representative: NewsItem; related: NewsItem[] }[] {
  if (items.length === 0) return []

  // 키워드 포함 기사를 대표 기사로, 나머지를 관련 기사로 그룹화
  const primary = items.filter((i) =>
    i.title.toLowerCase().includes(keyword.toLowerCase())
  )
  const secondary = items.filter(
    (i) => !primary.some((p) => p.id === i.id)
  )

  if (primary.length === 0) {
    return items.slice(0, 5).map((item) => ({ representative: item, related: [] }))
  }

  // 대표 기사 1개 + 관련 기사 묶음
  const clusters: { representative: NewsItem; related: NewsItem[] }[] = []
  const chunkSize = 3

  for (let i = 0; i < primary.length; i += chunkSize) {
    const chunk = primary.slice(i, i + chunkSize)
    const rep = chunk[0]
    const related = [
      ...chunk.slice(1),
      ...secondary.slice(i, i + 1),
    ]
    clusters.push({ representative: rep, related })
  }

  return clusters.slice(0, 8)
}

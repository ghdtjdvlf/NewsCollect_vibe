import type { NewsItem } from '@/types/news'
import type { CommunityPost } from './crawlers/communityCrawler'
import { toMention, extractKeywords } from './crawlers/communityCrawler'

function keywordWeight(kw: string): number {
  // 바이그램(띄어쓰기 포함)은 고가중치
  if (kw.includes(' ')) return 5
  if (kw.length >= 4) return 3
  if (kw.length >= 3) return 2
  return 1
}

// ─── 커뮤니티 키워드 ↔ 뉴스 제목 양방향 매칭 ──────────
function matchScore(newsTitle: string, communityPosts: CommunityPost[]): {
  score: number
  matches: CommunityPost[]
} {
  const normalizedNews = newsTitle.replace(/[^\w가-힣\s]/g, ' ').toLowerCase()
  const newsKeywords = extractKeywords(normalizedNews)

  let score = 0
  const matches: CommunityPost[] = []

  for (const post of communityPosts) {
    const normalizedPost = post.postTitle.replace(/[^\w가-힣\s]/g, ' ').toLowerCase()
    const dir1: string[] = []
    const dir2: string[] = []

    // 방향 1: 커뮤니티 키워드 → 뉴스 제목에 포함
    // 2글자 단일어는 단방향 매칭에서 제외 (오탐 방지)
    for (const kw of post.keywords) {
      const isShortUnigram = !kw.includes(' ') && kw.length === 2
      if (isShortUnigram) continue
      if (normalizedNews.includes(kw.toLowerCase())) dir1.push(kw)
    }

    // 방향 2: 뉴스 키워드 → 커뮤니티 글에 포함
    for (const kw of newsKeywords) {
      const isShortUnigram = !kw.includes(' ') && kw.length === 2
      if (isShortUnigram) continue
      if (normalizedPost.includes(kw.toLowerCase())) dir2.push(kw)
    }

    if (dir1.length === 0 && dir2.length === 0) continue

    let postScore =
      dir1.reduce((s, kw) => s + keywordWeight(kw), 0) +
      dir2.reduce((s, kw) => s + keywordWeight(kw), 0)

    // 양방향 모두 매칭 시 보너스
    if (dir1.length > 0 && dir2.length > 0) postScore *= 1.5

    const engagementBonus = Math.log10(Math.max(post.commentCount + 1, 1)) * 0.5
    score += postScore + engagementBonus
    matches.push(post)
  }

  return { score, matches }
}

// ─── 화제뉴스 선별 ────────────────────────────────────────
export function filterTrendingNews(
  newsItems: NewsItem[],
  communityPosts: CommunityPost[],
  minScore = 2,
  limit = 20
): NewsItem[] {
  if (communityPosts.length === 0) {
    return newsItems.slice(0, limit)
  }

  const scored = newsItems
    .map((item) => {
      const { score, matches } = matchScore(item.title, communityPosts)

      // 소스별 최고 점수 멘션 1개씩만 선택 (같은 커뮤니티 중복 제거)
      const seenSource = new Set<string>()
      const topMentions = matches
        .filter((m) => {
          if (seenSource.has(m.source)) return false
          seenSource.add(m.source)
          return true
        })
        .slice(0, 3)
        .map(toMention)

      return {
        item: {
          ...item,
          trendScore: Math.round(score * 10),
          communityMentions: topMentions,
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

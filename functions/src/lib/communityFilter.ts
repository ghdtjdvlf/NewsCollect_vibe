import type { NewsItem } from '../types/news'
import type { CommunityPost } from './crawlers/communityCrawler'
import { toMention } from './crawlers/communityCrawler'

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
        postScore += keyword.length >= 4 ? 3 : keyword.length >= 3 ? 2 : 1
      }
    }

    if (postScore > 0) {
      const engagementBonus = Math.log10(Math.max(post.commentCount + 1, 1)) * 0.5
      score += postScore + engagementBonus
      matches.push(post)
    }
  }

  return { score, matches }
}

export function filterTrendingNews(
  newsItems: NewsItem[],
  communityPosts: CommunityPost[],
  minScore = 1,
  limit = 20
): NewsItem[] {
  if (communityPosts.length === 0) {
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

  const trending = scored.map((s) => s.item).slice(0, limit)
  const remaining = newsItems
    .filter((item) => !trending.some((t) => t.id === item.id))
    .slice(0, Math.max(0, limit - trending.length))

  return [...trending, ...remaining].slice(0, limit)
}

export function clusterByTopic(
  items: NewsItem[],
  keyword: string
): { representative: NewsItem; related: NewsItem[] }[] {
  if (items.length === 0) return []

  const primary = items.filter((i) =>
    i.title.toLowerCase().includes(keyword.toLowerCase())
  )
  const secondary = items.filter(
    (i) => !primary.some((p) => p.id === i.id)
  )

  if (primary.length === 0) {
    return items.slice(0, 5).map((item) => ({ representative: item, related: [] }))
  }

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

// ─── 소스 ───────────────────────────────────────────────
export type NewsPortal = 'naver' | 'daum' | 'google'
export type CommunitySource = 'dcinside' | 'fmkorea' | 'clien'
export type NewsSource = NewsPortal | CommunitySource

// ─── 카테고리 ────────────────────────────────────────────
export type NewsCategory =
  | '경제'
  | '사건사고'
  | '사회'
  | '정치'
  | '세계'
  | 'IT/과학'
  | '연예'
  | '스포츠'
  | '기타'

// ─── 탭 ─────────────────────────────────────────────────
export type TabType = 'trending' | 'latest' | 'search'

// ─── 뉴스 아이템 ─────────────────────────────────────────
export interface NewsItem {
  id: string
  title: string
  summary?: string
  url: string
  thumbnail?: string
  source: NewsPortal
  sourceName: string        // 언론사명 (예: "조선일보")
  category: NewsCategory
  publishedAt: string       // ISO 8601
  collectedAt: string       // ISO 8601
  commentCount?: number
  viewCount?: number
  // 화제뉴스 전용
  trendScore?: number       // 커뮤니티 반응 기반 점수
  communityMentions?: CommunityMention[]
  // 검색 전용
  relevanceScore?: number
}

// ─── 커뮤니티 언급 ───────────────────────────────────────
export interface CommunityMention {
  source: CommunitySource
  postTitle: string
  postUrl: string
  commentCount: number
  viewCount: number
  collectedAt: string
}

// ─── 클러스터 (동일 토픽 묶음) ──────────────────────────
export interface NewsCluster {
  id: string
  representative: NewsItem   // 대표 기사
  related: NewsItem[]        // 관련 기사들
  topic: string              // 공통 키워드
}

// ─── API 응답 ─────────────────────────────────────────────
export interface NewsResponse {
  items: NewsItem[]
  total: number
  page: number
  hasMore: boolean
  updatedAt: string
}

export interface TrendingResponse {
  items: NewsItem[]
  updatedAt: string
}

export interface SearchResponse {
  clusters: NewsCluster[]
  total: number
  keyword: string
  suggestions: string[]    // 관련 키워드 추천
}

// ─── 크롤링 파라미터 ─────────────────────────────────────
export interface FetchNewsParams {
  category?: NewsCategory
  page?: number
  limit?: number
  sources?: NewsPortal[]
}

export interface SearchParams {
  keyword: string
  sort?: 'latest' | 'relevance'
  page?: number
  limit?: number
}

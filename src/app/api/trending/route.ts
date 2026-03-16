import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { getTrendingNews } from '@/lib/newsAggregator'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

// ─── 서버 인메모리 캐시 ───────────────────────────────────
const routeCache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL = 60 * 1000 // 60초

function getCached<T>(key: string): T | null {
  const entry = routeCache.get(key)
  if (!entry || Date.now() > entry.expiresAt) { routeCache.delete(key); return null }
  return entry.data as T
}
function setCached<T>(key: string, data: T) {
  routeCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL })
}

const DEFAULT_LIMIT = 20

function docToNewsItem(data: Record<string, unknown>): NewsItem {
  const { expiresAt: _e, summaryGeneratedAt: _s, ...rest } = data
  return rest as unknown as NewsItem
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10), 100)

  const cacheKey = `trending:${offset}:${limit}`
  const cached = getCached<object>(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } })

  try {
    const feedDoc = await db.collection('feeds').doc('trending').get()

    if (!feedDoc.exists) {
      console.log('[API/trending] feeds/trending 없음 → 직접 크롤링 폴백')
      const data = await getTrendingNews()
      return NextResponse.json(
        { items: data.items, hasMore: false, nextOffset: null, updatedAt: data.updatedAt },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
      )
    }

    const { ids, updatedAt } = feedDoc.data()!

    if (!Array.isArray(ids) || ids.length === 0) {
      console.log('[API/trending] feeds/trending IDs 없음 → 직접 크롤링 폴백')
      const data = await getTrendingNews()
      return NextResponse.json(
        { items: data.items, hasMore: false, nextOffset: null, updatedAt: data.updatedAt },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
      )
    }

    // offset ~ offset+limit 슬라이스
    const pageIds = ids.slice(offset, offset + limit)
    const hasMore = offset + limit < ids.length
    const nextOffset = hasMore ? offset + limit : null

    if (pageIds.length === 0) {
      return NextResponse.json(
        { items: [], hasMore: false, nextOffset: null, updatedAt },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
      )
    }

    // articles 컬렉션에서 해당 페이지 일괄 조회
    const articleRefs = pageIds.map((id: string) => db.collection('articles').doc(id))
    const articleDocs = await db.getAll(...articleRefs)

    // feeds/trending의 ID 순서 유지 (trendScore 순)
    const docMap = new Map(
      articleDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as Record<string, unknown>])
    )
    const items = pageIds
      .map((id: string) => docMap.get(id))
      .filter((data): data is Record<string, unknown> => !!data)
      .map(docToNewsItem)

    // 첫 페이지이고 결과가 없으면 직접 크롤링 폴백
    if (items.length === 0 && offset === 0) {
      console.log('[API/trending] articles 없음 → 직접 크롤링 폴백')
      const data = await getTrendingNews()
      return NextResponse.json(
        { items: data.items, hasMore: false, nextOffset: null, updatedAt: data.updatedAt },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
      )
    }

    const responseData = { items, hasMore, nextOffset, updatedAt }
    setCached(cacheKey, responseData)

    return NextResponse.json(
      responseData,
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
    )
  } catch (err) {
    console.error('[API/trending]', err)
    if (offset === 0) {
      try {
        const data = await getTrendingNews()
        return NextResponse.json(
          { items: data.items, hasMore: false, nextOffset: null, updatedAt: data.updatedAt }
        )
      } catch { /* fall through */ }
    }
    return NextResponse.json(
      { error: '뉴스 수집 실패', items: [], hasMore: false, nextOffset: null, updatedAt: new Date().toISOString() },
      { status: 500 }
    )
  }
}

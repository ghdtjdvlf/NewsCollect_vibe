import { NextRequest, NextResponse } from 'next/server'
import { getLatestNews } from '@/lib/newsAggregator'
import { db } from '@/lib/firebase'
import type { NewsCategory, NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

const CACHE_TTL = 5 * 60 * 1000 // 5분

function paginate(items: NewsItem[], page: number, limit: number) {
  const total = items.length
  const start = (page - 1) * limit
  return { items: items.slice(start, start + limit), total, page, hasMore: start + limit < total }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') as NewsCategory | null
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '10', 10)

  // 1. Firebase 캐시 확인
  try {
    // category 있으면 카테고리 전용 문서 우선 조회 (데이터 1/8 수준)
    const docId = category ? `latest_${category.replace(/\//g, '_')}` : 'latest'
    const doc = await db.collection('news_cache').doc(docId).get()

    if (doc.exists) {
      const data = doc.data()!
      const age = Date.now() - new Date(data.updatedAt as string).getTime()
      console.log(`[API/latest] Firebase 캐시(${docId}) 나이: ${Math.round(age / 1000)}초`)

      if (age < CACHE_TTL) {
        // 카테고리 전용 문서는 이미 필터된 상태이므로 추가 JS 필터 불필요
        const { items, total, hasMore } = paginate(data.items ?? [], page, limit)
        return NextResponse.json(
          { items, total, page, hasMore, updatedAt: data.updatedAt },
          { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
        )
      }
      console.log(`[API/latest] Firebase 캐시(${docId}) 만료 → 크롤링`)

    } else if (category) {
      // 카테고리 전용 문서 없음 → latest 전체 문서에서 폴백 (batch 최초 실행 전 상황)
      console.log(`[API/latest] ${docId} 없음 → latest 전체 폴백`)
      const fallback = await db.collection('news_cache').doc('latest').get()

      if (fallback.exists) {
        const data = fallback.data()!
        const age = Date.now() - new Date(data.updatedAt as string).getTime()
        if (age < CACHE_TTL) {
          const filtered = (data.items as NewsItem[] ?? []).filter((item) => item.category === category)
          const { items, total, hasMore } = paginate(filtered, page, limit)
          return NextResponse.json(
            { items, total, page, hasMore, updatedAt: data.updatedAt },
            { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
          )
        }
      }
      console.log('[API/latest] latest 전체 캐시도 없음 → 크롤링')

    } else {
      console.log('[API/latest] Firebase 캐시 없음 → 크롤링')
    }
  } catch (err) {
    console.error('[API/latest] Firebase 조회 실패, 직접 크롤링으로 폴백:', err)
  }

  // 2. 폴백: 직접 크롤링
  try {
    const data = await getLatestNews(category ?? undefined, page, limit)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    })
  } catch (err) {
    console.error('[API/latest]', err)
    return NextResponse.json(
      { error: '뉴스 수집 실패', items: [], total: 0, page, hasMore: false, updatedAt: new Date().toISOString() },
      { status: 500 }
    )
  }
}

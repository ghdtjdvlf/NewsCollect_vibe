import { NextRequest, NextResponse } from 'next/server'
import { getLatestNews } from '@/lib/newsAggregator'
import { db } from '@/lib/firebase'
import type { NewsCategory, NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 25 // Netlify 함수 타임아웃 (초)

const CACHE_TTL = 5 * 60 * 1000 // 5분 (batch 주기와 동기화)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') as NewsCategory | null
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '10', 10)

  // 1. Firebase 캐시 확인 (배치가 저장한 데이터)
  try {
    const doc = await db.collection('news_cache').doc('latest').get()
    if (doc.exists) {
      const data = doc.data()!
      const age = Date.now() - new Date(data.updatedAt).getTime()
      console.log(`[API/latest] Firebase 캐시 나이: ${Math.round(age / 1000)}초, updatedAt: ${data.updatedAt}`)
      if (age < CACHE_TTL) {
        let items: NewsItem[] = data.items ?? []
        if (category) items = items.filter((item: NewsItem) => item.category === category)
        const total = items.length
        const start = (page - 1) * limit
        const pageItems = items.slice(start, start + limit)
        return NextResponse.json(
          { items: pageItems, total, page, hasMore: start + limit < total, updatedAt: data.updatedAt },
          { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
        )
      }
      console.log('[API/latest] Firebase 캐시 만료 → 직접 크롤링')
    } else {
      console.log('[API/latest] Firebase 캐시 없음 → 직접 크롤링')
    }
  } catch (err) {
    console.error('[API/latest] Firebase 조회 실패, 직접 크롤링으로 폴백:', err)
  }

  // 2. 폴백: 직접 크롤링 (배치 미실행 or 캐시 만료 시)
  try {
    const data = await getLatestNews(category ?? undefined, page, limit)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    })
  } catch (err) {
    console.error('[API/latest]', err)
    return NextResponse.json(
      {
        error: '뉴스 수집 실패',
        items: [],
        total: 0,
        page,
        hasMore: false,
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

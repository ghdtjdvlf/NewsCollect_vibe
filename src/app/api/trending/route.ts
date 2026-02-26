import { NextResponse } from 'next/server'
import { getTrendingNews } from '@/lib/newsAggregator'
import { db } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

const CACHE_TTL = 5 * 60 * 1000 // 5분 (batch 주기와 동기화)

export async function GET() {
  // 1. Firebase 캐시 확인 (배치가 저장한 데이터)
  try {
    const doc = await db.collection('news_cache').doc('trending').get()
    if (doc.exists) {
      const data = doc.data()!
      const age = Date.now() - new Date(data.updatedAt).getTime()
      console.log(`[API/trending] Firebase 캐시 나이: ${Math.round(age / 1000)}초, updatedAt: ${data.updatedAt}`)
      if (age < CACHE_TTL) {
        return NextResponse.json(
          { items: data.items, updatedAt: data.updatedAt },
          { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
        )
      }
      console.log('[API/trending] Firebase 캐시 만료 → 직접 크롤링')
    } else {
      console.log('[API/trending] Firebase 캐시 없음 → 직접 크롤링')
    }
  } catch (err) {
    console.error('[API/trending] Firebase 조회 실패, 직접 크롤링으로 폴백:', err)
  }

  // 2. 폴백: 직접 크롤링 (배치 미실행 or 캐시 만료 시)
  try {
    const data = await getTrendingNews()
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    })
  } catch (err) {
    console.error('[API/trending]', err)
    return NextResponse.json(
      { error: '뉴스 수집 실패', items: [], updatedAt: new Date().toISOString() },
      { status: 500 }
    )
  }
}

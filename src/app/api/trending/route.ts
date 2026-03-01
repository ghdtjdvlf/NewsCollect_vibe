import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { getTrendingNews } from '@/lib/newsAggregator'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

function docToNewsItem(data: Record<string, unknown>): NewsItem {
  const { expiresAt: _e, summaryGeneratedAt: _s, ...rest } = data
  return rest as unknown as NewsItem
}

export async function GET() {
  try {
    const feedDoc = await db.collection('feeds').doc('trending').get()

    if (!feedDoc.exists) {
      console.log('[API/trending] feeds/trending 없음 → 직접 크롤링 폴백')
      const data = await getTrendingNews()
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
      })
    }

    const { ids, updatedAt } = feedDoc.data()!

    if (!Array.isArray(ids) || ids.length === 0) {
      console.log('[API/trending] feeds/trending IDs 없음 → 직접 크롤링 폴백')
      const data = await getTrendingNews()
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
      })
    }

    // articles 컬렉션에서 일괄 조회
    const articleRefs = ids.map((id: string) => db.collection('articles').doc(id))
    const articleDocs = await db.getAll(...articleRefs)

    // feeds/trending의 ID 순서 유지 (trendScore 순)
    const docMap = new Map(
      articleDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as Record<string, unknown>])
    )
    const items = ids
      .map((id: string) => docMap.get(id))
      .filter((data): data is Record<string, unknown> => !!data)
      .map(docToNewsItem)

    // articles가 아직 비어있으면 직접 크롤링 폴백
    if (items.length === 0) {
      console.log('[API/trending] articles 없음 → 직접 크롤링 폴백')
      const data = await getTrendingNews()
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
      })
    }

    return NextResponse.json(
      { items, updatedAt },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
    )
  } catch (err) {
    console.error('[API/trending]', err)
    // 최후 폴백: 직접 크롤링
    try {
      const data = await getTrendingNews()
      return NextResponse.json(data)
    } catch {
      return NextResponse.json(
        { error: '뉴스 수집 실패', items: [], updatedAt: new Date().toISOString() },
        { status: 500 }
      )
    }
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { getLatestNews } from '@/lib/newsAggregator'
import type { NewsItem, NewsCategory } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

const DEFAULT_LIMIT = 20

function docToNewsItem(data: Record<string, unknown>): NewsItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { expiresAt, summaryGeneratedAt, ...rest } = data
  return rest as NewsItem
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') as NewsCategory | null
  const cursor = searchParams.get('cursor') // 마지막 기사의 publishedAt ISO string
  const limit = Math.min(parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10), 50)

  try {
    const articlesCol = db.collection('articles')

    // category 필터 + publishedAt desc 정렬
    // 주의: category 필터 사용 시 Firebase 콘솔에서 복합 인덱스 필요
    // (category ASC, publishedAt DESC) — 첫 쿼리 실패 시 에러 메시지의 링크로 생성
    let q = category
      ? articlesCol.where('category', '==', category).orderBy('publishedAt', 'desc')
      : articlesCol.orderBy('publishedAt', 'desc')

    if (cursor) {
      q = q.startAfter(cursor)
    }

    // limit+1개 가져와서 다음 페이지 존재 여부 판단
    const snapshot = await q.limit(limit + 1).get()
    const docs = snapshot.docs
    const hasMore = docs.length > limit
    const items = docs
      .slice(0, limit)
      .map((doc) => docToNewsItem(doc.data() as Record<string, unknown>))

    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].publishedAt
      : null

    // articles가 아직 비어있으면 직접 크롤링 폴백 (첫 페이지만)
    if (items.length === 0 && !cursor) {
      console.log('[API/latest] articles 없음 → 직접 크롤링 폴백')
      const data = await getLatestNews(category ?? undefined, 1, limit)
      return NextResponse.json(
        { items: data.items, nextCursor: null, hasMore: false, updatedAt: new Date().toISOString() },
        { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' } }
      )
    }

    return NextResponse.json(
      { items, nextCursor, hasMore, updatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' } }
    )
  } catch (err) {
    console.error('[API/latest]', err)
    // 최후 폴백: 직접 크롤링 (첫 페이지만)
    if (!cursor) {
      try {
        console.log('[API/latest] 직접 크롤링 폴백')
        const data = await getLatestNews(category ?? undefined, 1, limit)
        return NextResponse.json({
          items: data.items,
          nextCursor: null,
          hasMore: false,
          updatedAt: new Date().toISOString(),
        })
      } catch (fallbackErr) {
        console.error('[API/latest] 폴백도 실패:', fallbackErr)
      }
    }
    return NextResponse.json(
      {
        error: '뉴스 수집 실패',
        items: [],
        nextCursor: null,
        hasMore: false,
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

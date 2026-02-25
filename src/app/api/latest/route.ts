import { NextRequest, NextResponse } from 'next/server'
import { getLatestNews } from '@/lib/newsAggregator'
import type { NewsCategory } from '@/types/news'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') as NewsCategory | null
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '10', 10)

  try {
    const data = await getLatestNews(category ?? undefined, page, limit)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
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

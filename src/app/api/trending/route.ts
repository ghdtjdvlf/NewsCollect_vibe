import { NextResponse } from 'next/server'
import { getTrendingNews } from '@/lib/newsAggregator'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await getTrendingNews()
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    })
  } catch (err) {
    console.error('[API/trending]', err)
    return NextResponse.json(
      { error: '뉴스 수집 실패', items: [], updatedAt: new Date().toISOString() },
      { status: 500 }
    )
  }
}

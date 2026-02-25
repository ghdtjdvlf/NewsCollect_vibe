import { NextRequest, NextResponse } from 'next/server'
import { searchNews } from '@/lib/newsAggregator'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const keyword = searchParams.get('keyword') ?? ''
  const sort = (searchParams.get('sort') ?? 'relevance') as 'latest' | 'relevance'
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '10', 10)

  if (!keyword.trim()) {
    return NextResponse.json({
      keyword,
      total: 0,
      clusters: [],
      suggestions: [],
    })
  }

  try {
    const data = await searchNews(keyword, sort, page, limit)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[API/search]', err)
    return NextResponse.json(
      { error: '검색 실패', keyword, total: 0, clusters: [], suggestions: [] },
      { status: 500 }
    )
  }
}

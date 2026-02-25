import { NextRequest, NextResponse } from 'next/server'
import { getCachedNewsItem } from '@/lib/newsAggregator'

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
  const item = getCachedNewsItem(params.id)
  if (!item) {
    return NextResponse.json({ error: '기사를 찾을 수 없습니다. 홈으로 돌아가 다시 시도해주세요.' }, { status: 404 })
  }
  return NextResponse.json(item, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
  })
}

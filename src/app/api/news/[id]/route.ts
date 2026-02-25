import { NextRequest, NextResponse } from 'next/server'
import type { NewsItem } from '@/types/news'

// 목 상세 데이터 — 실 크롤링 연동 전
const MOCK_DETAIL: Record<string, NewsItem> = {
  't1': {
    id: 't1',
    title: '코스피 2,600선 회복… 외국인 순매수 전환',
    summary: '코스피 지수가 외국인 투자자들의 순매수 전환에 힘입어 2,600선을 회복했습니다. 전문가들은 이번 반등이 단기적인 기술적 반등인지, 추세적 전환의 시작인지 분석하고 있습니다. 미국 연방준비제도(Fed)의 금리 인하 기대감과 반도체 업종의 실적 개선이 주요 상승 동인으로 꼽히고 있습니다.',
    url: 'https://news.naver.com',
    thumbnail: 'https://via.placeholder.com/800x400/eef2ff/6366f1?text=코스피+2600',
    source: 'naver',
    sourceName: '연합뉴스',
    category: '경제',
    publishedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    collectedAt: new Date().toISOString(),
    commentCount: 1243,
    trendScore: 98,
  },
}

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
  const item = MOCK_DETAIL[params.id]
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(item, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
  })
}

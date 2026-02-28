import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { getTrendingNews, getLatestNews } from '@/lib/newsAggregator'
import type { NewsItem, NewsCategory } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 25 // Netlify 함수 실제 타임아웃 기준

// ─── 카테고리별 latest 문서 저장 ──────────────────────────
async function saveCategoryDocs(items: NewsItem[], updatedAt: string): Promise<void> {
  const groups = new Map<NewsCategory, NewsItem[]>()
  for (const item of items) {
    const arr = groups.get(item.category) ?? []
    arr.push(item)
    groups.set(item.category, arr)
  }

  await Promise.all(
    [...groups.entries()].map(([cat, catItems]) =>
      db.collection('news_cache').doc(`latest_${cat}`).set({ items: catItems, updatedAt })
    )
  )
}

// ─── POST 핸들러 ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    console.warn('[batch] 인증 실패 — CRON_SECRET 불일치')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const batchStart = Date.now()
    console.log('[batch] 시작', new Date().toISOString())

    // 뉴스 수집 (enrichWithMeta/Gemini 제거 — Netlify 10초 타임아웃 방지)
    const [trendingData, latestData] = await Promise.all([
      getTrendingNews(),
      getLatestNews(undefined, 1, 100),
    ])
    console.log(`[batch] 크롤링 완료 trending=${trendingData.items.length} latest=${latestData.items.length} elapsed=${Date.now() - batchStart}ms`)

    const allItems = [...trendingData.items, ...latestData.items]
    const uniqueItems = Array.from(
      new Map(allItems.map((item) => [item.id, item])).values()
    )

    if (uniqueItems.length === 0) {
      console.warn('[batch] 수집된 기사 없음 — 크롤러 전체 실패')
      return NextResponse.json({ message: '수집된 기사 없음 (크롤러 실패)', total: 0, errors: [] })
    }

    // news_cache 저장 (요약 없이 빠르게)
    const updatedAt = new Date().toISOString()
    await Promise.all([
      db.collection('news_cache').doc('trending').set({ items: trendingData.items, updatedAt }),
      db.collection('news_cache').doc('latest').set({ items: latestData.items, updatedAt }),
      saveCategoryDocs(latestData.items, updatedAt),
    ])
    const elapsed = Date.now() - batchStart
    console.log(`[batch] news_cache 저장 완료 elapsed=${elapsed}ms (trending:${trendingData.items.length} latest:${latestData.items.length})`)

    return NextResponse.json({
      message: '뉴스 캐시 갱신 완료',
      total: uniqueItems.length,
      elapsedMs: elapsed,
    })
  } catch (err) {
    console.error('[batch] 오류:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '배치 처리 실패' },
      { status: 500 }
    )
  }
}

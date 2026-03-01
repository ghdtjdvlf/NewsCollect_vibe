import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { getTrendingNews, getLatestNews } from '@/lib/newsAggregator'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    console.warn('[batch] 인증 실패 — CRON_SECRET 불일치')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const batchStart = Date.now()
    console.log('[batch] 시작', new Date().toISOString())

    const [trendingData, latestData] = await Promise.all([
      getTrendingNews(),
      getLatestNews(undefined, 1, 100),
    ])
    console.log(`[batch] 크롤링 완료 trending=${trendingData.items.length} latest=${latestData.items.length} elapsed=${Date.now() - batchStart}ms`)

    const allItems = [...trendingData.items, ...latestData.items]
    const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values())

    if (uniqueItems.length === 0) {
      console.warn('[batch] 수집된 기사 없음')
      return NextResponse.json({ message: '수집된 기사 없음', total: 0 })
    }

    const articlesCol = db.collection('articles')

    // 기존 기사 확인 (이미 존재하는 기사는 summaryGeneratedAt 초기화 방지)
    const docRefs = uniqueItems.map((item) => articlesCol.doc(item.id))
    const existingDocs = await db.getAll(...docRefs).catch(() => [])
    const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id))

    // articles 저장 (500개 Firestore 배치 제한 준수)
    const CHUNK = 500
    for (let i = 0; i < uniqueItems.length; i += CHUNK) {
      const chunk = uniqueItems.slice(i, i + CHUNK)
      const batchWrite = db.batch()

      for (const item of chunk) {
        const expiresAt = new Date(item.publishedAt)
        expiresAt.setDate(expiresAt.getDate() + 4) // 4일 후 TTL

        const articleData: Record<string, unknown> = { ...item, expiresAt }

        // 신규 기사만 summaryGeneratedAt: null 초기화
        if (!existingIds.has(item.id)) {
          articleData.summaryGeneratedAt = null
        }

        batchWrite.set(articlesCol.doc(item.id), articleData, { merge: true })
      }

      await batchWrite.commit()
    }

    // feeds/trending: ID 목록만 저장 (트렌딩 순서 유지)
    await db.collection('feeds').doc('trending').set({
      ids: trendingData.items.map((item) => item.id),
      updatedAt: new Date().toISOString(),
    })

    const elapsed = Date.now() - batchStart
    console.log(`[batch] 완료 articles=${uniqueItems.length} elapsed=${elapsed}ms`)

    // 수집 완료 후 요약 배치 트리거 (fire-and-forget)
    const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_BASE_URL
    if (siteUrl) {
      fetch(`${siteUrl}/api/summarize-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET ?? '',
        },
      })
        .then(() => console.log('[batch] 요약 배치 트리거 완료'))
        .catch((e) => console.error('[batch] 요약 배치 트리거 실패:', e instanceof Error ? e.message : e))
    }

    return NextResponse.json({
      message: '수집 완료',
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

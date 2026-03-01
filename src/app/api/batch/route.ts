import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { getTrendingNews, getLatestNews } from '@/lib/newsAggregator'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

const BATCH_COOLDOWN_MS = 3 * 60 * 1000 // 3분

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 쿨다운 체크
    const metaDoc = await db.collection('meta').doc('batch').get()
    const lastRun: number = metaDoc.exists ? (metaDoc.data()?.lastRunAt ?? 0) : 0
    const elapsed = Date.now() - lastRun
    if (elapsed < BATCH_COOLDOWN_MS) {
      const waitSec = Math.ceil((BATCH_COOLDOWN_MS - elapsed) / 1000)
      console.log(`크롤링까지 ${waitSec}초`)
      return NextResponse.json({ message: `쿨다운 중 (${waitSec}초 후 재실행)`, total: 0 })
    }

    await db.collection('meta').doc('batch').set({ lastRunAt: Date.now() })

    console.log('크롤링 시작')

    const [trendingData, latestData] = await Promise.all([
      getTrendingNews(),
      getLatestNews(undefined, 1, 100),
    ])

    const allItems = [...trendingData.items, ...latestData.items]
    const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values())

    console.log(`크롤링 완료 — ${uniqueItems.length}개`)

    if (uniqueItems.length === 0) {
      return NextResponse.json({ message: '수집된 기사 없음', total: 0 })
    }

    const articlesCol = db.collection('articles')

    const docRefs = uniqueItems.map((item) => articlesCol.doc(item.id))
    const existingDocs = await db.getAll(...docRefs).catch(() => [])
    const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id))
    const newCount = uniqueItems.filter((item) => !existingIds.has(item.id)).length

    const CHUNK = 500
    for (let i = 0; i < uniqueItems.length; i += CHUNK) {
      const chunk = uniqueItems.slice(i, i + CHUNK)
      const batchWrite = db.batch()

      for (const item of chunk) {
        const expiresAt = new Date(item.publishedAt)
        expiresAt.setDate(expiresAt.getDate() + 4)

        const articleData: Record<string, unknown> = { ...item, expiresAt }

        if (!existingIds.has(item.id)) {
          articleData.summaryGeneratedAt = null
        }

        batchWrite.set(articlesCol.doc(item.id), articleData, { merge: true })
      }

      await batchWrite.commit()
    }

    await db.collection('feeds').doc('trending').set({
      ids: trendingData.items.map((item) => item.id),
      updatedAt: new Date().toISOString(),
    })

    console.log(`데이터 저장 완료 — 신규 ${newCount}개 / 전체 ${uniqueItems.length}개`)

    // 요약 배치 트리거 (fire-and-forget)
    const siteUrl = (() => {
      try { return new URL(req.url).origin } catch { return null }
    })() ?? process.env.URL ?? process.env.NEXT_PUBLIC_BASE_URL
    if (siteUrl) {
      fetch(`${siteUrl}/api/summarize-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET ?? '',
        },
      }).catch(() => {})
    }

    return NextResponse.json({ message: '수집 완료', total: uniqueItems.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '배치 처리 실패' },
      { status: 500 }
    )
  }
}

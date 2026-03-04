import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { summarizeItems } from '@/lib/summarizer'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 30
const MIN_INTERVAL_MS = 50 * 1000 // 50초 쿨다운

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY 없음' }, { status: 503 })
  }

  try {
    // 50초 쿨다운
    const metaDoc = await db.collection('meta').doc('summarize').get()
    const lastRun: number = metaDoc.exists ? (metaDoc.data()?.lastRunAt ?? 0) : 0
    if (Date.now() - lastRun < MIN_INTERVAL_MS) {
      return NextResponse.json({ message: '쿨다운 중', newlySummarized: 0 })
    }

    const articlesCol = db.collection('articles')

    // 미요약 기사 조회 (batch 인라인 요약에서 누락된 catch-up 대상)
    const snapshot = await articlesCol
      .where('summaryGeneratedAt', '==', null)
      .limit(MAX_PER_RUN)
      .get()

    if (snapshot.empty) {
      return NextResponse.json({ message: '미요약 기사 없음', newlySummarized: 0 })
    }

    const items = snapshot.docs.map((doc) => {
      const { expiresAt: _e, summaryGeneratedAt: _s, ...data } = doc.data()
      return data as NewsItem
    })

    console.log(`[catch-up] 요약 시작 — ${items.length}개`)
    await db.collection('meta').doc('summarize').set({ lastRunAt: Date.now() })

    const summaryMap = await summarizeItems(items, apiKey)

    if (summaryMap.size > 0) {
      const batchWrite = db.batch()
      const now = new Date()
      for (const [id, summary] of summaryMap.entries()) {
        batchWrite.update(articlesCol.doc(id), {
          summaryLines: summary.lines,
          conclusion: summary.conclusion,
          summaryGeneratedAt: now,
        })
      }
      await batchWrite.commit()
      console.log(`[catch-up] 요약 저장 완료 — ${summaryMap.size}개`)
    }

    return NextResponse.json({ message: '요약 완료', newlySummarized: summaryMap.size })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '오류 발생' },
      { status: 500 }
    )
  }
}

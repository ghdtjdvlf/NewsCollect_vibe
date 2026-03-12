import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { SummarizerAgent } from '@/lib/agents/summarizerAgent'
import { setBatchRunning, getBatchScheduleFromStore } from '@/lib/agents/agentLogger'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const { isRunning } = await getBatchScheduleFromStore()
  if (isRunning) {
    return NextResponse.json({ error: '배치가 실행 중입니다' }, { status: 409 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY 없음' }, { status: 500 })
  }

  // Firestore에서 미요약 기사 로드 (최대 100개씩 처리)
  const MAX_PER_RUN = 100
  let items: NewsItem[]
  try {
    const snapshot = await db.collection('articles')
      .where('summaryGeneratedAt', '==', null)
      .limit(MAX_PER_RUN)
      .get()
    items = snapshot.docs.map((d) => d.data() as NewsItem)
    console.log(`[summarize] 미요약 기사 ${items.length}개 로드`)
  } catch (err) {
    return NextResponse.json({ error: `Firestore 읽기 실패: ${(err as Error).message}` }, { status: 500 })
  }

  if (items.length === 0) {
    return NextResponse.json({ summarized: 0, total: 0, message: '요약할 기사 없음' })
  }

  await setBatchRunning(true)
  try {
    const summarizer = new SummarizerAgent()
    const result = await summarizer.run({ items, apiKey })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    const { summaryMap } = result.data
    const now = new Date()

    // 요약 결과를 Firestore에 일괄 업데이트
    const CHUNK = 500
    const entries = [...summaryMap.entries()]
    for (let i = 0; i < entries.length; i += CHUNK) {
      const batch = db.batch()
      for (const [id, summary] of entries.slice(i, i + CHUNK)) {
        batch.update(db.collection('articles').doc(id), {
          summaryLines: summary.lines,
          conclusion: summary.conclusion,
          summaryGeneratedAt: now,
        })
      }
      await batch.commit()
    }

    console.log(`[summarize] 완료 — ${summaryMap.size}/${items.length}개 저장`)
    return NextResponse.json({ summarized: summaryMap.size, total: items.length })
  } finally {
    await setBatchRunning(false)
  }
}

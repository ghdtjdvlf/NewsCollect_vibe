import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { db } from '@/lib/firebase'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 30
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MIN_INTERVAL_MS = 50 * 1000 // 50초 쿨다운

type SummaryData = { lines: string[]; conclusion: string }

async function summarizeBatch(
  items: NewsItem[],
  groq: Groq
): Promise<Map<string, SummaryData>> {
  const prompt = `다음 뉴스들을 각각 3줄(음슴체)로 요약하고 결론을 추가해줘.
어려운 말은 쉽게 바꾸고 핵심만 담아줘.

${items.map((item, i) => `[${i + 1}] 제목: ${item.title}\n내용: ${(item.summary ?? '').slice(0, 300)}`).join('\n\n')}

출력 형식 (번호와 줄바꿈만 사용, 다른 설명 없이):
[1]
줄1
줄2
줄3
결론: 비유내용

[2]
줄1
줄2
줄3
결론: 비유내용`

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 4096,
  })

  const text = completion.choices[0]?.message?.content ?? ''

  const resultMap = new Map<string, SummaryData>()
  const blocks = text.split(/\[(\d+)\]/).filter((s) => s.trim())

  for (let i = 0; i < blocks.length - 1; i += 2) {
    const idx = parseInt(blocks[i]) - 1
    const content = blocks[i + 1].trim()
    if (idx < 0 || idx >= items.length) continue

    const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const conclusionLine = lines.find((l) => l.startsWith('결론'))
    const conclusion = conclusionLine
      ? conclusionLine.replace(/^결론\s*[:：]\s*/, '').trim()
      : ''
    const summaryLines = lines.filter((l) => !l.startsWith('결론')).slice(0, 3)

    if (summaryLines.length > 0) {
      resultMap.set(items[idx].id, { lines: summaryLines, conclusion })
    }
  }

  return resultMap
}

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
    const metaData = metaDoc.exists ? (metaDoc.data() ?? {}) : {}
    const lastRun: number = metaData.lastRunAt ?? 0
    const elapsed = Date.now() - lastRun
    if (elapsed < MIN_INTERVAL_MS) {
      const waitSec = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000)
      console.log(`요약까지 ${waitSec}초`)
      return NextResponse.json({ message: '쿨다운 중', newlySummarized: 0 })
    }

    const articlesCol = db.collection('articles')

    // 전체 미요약 수
    const totalCountSnap = await articlesCol
      .where('summaryGeneratedAt', '==', null)
      .count()
      .get()
    const totalUnsummarized: number = totalCountSnap.data().count

    if (totalUnsummarized === 0) {
      return NextResponse.json({ message: '모든 기사 이미 요약됨', newlySummarized: 0 })
    }

    // 사이클 추적
    const prevCycleTotal: number = metaData.cycleTotal ?? 0
    const prevCycleDone: number = metaData.cycleDone ?? 0

    let cycleTotal: number
    let cycleDone: number

    if (prevCycleTotal === 0 || prevCycleDone >= prevCycleTotal) {
      cycleTotal = totalUnsummarized
      cycleDone = 0
    } else {
      cycleTotal = prevCycleTotal
      cycleDone = prevCycleDone
      const expectedRemaining = cycleTotal - cycleDone
      if (totalUnsummarized > expectedRemaining) {
        cycleTotal = cycleDone + totalUnsummarized
      }
    }

    const totalBatches = Math.ceil(cycleTotal / MAX_PER_RUN)
    const currentBatch = Math.floor(cycleDone / MAX_PER_RUN) + 1

    // 미요약 기사 조회
    const snapshot = await articlesCol
      .orderBy('publishedAt', 'desc')
      .limit(MAX_PER_RUN * 3)
      .get()

    const allItems = snapshot.docs.map((doc) => {
      const { expiresAt: _e, ...data } = doc.data()
      return data as NewsItem & { summaryGeneratedAt: unknown }
    })

    const itemsToSummarize = allItems
      .filter((item) => item.summaryGeneratedAt === null)
      .slice(0, MAX_PER_RUN)

    if (itemsToSummarize.length === 0) {
      return NextResponse.json({ message: '모든 기사 이미 요약됨', newlySummarized: 0 })
    }

    console.log(`요약 시작 ${currentBatch}/${totalBatches}`)

    await db.collection('meta').doc('summarize').set({
      lastRunAt: Date.now(),
      cycleTotal,
      cycleDone,
    })

    const groq = new Groq({ apiKey })
    const summaryMap = await summarizeBatch(itemsToSummarize, groq)

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

      const newCycleDone = cycleDone + summaryMap.size
      const isLastBatch = newCycleDone >= cycleTotal

      if (isLastBatch) {
        console.log(`요약 완료 ${currentBatch}/${totalBatches}`)
      } else {
        console.log(`요약 ${currentBatch}/${totalBatches}`)
      }
      console.log(`요약 데이터 저장 완료 — ${newCycleDone}/${cycleTotal}개`)

      await db.collection('meta').doc('summarize').update({ cycleDone: newCycleDone })
    }

    return NextResponse.json({
      message: '요약 완료',
      newlySummarized: summaryMap.size,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '오류 발생' },
      { status: 500 }
    )
  }
}

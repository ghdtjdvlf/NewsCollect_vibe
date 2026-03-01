import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/lib/firebase'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 30
const GEMINI_MODEL = 'gemini-2.5-flash-lite'

type SummaryData = { lines: string[]; conclusion: string }

async function summarizeBatch(
  items: NewsItem[],
  genAI: GoogleGenerativeAI
): Promise<Map<string, SummaryData>> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

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

  const result = await model.generateContent(prompt)
  const text = result.response.text()

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
    console.warn('[summarize-batch] 인증 실패')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_API_KEY 없음' }, { status: 503 })
  }

  const start = Date.now()
  console.log('[summarize-batch] 시작', new Date().toISOString())

  try {
    const articlesCol = db.collection('articles')

    // 최신 기사 조회 후 미요약 필터 (summaryGeneratedAt === null)
    const snapshot = await articlesCol
      .orderBy('publishedAt', 'desc')
      .limit(MAX_PER_RUN * 3)
      .get()

    const allItems = snapshot.docs.map((doc) => {
      const { expiresAt, ...data } = doc.data()
      return data as NewsItem & { summaryGeneratedAt: unknown }
    })

    const itemsToSummarize = allItems
      .filter((item) => item.summaryGeneratedAt === null)
      .slice(0, MAX_PER_RUN)

    console.log(`[summarize-batch] 미요약 ${itemsToSummarize.length}개 / 조회 ${allItems.length}개 elapsed=${Date.now() - start}ms`)

    if (itemsToSummarize.length === 0) {
      return NextResponse.json({ message: '모든 기사 이미 요약됨', newlySummarized: 0 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const summaryMap = await summarizeBatch(itemsToSummarize, genAI)
    console.log(`[summarize-batch] Gemini 완료 ${summaryMap.size}개 elapsed=${Date.now() - start}ms`)

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
      console.log(`[summarize-batch] articles 업데이트 완료 elapsed=${Date.now() - start}ms`)
    }

    return NextResponse.json({
      message: '요약 완료',
      newlySummarized: summaryMap.size,
      elapsedMs: Date.now() - start,
    })
  } catch (err) {
    console.error('[summarize-batch] 오류:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '오류 발생' },
      { status: 500 }
    )
  }
}

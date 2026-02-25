import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/lib/firebase'
import { getTrendingNews, getLatestNews } from '@/lib/newsAggregator'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_SIZE = 20 // 한 번에 요약할 기사 수

// 20건씩 묶어서 Gemini에 한 번에 요약 요청
async function summarizeBatch(
  items: NewsItem[],
  genAI: GoogleGenerativeAI
): Promise<Map<string, { lines: string[]; conclusion: string }>> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `다음 뉴스들을 각각 3줄(음슴체)로 요약하고 결론을 추가해줘.
어려운 말은 쉽게 바꾸고 핵심만 담아줘.

${items.map((item, i) => `[${i + 1}] 제목: ${item.title}\n내용: ${item.summary ?? ''}`).join('\n\n')}

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

  const resultMap = new Map<string, { lines: string[]; conclusion: string }>()

  // [1], [2] ... 단위로 분리
  const blocks = text.split(/\[(\d+)\]/).filter((s) => s.trim())

  for (let i = 0; i < blocks.length - 1; i += 2) {
    const idx = parseInt(blocks[i]) - 1
    const content = blocks[i + 1].trim()
    if (idx < 0 || idx >= items.length) continue

    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

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
  // CRON_SECRET으로 무단 호출 방지
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_API_KEY 없음' }, { status: 503 })
  }

  try {
    // 1. 뉴스 수집
    const [trendingData, latestData] = await Promise.all([
      getTrendingNews(),
      getLatestNews(undefined, 1, 50),
    ])

    const allItems = [
      ...trendingData.items,
      ...latestData.items,
    ]

    // 중복 제거 (id 기준)
    const uniqueItems = Array.from(
      new Map(allItems.map((item) => [item.id, item])).values()
    )

    // 2. 이미 요약된 기사 필터링 (getAll로 정확하게 확인)
    const summaryCol = db.collection('summaries')
    const docRefs = uniqueItems.map((item) => summaryCol.doc(item.id))
    const existingDocs = await db.getAll(...docRefs).catch(() => [])
    const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id))
    const newItems = uniqueItems.filter((item) => !existingIds.has(item.id))

    if (newItems.length === 0) {
      return NextResponse.json({ message: '새 기사 없음', skipped: uniqueItems.length })
    }

    // 3. BATCH_SIZE씩 나눠서 Gemini 요약
    const genAI = new GoogleGenerativeAI(apiKey)
    const chunks: NewsItem[][] = []
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      chunks.push(newItems.slice(i, i + BATCH_SIZE))
    }

    let totalSaved = 0
    const errors: string[] = []

    for (const chunk of chunks) {
      try {
        // 503 에러 시 10초 후 1회 재시도
        let resultMap: Map<string, { lines: string[]; conclusion: string }>
        try {
          resultMap = await summarizeBatch(chunk, genAI)
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (msg.includes('503')) {
            await new Promise((r) => setTimeout(r, 10000))
            resultMap = await summarizeBatch(chunk, genAI)
          } else {
            throw e
          }
        }

        // 4. Firestore 저장 (batch write)
        const batch = db.batch()
        for (const [id, summary] of resultMap.entries()) {
          const item = chunk.find((i) => i.id === id)
          if (!item) continue
          batch.set(summaryCol.doc(id), {
            lines: summary.lines,
            conclusion: summary.conclusion,
            title: item.title,
            generatedAt: new Date(),
            source: item.sourceName ?? '',
          })
          totalSaved++
        }
        await batch.commit()

        // RPM 초과 방지: 청크 사이 2초 대기
        if (chunks.indexOf(chunk) < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, 2000))
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : '청크 처리 실패')
      }
    }

    return NextResponse.json({
      message: '배치 요약 완료',
      total: uniqueItems.length,
      newItems: newItems.length,
      saved: totalSaved,
      errors,
    })
  } catch (err) {
    console.error('[API/batch]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '배치 처리 실패' },
      { status: 500 }
    )
  }
}

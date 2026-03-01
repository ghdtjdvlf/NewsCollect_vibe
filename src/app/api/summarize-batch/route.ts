import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/lib/firebase'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 30 // Netlify 함수 타임아웃 내 처리 가능한 최대치
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

function embedSummaries(items: NewsItem[], summaryMap: Map<string, SummaryData>): NewsItem[] {
  return items.map((item) => {
    const s = summaryMap.get(item.id)
    if (!s) return item
    return { ...item, summaryLines: s.lines, conclusion: s.conclusion }
  })
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
    // 1. news_cache 읽기 (batch-cron이 저장한 최신 뉴스)
    const [trendingDoc, latestDoc] = await Promise.all([
      db.collection('news_cache').doc('trending').get(),
      db.collection('news_cache').doc('latest').get(),
    ])

    if (!trendingDoc.exists && !latestDoc.exists) {
      console.log('[summarize-batch] news_cache 없음 → 크롤링 대기')
      return NextResponse.json({ message: 'news_cache 없음, 크롤링 먼저 필요' })
    }

    const trendingItems: NewsItem[] = (trendingDoc.data()?.items ?? []) as NewsItem[]
    const latestItems: NewsItem[] = (latestDoc.data()?.items ?? []) as NewsItem[]
    const allItems = [...trendingItems, ...latestItems]
    const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values())

    console.log(`[summarize-batch] news_cache 로드 완료 ${uniqueItems.length}개 elapsed=${Date.now() - start}ms`)

    // 2. 이미 요약된 기사 확인
    const summaryCol = db.collection('summaries')
    const docRefs = uniqueItems.map((item) => summaryCol.doc(item.id))
    const existingDocs = docRefs.length > 0
      ? await db.getAll(...docRefs).catch(() => [])
      : []

    const existingSummaryMap = new Map<string, SummaryData>()
    for (const doc of existingDocs) {
      if (!doc.exists) continue
      const data = doc.data()!
      if (Array.isArray(data.lines) && data.lines.length > 0) {
        existingSummaryMap.set(doc.id, {
          lines: data.lines as string[],
          conclusion: (data.conclusion as string) ?? '',
        })
      }
    }

    const existingIds = new Set(existingSummaryMap.keys())
    const newItems = uniqueItems
      .filter((item) => !existingIds.has(item.id))
      .slice(0, MAX_PER_RUN)

    console.log(`[summarize-batch] 미요약 ${newItems.length}개 (전체 ${uniqueItems.length}개) elapsed=${Date.now() - start}ms`)

    let newSummaryMap = new Map<string, SummaryData>()

    if (newItems.length > 0) {
      // 3. Gemini 배치 요약 (신규 기사만)
      const genAI = new GoogleGenerativeAI(apiKey)
      newSummaryMap = await summarizeBatch(newItems, genAI)
      console.log(`[summarize-batch] Gemini 완료 ${newSummaryMap.size}개 elapsed=${Date.now() - start}ms`)

      // 4. summaries 컬렉션 저장
      if (newSummaryMap.size > 0) {
        const batchWrite = db.batch()
        for (const [id, summary] of newSummaryMap.entries()) {
          const item = newItems.find((i) => i.id === id)
          batchWrite.set(summaryCol.doc(id), {
            lines: summary.lines,
            conclusion: summary.conclusion,
            title: item?.title ?? '',
            generatedAt: new Date(),
            source: item?.sourceName ?? '',
          })
        }
        await batchWrite.commit()
        console.log(`[summarize-batch] summaries 저장 완료 elapsed=${Date.now() - start}ms`)
      }
    }

    // 5. news_cache 업데이트 (기존 + 신규 요약 embed)
    const fullSummaryMap = new Map([...existingSummaryMap, ...newSummaryMap])

    if (fullSummaryMap.size > 0) {
      const updatedAt = new Date().toISOString()
      const finalTrending = embedSummaries(trendingItems, fullSummaryMap)
      const finalLatest = embedSummaries(latestItems, fullSummaryMap)

      await Promise.all([
        db.collection('news_cache').doc('trending').set({ items: finalTrending, updatedAt }),
        db.collection('news_cache').doc('latest').set({ items: finalLatest, updatedAt }),
      ])
      console.log(`[summarize-batch] news_cache 업데이트 완료 elapsed=${Date.now() - start}ms`)
    }

    return NextResponse.json({
      message: newItems.length === 0 ? '모든 기사 이미 요약됨' : '요약 완료',
      total: uniqueItems.length,
      alreadySummarized: existingSummaryMap.size,
      newlySummarized: newSummaryMap.size,
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

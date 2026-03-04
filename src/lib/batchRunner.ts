import { db } from '@/lib/firebase'
import { getTrendingNews, getLatestNews } from '@/lib/newsAggregator'
import { summarizeItems } from '@/lib/summarizer'

const BATCH_COOLDOWN_MS = 3 * 60 * 1000

export interface BatchResult {
  message: string
  total: number
  summarized?: number
  toSummarize?: number
  existing?: number
  needsRetry?: number
}

export async function runBatch(options: { reset?: boolean } = {}): Promise<BatchResult> {
  const forceReset = options.reset === true

  // 쿨다운 체크
  const metaDoc = await db.collection('meta').doc('batch').get()
  const lastRun: number = metaDoc.exists ? (metaDoc.data()?.lastRunAt ?? 0) : 0
  const elapsed = Date.now() - lastRun
  if (!forceReset && elapsed < BATCH_COOLDOWN_MS) {
    const waitSec = Math.ceil((BATCH_COOLDOWN_MS - elapsed) / 1000)
    console.log(`[batch] 쿨다운 중 — ${waitSec}초 후 재실행`)
    return { message: `쿨다운 중 (${waitSec}초 후 재실행)`, total: 0 }
  }

  if (forceReset) console.log('[batch] 강제 초기화 후 실행')

  await db.collection('meta').doc('batch').set({ lastRunAt: Date.now() })

  console.log('[batch] 크롤링 시작')

  const [trendingData, latestData] = await Promise.all([
    getTrendingNews(),
    getLatestNews(undefined, 1, 100),
  ])

  const allItems = [...trendingData.items, ...latestData.items]
  const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values())

  console.log(`[batch] 크롤링 완료 — ${uniqueItems.length}개`)

  if (uniqueItems.length === 0) {
    return { message: '수집된 기사 없음', total: 0 }
  }

  const articlesCol = db.collection('articles')

  // 기존 기사 확인
  const docRefs = uniqueItems.map((item) => articlesCol.doc(item.id))
  const existingDocs = await db.getAll(...docRefs).catch(() => [])
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id))
  // summaryLines가 없는 기사는 모두 재시도
  // (summaryGeneratedAt이 null/undefined이거나, 있어도 summaryLines가 비어있는 경우)
  const needsSummaryInit = new Set(
    existingDocs
      .filter((d) => {
        if (!d.exists) return false
        const data = d.data()!
        return data.summaryGeneratedAt == null || !(data.summaryLines as unknown[])?.length
      })
      .map((d) => d.id)
  )

  const itemsToSummarize = uniqueItems
    .filter((item) => !existingIds.has(item.id) || needsSummaryInit.has(item.id))

  const newCount = uniqueItems.filter((item) => !existingIds.has(item.id)).length

  console.log(`[batch] 요약 대상 — 신규 ${newCount}개 + 미완료 ${needsSummaryInit.size}개 = ${itemsToSummarize.length}개`)

  // 요약 (저장 전 완료)
  let summaryMap = new Map<string, { lines: string[]; conclusion: string }>()
  let summaryError: string | undefined
  if (itemsToSummarize.length > 0 && process.env.GROQ_API_KEY) {
    try {
      console.log(`[batch] 요약 시작 — ${itemsToSummarize.length}개`)
      summaryMap = await summarizeItems(itemsToSummarize, process.env.GROQ_API_KEY)
      console.log(`[batch] 요약 완료 — ${summaryMap.size}/${itemsToSummarize.length}개`)
      if (summaryMap.size < itemsToSummarize.length) {
        console.warn(`[batch] 요약 누락 ${itemsToSummarize.length - summaryMap.size}개`)
      }
    } catch (err) {
      summaryError = err instanceof Error ? err.message : String(err)
      console.error('[batch] 요약 실패:', summaryError)
    }
  } else if (itemsToSummarize.length === 0) {
    console.log('[batch] 요약 대상 없음 — 전체 기존 기사')
  } else {
    summaryError = 'GROQ_API_KEY 없음'
    console.error('[batch] GROQ_API_KEY 미설정')
  }

  // Firestore 저장
  const now = new Date()
  const CHUNK = 500
  for (let i = 0; i < uniqueItems.length; i += CHUNK) {
    const chunk = uniqueItems.slice(i, i + CHUNK)
    const batchWrite = db.batch()

    for (const item of chunk) {
      const expiresAt = new Date(item.publishedAt)
      expiresAt.setDate(expiresAt.getDate() + 4)

      const articleData: Record<string, unknown> = { ...item, expiresAt }
      const isNew = !existingIds.has(item.id) || needsSummaryInit.has(item.id)

      if (isNew) {
        const summary = summaryMap.get(item.id)
        if (summary) {
          articleData.summaryLines = summary.lines
          articleData.conclusion = summary.conclusion
          articleData.summaryGeneratedAt = now
        } else {
          console.warn(`[batch] 요약 누락 id=${item.id} title="${item.title?.slice(0, 30)}"`)
          articleData.summaryGeneratedAt = null
        }
      }

      batchWrite.set(articlesCol.doc(item.id), articleData, { merge: true })
    }

    await batchWrite.commit()
  }

  await db.collection('feeds').doc('trending').set({
    ids: trendingData.items.map((item) => item.id),
    updatedAt: new Date().toISOString(),
  })

  console.log(`[batch] 저장 완료 — 신규 ${newCount}개 (요약 ${summaryMap.size}개) / 전체 ${uniqueItems.length}개`)

  return {
    message: '수집 완료',
    total: uniqueItems.length,
    existing: existingIds.size,
    needsRetry: needsSummaryInit.size,
    toSummarize: itemsToSummarize.length,
    summarized: summaryMap.size,
    ...(summaryError ? { summaryError } : {}),
  }
}

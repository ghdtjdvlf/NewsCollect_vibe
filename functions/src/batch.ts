import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from './lib/firebase'
import { getTrendingNews, getLatestNews } from './lib/newsAggregator'
import type { NewsItem, NewsCategory } from './types/news'

const BATCH_SIZE = 300
const META_CONCURRENCY = 10

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

type SummaryData = { lines: string[]; conclusion: string }

// ─── 기사 메타 fetch (og:image, og:description) ──────────
async function fetchArticleMeta(url: string): Promise<{ thumbnail: string | null; description: string | null }> {
  const EMPTY = { thumbnail: null, description: null }
  try {
    let parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return EMPTY

    if (parsed.hostname === 'news.google.com') {
      const redirectRes = await fetch(parsed.toString(), {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      })
      if (!redirectRes.ok) return EMPTY
      const finalUrl = new URL(redirectRes.url)
      if (finalUrl.hostname.includes('google.com')) return EMPTY
      parsed = finalUrl
    }

    const res = await fetch(parsed.toString(), {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })
    if (!res.ok) return EMPTY
    if (!(res.headers.get('content-type') ?? '').includes('html')) return EMPTY

    const reader = res.body?.getReader()
    if (!reader) return EMPTY

    let html = ''
    while (html.length < 30000) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      if (html.includes('</head>')) break
    }
    reader.cancel()

    const ogImage =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
      null

    const ogDesc =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ??
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      null

    let thumbnail: string | null = null
    if (ogImage) {
      try {
        const t = new URL(ogImage, parsed.origin).toString()
        const isGeneric =
          t.includes('og_image_default') ||
          t.includes('/static.news/image/news/ogtag/') ||
          t.includes('noimage') ||
          t.includes('no_image')
        thumbnail = isGeneric ? null : t
      } catch { /* noop */ }
    }

    const description = ogDesc
      ? ogDesc.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim()
      : null

    return { thumbnail, description }
  } catch {
    return EMPTY
  }
}

// ─── 썸네일/description 보강 ──────────────────────────────
async function enrichWithMeta(items: NewsItem[]): Promise<NewsItem[]> {
  const results = [...items]
  const targets = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !item.thumbnail || !item.summary)

  for (let i = 0; i < targets.length; i += META_CONCURRENCY) {
    const chunk = targets.slice(i, i + META_CONCURRENCY)
    const metas = await Promise.allSettled(chunk.map(({ item }) => fetchArticleMeta(item.url)))
    for (let j = 0; j < chunk.length; j++) {
      const { i: idx, item } = chunk[j]
      const settled = metas[j]
      const meta = settled.status === 'fulfilled' ? settled.value : { thumbnail: null, description: null }
      results[idx] = {
        ...item,
        thumbnail: item.thumbnail ?? meta.thumbnail ?? undefined,
        summary: item.summary ?? meta.description ?? undefined,
      }
    }
  }

  return results
}

// ─── Gemini 배치 요약 ─────────────────────────────────────
async function summarizeBatch(
  items: NewsItem[],
  genAI: GoogleGenerativeAI
): Promise<Map<string, SummaryData>> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite-001' })

  const prompt = `다음 뉴스들을 각각 3줄(음슴체)로 요약하고 결론을 추가해줘.
어려운 말은 쉽게 바꾸고 핵심만 담아줘.

${items.map((item, i) => `[${i + 1}] 제목: ${item.title}\n내용: ${item.summary ?? ''}`).join('\n\n')}

출력 형식 (번호와 줄바꿈만 사용, 다른 설명 없이):
[1]
줄1
줄2
줄3
결론:

[2]
줄1
줄2
줄3
결론: `

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  const resultMap = new Map<string, SummaryData>()
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

// ─── summaries embed ──────────────────────────────────────
function embedSummaries(items: NewsItem[], summaryMap: Map<string, SummaryData>): NewsItem[] {
  return items.map((item) => {
    const s = summaryMap.get(item.id)
    if (!s) return item
    return { ...item, summaryLines: s.lines, conclusion: s.conclusion }
  })
}

// ─── 오래된 summaries 정리 ────────────────────────────────
async function cleanupOldSummaries(): Promise<number> {
  try {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)

    const snapshot = await db.collection('summaries').where('generatedAt', '<', cutoff).get()
    if (snapshot.empty) return 0

    const docs = snapshot.docs
    for (let i = 0; i < docs.length; i += 499) {
      const deleteBatch = db.batch()
      docs.slice(i, i + 499).forEach((doc) => deleteBatch.delete(doc.ref))
      await deleteBatch.commit()
    }
    return docs.length
  } catch (err) {
    console.warn('[batch] summaries 정리 실패 (무시):', err)
    return 0
  }
}

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

// ─── summaries 컬렉션 배치 저장 ──────────────────────────
async function saveSummariesToFirestore(
  summaryMap: Map<string, SummaryData>,
  itemsById: Map<string, NewsItem>,
  updatedAt: string
): Promise<void> {
  if (summaryMap.size === 0) return

  const summaryCol = db.collection('summaries')
  const entries = [...summaryMap.entries()]

  for (let i = 0; i < entries.length; i += 499) {
    const batchWrite = db.batch()
    for (const [id, summary] of entries.slice(i, i + 499)) {
      const item = itemsById.get(id)
      batchWrite.set(summaryCol.doc(id), {
        lines: summary.lines,
        conclusion: summary.conclusion,
        title: item?.title ?? '',
        generatedAt: new Date(updatedAt),
        source: item?.sourceName ?? '',
      })
    }
    await batchWrite.commit()
  }
}

// ─── 메인 배치 실행 ───────────────────────────────────────
export async function runBatch(): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY 환경변수가 없습니다')
  }

  // 1. 뉴스 수집 + 메타 보강
  const [trendingData, latestData] = await Promise.all([
    getTrendingNews(),
    getLatestNews(undefined, 1, 200),
  ])
  const [enrichedTrending, enrichedLatest] = await Promise.all([
    enrichWithMeta(trendingData.items),
    enrichWithMeta(latestData.items),
  ])

  // 2. 기존 summaries 조회
  const allItems = [...enrichedTrending, ...enrichedLatest]
  const uniqueItems = Array.from(
    new Map(allItems.map((item) => [item.id, item])).values()
  )
  const itemsById = new Map(uniqueItems.map((item) => [item.id, item]))

  const summaryCol = db.collection('summaries')
  const docRefs = uniqueItems.map((item) => summaryCol.doc(item.id))
  const existingDocs = await db.getAll(...docRefs).catch(() => [])

  const existingSummaryMap = new Map<string, SummaryData>()
  for (const doc of existingDocs) {
    if (!doc.exists) continue
    const data = doc.data()
    if (Array.isArray(data?.lines) && data.lines.length > 0) {
      existingSummaryMap.set(doc.id, {
        lines: data.lines as string[],
        conclusion: (data.conclusion as string) ?? '',
      })
    }
  }

  // 3. Gemini 배치 요약 (신규 기사만)
  const existingIds = new Set(existingSummaryMap.keys())
  const newItems = uniqueItems.filter((item) => !existingIds.has(item.id))

  const newSummaryMap = new Map<string, SummaryData>()
  const errors: string[] = []

  if (newItems.length > 0) {
    const genAI = new GoogleGenerativeAI(apiKey)
    const chunks: NewsItem[][] = []
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      chunks.push(newItems.slice(i, i + BATCH_SIZE))
    }

    for (const chunk of chunks) {
      try {
        let resultMap: Map<string, SummaryData>
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

        for (const [id, summary] of resultMap.entries()) {
          newSummaryMap.set(id, summary)
        }

        if (chunks.indexOf(chunk) < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, 2000))
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : '청크 처리 실패')
      }
    }
  }

  // 4. summaries embed + Firestore 저장
  const batchUpdatedAt = new Date().toISOString()

  const fullSummaryMap = new Map<string, SummaryData>([
    ...existingSummaryMap,
    ...newSummaryMap,
  ])

  const finalTrending = embedSummaries(enrichedTrending, fullSummaryMap)
  const finalLatest = embedSummaries(enrichedLatest, fullSummaryMap)

  await Promise.all([
    db.collection('news_cache').doc('trending').set({ items: finalTrending, updatedAt: batchUpdatedAt }),
    db.collection('news_cache').doc('latest').set({ items: finalLatest, updatedAt: batchUpdatedAt }),
    saveCategoryDocs(finalLatest, batchUpdatedAt),
  ])

  const [, deletedCount] = await Promise.all([
    saveSummariesToFirestore(newSummaryMap, itemsById, batchUpdatedAt),
    cleanupOldSummaries(),
  ])

  console.log(
    `[batch] 완료 — trending:${finalTrending.length}, latest:${finalLatest.length}, ` +
    `신규요약:${newSummaryMap.size}, 삭제:${deletedCount}` +
    (errors.length > 0 ? `, 오류:${errors.join(' | ')}` : '')
  )
}

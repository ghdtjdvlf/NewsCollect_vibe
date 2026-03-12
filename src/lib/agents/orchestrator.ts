// ─── OrchestratorAgent: 전체 파이프라인 조율 ─────────────
import { CrawlerAgent } from './crawlerAgent'
import { FilterAgent } from './filterAgent'
import { SummarizerAgent } from './summarizerAgent'
import { db } from '@/lib/firebase'
import type { NewsItem, NewsCategory } from '@/types/news'

export interface OrchestratorInput {
  mode: 'trending' | 'latest'
  category?: NewsCategory
  apiKey?: string
  limit?: number
  skipSummary?: boolean
}

export interface OrchestratorOutput {
  items: NewsItem[]
  updatedAt: string
  stats: {
    crawled: number
    filtered: number
    summarized: number
    duration_ms: number
  }
}

export class OrchestratorAgent {
  private crawler = new CrawlerAgent()
  private filter = new FilterAgent()
  private summarizer = new SummarizerAgent()

  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const start = Date.now()
    const { mode, category, apiKey, limit = 20, skipSummary = false } = input

    console.log(`[Orchestrator] 시작 mode=${mode}`)

    // ① 수집
    const crawlResult = await this.crawler.run({ mode, limit })
    if (!crawlResult.success) {
      console.warn('[Orchestrator] 크롤링 실패 — 빈 결과 반환')
      return this.emptyResult(start)
    }
    const { newsItems, communityPosts } = crawlResult.data

    // ② 필터링
    const filterResult = await this.filter.run({
      newsItems,
      communityPosts,
      mode,
      category,
      limit,
    })
    if (!filterResult.success) {
      console.warn('[Orchestrator] 필터링 실패 — 크롤링 원본 반환')
      return this.toOutput(newsItems.slice(0, limit), newsItems.length, 0, start)
    }
    const { items } = filterResult.data

    // ③ 요약 (apiKey 있고 skipSummary 아닌 경우)
    let summarizedCount = 0
    if (!skipSummary && apiKey && items.length > 0) {
      const needsSummary = items.filter((item) => !item.summaryLines?.length)
      console.log(`[Orchestrator] 요약 대상: ${needsSummary.length}개 (전체 ${items.length}개 중 미요약)`)
      if (needsSummary.length > 0) {
        const summaryResult = await this.summarizer.run({ items: needsSummary, apiKey })
        if (summaryResult.success) {
          const { summaryMap } = summaryResult.data
          summarizedCount = summaryMap.size
          // 요약 결과를 items에 병합
          summaryMap.forEach((summary, id) => {
            const item = items.find((i) => i.id === id)
            if (item) {
              item.summaryLines = summary.lines
              item.conclusion = summary.conclusion
            }
          })
        }
      }
    }

    // ④ Firestore 저장 (배치 모드에서만)
    if (!skipSummary && apiKey) {
      await this.saveToFirestore(items, mode).catch((err) => {
        console.warn('[Orchestrator] Firestore 저장 실패 (무시):', err instanceof Error ? err.message : err)
      })
    }

    console.log(`[Orchestrator] 완료 (${Date.now() - start}ms)`)
    return this.toOutput(items, newsItems.length, summarizedCount, start)
  }

  private async saveToFirestore(items: NewsItem[], mode: 'trending' | 'latest') {
    const articlesCol = db.collection('articles')
    const CHUNK = 500
    const now = new Date()

    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK)
      const batch = db.batch()

      for (const item of chunk) {
        const expiresAt = new Date(item.publishedAt)
        expiresAt.setDate(expiresAt.getDate() + 4)
        batch.set(
          articlesCol.doc(item.id),
          { ...item, expiresAt, summaryGeneratedAt: item.summaryLines ? now : null },
          { merge: true }
        )
      }
      await batch.commit()
    }

    if (mode === 'trending') {
      await db.collection('feeds').doc('trending').set({
        ids: items.map((i) => i.id),
        updatedAt: new Date().toISOString(),
      })
    }

    console.log(`[Orchestrator] Firestore 저장 완료 ${items.length}개`)
  }

  private toOutput(
    items: NewsItem[],
    crawled: number,
    summarized: number,
    start: number
  ): OrchestratorOutput {
    return {
      items,
      updatedAt: new Date().toISOString(),
      stats: { crawled, filtered: items.length, summarized, duration_ms: Date.now() - start },
    }
  }

  private emptyResult(start: number): OrchestratorOutput {
    return {
      items: [],
      updatedAt: new Date().toISOString(),
      stats: { crawled: 0, filtered: 0, summarized: 0, duration_ms: Date.now() - start },
    }
  }
}

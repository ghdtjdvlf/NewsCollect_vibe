// ─── OrchestratorAgent: 수집 파이프라인 조율 ─────────────
// 역할: 크롤 → 기존 DB 교차 중복 제거 → Firestore 저장 (요약 제외)
// 요약은 /api/agent/summarize 에서 별도 처리
import { CrawlerAgent } from './crawlerAgent'
import { FilterAgent } from './filterAgent'
import { db } from '@/lib/firebase'
import type { NewsItem, NewsCategory } from '@/types/news'

export interface OrchestratorInput {
  mode: 'trending' | 'latest'
  category?: NewsCategory
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

  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const start = Date.now()
    const { mode, category } = input

    console.log(`[Orchestrator] 시작 mode=${mode}`)

    // ① 수집 (소스별 제한 없이 전체)
    const crawlResult = await this.crawler.run({ mode })
    if (!crawlResult.success) {
      console.warn('[Orchestrator] 크롤링 실패 — 빈 결과 반환')
      return this.emptyResult(start)
    }
    const { newsItems, communityPosts } = crawlResult.data

    // ② Firestore 기존 기사 제목 로드 (교차 중복 제거용)
    const existingTitles = await this.fetchExistingTitles()

    // ③ 필터링 (90% 제목 유사도 중복 제거 + trendScore 계산)
    const filterResult = await this.filter.run({
      newsItems,
      communityPosts,
      mode,
      category,
      existingTitles,
    })
    if (!filterResult.success) {
      console.warn('[Orchestrator] 필터링 실패 — 빈 결과 반환')
      return this.emptyResult(start)
    }
    const { items } = filterResult.data

    // ④ Firestore 저장 (요약 없이, 새 기사만)
    if (items.length > 0) {
      await this.saveToFirestore(items, mode).catch((err) => {
        console.warn('[Orchestrator] Firestore 저장 실패 (무시):', err instanceof Error ? err.message : err)
      })
    }

    console.log(`[Orchestrator] 완료 — 신규 ${items.length}개 저장 (${Date.now() - start}ms)`)
    return this.toOutput(items, newsItems.length, 0, start)
  }

  // 만료되지 않은 기사 제목 목록
  private async fetchExistingTitles(): Promise<string[]> {
    try {
      const snapshot = await db.collection('articles')
        .where('expiresAt', '>', new Date())
        .select('title')
        .get()
      return snapshot.docs.map((d) => d.data().title as string)
    } catch (err) {
      console.warn('[Orchestrator] 기존 제목 로드 실패 (교차 중복 제거 생략):', (err as Error)?.message)
      return []
    }
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
          { ...item, expiresAt, summaryGeneratedAt: null },
          { merge: true }
        )
      }
      await batch.commit()
    }

    // trending 피드: trendScore 기준 정렬된 ID 목록 저장
    if (mode === 'trending') {
      const sorted = [...items].sort((a, b) => (b.trendScore ?? 0) - (a.trendScore ?? 0))
      await db.collection('feeds').doc('trending').set({
        ids: sorted.map((i) => i.id),
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

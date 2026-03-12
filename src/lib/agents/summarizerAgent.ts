// ─── SummarizerAgent: AI 요약 생성 ───────────────────────
import { BaseAgent } from './base'
import { summarizeItems, type SummaryData } from '@/lib/summarizer'
import type { NewsItem } from '@/types/news'

export interface SummarizerInput {
  items: NewsItem[]
  apiKey: string
  timeoutMs?: number
}

export interface SummarizerOutput {
  summaryMap: Map<string, SummaryData>
  succeeded: number
  failed: number
  tokensUsed: number
}

export class SummarizerAgent extends BaseAgent<SummarizerInput, SummarizerOutput> {
  readonly name = 'SummarizerAgent'

  async execute(input: SummarizerInput): Promise<SummarizerOutput> {
    const { items, apiKey, timeoutMs = 120_000 } = input

    console.log(`[SummarizerAgent] 시작 — ${items.length}개, apiKey=${apiKey ? '있음' : '없음'}`)

    if (items.length === 0) {
      return { summaryMap: new Map(), succeeded: 0, failed: 0, tokensUsed: 0 }
    }

    const { resultMap: summaryMap, tokensUsed } = await summarizeItems(items, apiKey, timeoutMs)
    const succeeded = summaryMap.size
    const failed = items.length - succeeded

    console.log(`[SummarizerAgent] 완료 — ${succeeded}개 성공, ${failed}개 실패, ${tokensUsed} 토큰`)

    return { summaryMap, succeeded, failed, tokensUsed }
  }
}

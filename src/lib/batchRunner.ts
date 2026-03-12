import { db } from '@/lib/firebase'
import { OrchestratorAgent } from '@/lib/agents/orchestrator'
import { setBatchRunning } from '@/lib/agents/agentLogger'

const BATCH_COOLDOWN_MS = 3 * 60 * 1000

export interface BatchResult {
  message: string
  total: number
  summarized?: number
  stats?: {
    crawled: number
    filtered: number
    summarized: number
    duration_ms: number
  }
}

export async function runBatch(options: { reset?: boolean } = {}): Promise<BatchResult> {
  const forceReset = options.reset === true

  // 쿨다운 체크
  try {
    const metaDoc = await db.collection('meta').doc('batch').get()
    const lastRun: number = metaDoc.exists ? (metaDoc.data()?.lastRunAt ?? 0) : 0
    const elapsed = Date.now() - lastRun
    if (!forceReset && elapsed < BATCH_COOLDOWN_MS) {
      const waitSec = Math.ceil((BATCH_COOLDOWN_MS - elapsed) / 1000)
      console.log(`[batch] 쿨다운 중 — ${waitSec}초 후 재실행`)
      return { message: `쿨다운 중 (${waitSec}초 후 재실행)`, total: 0 }
    }
    await db.collection('meta').doc('batch').set({ lastRunAt: Date.now() })
  } catch (err) {
    console.warn('[batch] meta 쿨다운 체크 실패 (무시):', err instanceof Error ? err.message : err)
  }

  if (forceReset) console.log('[batch] 강제 초기화 후 실행')

  const orchestrator = new OrchestratorAgent()
  const apiKey = process.env.GROQ_API_KEY

  await setBatchRunning(true)

  try {
    // 화제뉴스 + 최신뉴스 병렬 수집 (요약은 모두 skip — 별도 summarize 배치에서 처리)
    const [trendingResult, latestResult] = await Promise.all([
      orchestrator.run({ mode: 'trending', apiKey, limit: 20, skipSummary: true }),
      orchestrator.run({ mode: 'latest', apiKey, limit: 100, skipSummary: true }),
    ])

    const total = trendingResult.items.length + latestResult.items.length

    if (total === 0) {
      return { message: '수집된 기사 없음', total: 0 }
    }

    return {
      message: '수집 완료',
      total,
      summarized: trendingResult.stats.summarized,
      stats: trendingResult.stats,
    }
  } finally {
    await setBatchRunning(false)
  }
}

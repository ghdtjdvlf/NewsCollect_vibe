import { db } from '@/lib/firebase'
import { OrchestratorAgent } from '@/lib/agents/orchestrator'
import { setBatchRunning } from '@/lib/agents/agentLogger'

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

  // 쿨다운 체크 (intervalMinutes는 agentLogs에서 읽음)
  try {
    const [metaDoc, logsDoc] = await Promise.all([
      db.collection('meta').doc('batch').get(),
      db.collection('meta').doc('agentLogs').get(),
    ])
    const intervalMinutes: number = (logsDoc.data()?.batchState?.intervalMinutes as number) ?? 10
    const cooldownMs = intervalMinutes * 60 * 1000
    const lastRun: number = metaDoc.exists ? (metaDoc.data()?.lastRunAt ?? 0) : 0
    const elapsed = Date.now() - lastRun
    if (!forceReset && elapsed < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - elapsed) / 1000)
      console.log(`[batch] 쿨다운 중 — ${waitSec}초 후 재실행 (주기: ${intervalMinutes}분)`)
      return { message: `쿨다운 중 (${waitSec}초 후 재실행)`, total: 0 }
    }
    await db.collection('meta').doc('batch').set({ lastRunAt: Date.now() })
  } catch (err) {
    console.warn('[batch] meta 쿨다운 체크 실패 (무시):', err instanceof Error ? err.message : err)
  }

  if (forceReset) console.log('[batch] 강제 초기화 후 실행')

  const orchestrator = new OrchestratorAgent()

  await setBatchRunning(true)

  try {
    // trending + latest 병렬 수집 (제한 없이, 요약 제외)
    const [trendingResult, latestResult] = await Promise.all([
      orchestrator.run({ mode: 'trending' }),
      orchestrator.run({ mode: 'latest' }),
    ])

    const total = trendingResult.items.length + latestResult.items.length

    if (total === 0) {
      return { message: '신규 기사 없음 (모두 중복)', total: 0 }
    }

    return {
      message: '수집 완료',
      total,
      stats: trendingResult.stats,
    }
  } finally {
    await setBatchRunning(false)
  }
}

import { NextResponse } from 'next/server'
import { OrchestratorAgent } from '@/lib/agents/orchestrator'
import { setBatchRunning, getBatchScheduleFromStore } from '@/lib/agents/agentLogger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const { isRunning } = await getBatchScheduleFromStore()
  if (isRunning) {
    return NextResponse.json({ error: '배치가 실행 중입니다' }, { status: 409 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY 없음' }, { status: 500 })
  }

  await setBatchRunning(true)
  try {
    const orchestrator = new OrchestratorAgent()
    const result = await orchestrator.run({ mode: 'trending', apiKey, limit: 20, skipSummary: false })
    return NextResponse.json({ summarized: result.stats.summarized, total: result.items.length })
  } finally {
    await setBatchRunning(false)
  }
}

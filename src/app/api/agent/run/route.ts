import { NextResponse } from 'next/server'
import { runBatch } from '@/lib/batchRunner'
import { getBatchScheduleFromStore } from '@/lib/agents/agentLogger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const { isRunning } = await getBatchScheduleFromStore()
  if (isRunning) {
    return NextResponse.json({ error: '이미 실행 중입니다' }, { status: 409 })
  }

  try {
    const result = await runBatch({ reset: true })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '배치 처리 실패' },
      { status: 500 }
    )
  }
}

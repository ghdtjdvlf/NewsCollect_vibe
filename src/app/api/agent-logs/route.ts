import { NextRequest, NextResponse } from 'next/server'
import { getLogsFromStore, getBatchScheduleFromStore, getGroqRateLimitFromStore, clearLogs } from '@/lib/agents/agentLogger'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get('agent') ?? undefined
  const [logs, schedule, groqRateLimit] = await Promise.all([
    getLogsFromStore(agent),
    getBatchScheduleFromStore(),
    getGroqRateLimitFromStore(),
  ])
  return NextResponse.json({ logs, schedule, groqRateLimit })
}

export async function DELETE() {
  await clearLogs()
  return NextResponse.json({ ok: true })
}

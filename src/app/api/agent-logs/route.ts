import { NextRequest, NextResponse } from 'next/server'
import { getLogsFromStore, getBatchScheduleFromStore, getGroqRateLimitFromStore, clearLogs } from '@/lib/agents/agentLogger'
import { db } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

async function getArticleStats() {
  try {
    // count() 집계 쿼리 — 문서 데이터를 읽지 않아 할당량 절약
    const [totalSnap, unsummarizedSnap] = await Promise.all([
      db.collection('articles').count().get(),
      db.collection('articles').where('summaryGeneratedAt', '==', null).count().get(),
    ])
    return {
      total: totalSnap.data().count,
      unsummarized: unsummarizedSnap.data().count,
    }
  } catch (e) {
    console.warn('[agent-logs] articleStats 조회 실패:', (e as Error)?.message)
    return null  // null이면 UI에서 카드 숨김
  }
}

export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get('agent') ?? undefined
  const [logs, schedule, groqRateLimit, articleStats] = await Promise.all([
    getLogsFromStore(agent),
    getBatchScheduleFromStore(),
    getGroqRateLimitFromStore(),
    getArticleStats(),
  ])
  return NextResponse.json({ logs, schedule, groqRateLimit, articleStats })
}

export async function DELETE() {
  await clearLogs()
  return NextResponse.json({ ok: true })
}

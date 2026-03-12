import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { intervalMinutes } = await req.json() as { intervalMinutes: number }
  if (!intervalMinutes || intervalMinutes < 5 || intervalMinutes > 120) {
    return NextResponse.json({ error: '5~120분 사이로 입력하세요' }, { status: 400 })
  }
  await db.collection('meta').doc('agentLogs').set(
    { batchState: { intervalMinutes } },
    { merge: true }
  )
  return NextResponse.json({ ok: true, intervalMinutes })
}

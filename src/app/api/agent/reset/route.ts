import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    await db.collection('meta').doc('agentLogs').set(
      { batchState: { isRunning: false, isRunningSince: null } },
      { merge: true }
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message }, { status: 500 })
  }
}

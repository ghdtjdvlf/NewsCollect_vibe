import { NextRequest, NextResponse } from 'next/server'
import { runBatch } from '@/lib/batchRunner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { reset?: boolean }
    const result = await runBatch({ reset: body.reset })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '배치 처리 실패' },
      { status: 500 }
    )
  }
}

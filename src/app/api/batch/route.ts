import { NextRequest, NextResponse } from 'next/server'
import { runBatch } from '@/lib/batchRunner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET
  const secret = req.headers.get('x-cron-secret')
  // CRON_SECRET이 설정된 경우에만 검증 (미설정 시 내부 Netlify 호출 허용)
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

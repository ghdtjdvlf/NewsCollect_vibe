import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json() as { id?: string }

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
    }

    console.log(`[summarize] Firestore 조회 id=${id}`)
    const doc = await db.collection('articles').doc(id).get()

    if (!doc.exists || !doc.data()?.summaryLines?.length) {
      console.log(`[summarize] 요약 없음 id=${id}`)
      return NextResponse.json({ error: '요약 정보가 없습니다.' }, { status: 404 })
    }

    const data = doc.data()!
    console.log(`[summarize] 조회 완료 id=${id} lines=${data.summaryLines?.length}개`)
    return NextResponse.json({ lines: data.summaryLines, conclusion: data.conclusion })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('[summarize] 오류 발생:', message)
    return NextResponse.json({ error: `요약 실패: ${message}` }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  console.log('[admin/reset] 캐시 초기화 시작')

  try {
    // 1. news_cache 컬렉션 전체 문서 조회 (카테고리별 doc ID에 '/'가 있어 하드코딩 불가)
    const [cacheSnap, summariesSnap] = await Promise.all([
      db.collection('news_cache').get(),
      db.collection('summaries').limit(500).get(),
    ])

    const deleteBatch = db.batch()

    for (const doc of cacheSnap.docs) {
      deleteBatch.delete(doc.ref)
    }
    for (const doc of summariesSnap.docs) {
      deleteBatch.delete(doc.ref)
    }

    await deleteBatch.commit()

    console.log(`[admin/reset] 삭제 완료 — news_cache=${cacheSnap.size}개, summaries=${summariesSnap.size}개 elapsed=${Date.now() - start}ms`)

    return NextResponse.json({
      message: '캐시 초기화 완료',
      deletedCacheDocs: cacheSnap.size,
      deletedSummaries: summariesSnap.size,
      elapsedMs: Date.now() - start,
    })
  } catch (err) {
    console.error('[admin/reset] 오류:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '초기화 실패' },
      { status: 500 }
    )
  }
}

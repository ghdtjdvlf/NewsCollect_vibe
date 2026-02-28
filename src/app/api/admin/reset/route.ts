import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

const CATEGORIES = ['경제', '사건사고', '사회', '정치', '세계', 'IT/과학', '연예', '스포츠', '기타']

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  console.log('[admin/reset] 캐시 초기화 시작')

  try {
    // 1. news_cache 문서 목록 (trending, latest, latest_카테고리별)
    const cacheDocIds = [
      'trending',
      'latest',
      ...CATEGORIES.map((cat) => `latest_${cat}`),
    ]

    // 2. summaries 컬렉션 전체 삭제
    const summariesSnap = await db.collection('summaries').limit(500).get()
    const deleteBatch = db.batch()

    for (const doc of summariesSnap.docs) {
      deleteBatch.delete(doc.ref)
    }

    // 3. news_cache 문서 삭제
    for (const docId of cacheDocIds) {
      deleteBatch.delete(db.collection('news_cache').doc(docId))
    }

    await deleteBatch.commit()

    console.log(`[admin/reset] 삭제 완료 — summaries=${summariesSnap.size}개, news_cache=${cacheDocIds.length}개 elapsed=${Date.now() - start}ms`)

    return NextResponse.json({
      message: '캐시 초기화 완료',
      deletedSummaries: summariesSnap.size,
      deletedCacheDocs: cacheDocIds.length,
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

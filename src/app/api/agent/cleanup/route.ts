import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { deduplicateByUrl, deduplicateNews } from '@/lib/deduplication'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  try {
    // 전체 기사 로드
    const snapshot = await db.collection('articles').get()
    if (snapshot.empty) return NextResponse.json({ deleted: 0, remaining: 0 })

    const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as NewsItem & { id: string }))
    console.log(`[cleanup] 전체 기사: ${all.length}개`)

    // 최신순 정렬 후 중복 제거 (최신 기사 우선 보존)
    const sorted = [...all].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
    const byUrl = deduplicateByUrl(sorted)
    const byTitle = deduplicateNews(byUrl, [], 0.7)

    const keepIds = new Set(byTitle.map((item) => item.id))
    const deleteIds = all.map((a) => a.id).filter((id) => !keepIds.has(id))

    console.log(`[cleanup] 보존: ${keepIds.size}개, 삭제: ${deleteIds.length}개`)

    // 500개씩 배치 삭제
    const CHUNK = 500
    for (let i = 0; i < deleteIds.length; i += CHUNK) {
      const batch = db.batch()
      for (const id of deleteIds.slice(i, i + CHUNK)) {
        batch.delete(db.collection('articles').doc(id))
      }
      await batch.commit()
    }

    return NextResponse.json({ deleted: deleteIds.length, remaining: keepIds.size })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '오류 발생' },
      { status: 500 }
    )
  }
}

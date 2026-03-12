import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { summarizeItems } from '@/lib/summarizer'
import type { NewsItem } from '@/types/news'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const start = Date.now()
  const elapsed = () => `${Date.now() - start}ms`

  try {
    const body = await req.json() as { id?: string; title?: string; summary?: string }
    const { id, title: clientTitle, summary: clientSummary } = body

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
    }

    console.log(`[summarize] 요청 시작 id=${id}`)

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY 없음' }, { status: 503 })
    }

    // Firestore 조회 시도 (실패해도 클라이언트 데이터로 폴백)
    let item: NewsItem | null = null
    try {
      const articlesCol = db.collection('articles')
      const doc = await articlesCol.doc(id).get()

      // Firestore에 summaryLines가 있으면 즉시 반환
      if (doc.exists && doc.data()?.summaryLines?.length) {
        const data = doc.data()!
        const title = data.title ? ` | "${String(data.title).slice(0, 25)}..."` : ''
        console.log(`[summarize] 캐시 반환 id=${id}${title} | lines=${data.summaryLines.length}개 (${elapsed()})`)
        return NextResponse.json({ lines: data.summaryLines, conclusion: data.conclusion })
      }

      if (doc.exists) {
        const { expiresAt: _e, summaryGeneratedAt: _s, ...rest } = doc.data()!
        item = rest as unknown as NewsItem
      }
    } catch (firestoreErr) {
      const msg = firestoreErr instanceof Error ? firestoreErr.message : String(firestoreErr)
      console.warn(`[summarize] Firestore 조회 실패 (폴백) id=${id}: ${msg}`)
    }

    // Firestore 실패 또는 문서 없음 → 클라이언트 데이터 사용
    if (!item) {
      if (!clientTitle) {
        console.log(`[summarize] 기사 없음 id=${id} (${elapsed()})`)
        return NextResponse.json({ error: '기사를 찾을 수 없습니다.' }, { status: 404 })
      }
      item = { id, title: clientTitle, summary: clientSummary } as NewsItem
    }

    const shortTitle = item.title ? `"${item.title.slice(0, 25)}..."` : id
    console.log(`[summarize] Groq 요약 시작 | ${shortTitle}`)
    const { resultMap: summaryMap } = await summarizeItems([item], apiKey, 25_000)
    const summary = summaryMap.get(id)

    if (!summary) {
      console.log(`[summarize] Groq 파싱 실패 | ${shortTitle} (${elapsed()})`)
      return NextResponse.json({ error: '요약 생성 실패' }, { status: 500 })
    }

    // Firestore에 저장 (다음 요청 시 즉시 반환, 실패해도 무시)
    try {
      const articlesCol = db.collection('articles')
      const doc = await articlesCol.doc(id).get()
      if (doc.exists) {
        await articlesCol.doc(id).update({
          summaryLines: summary.lines,
          conclusion: summary.conclusion,
          summaryGeneratedAt: new Date(),
        })
      }
    } catch {
      console.warn(`[summarize] Firestore 저장 실패 id=${id} (요약은 정상 반환)`)
    }

    console.log(`[summarize] 완료 | ${shortTitle} | lines=${summary.lines.length}개 (${elapsed()})`)
    return NextResponse.json({ lines: summary.lines, conclusion: summary.conclusion })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error(`[summarize] 오류 (${elapsed()}):`, message)
    return NextResponse.json({ error: `요약 실패: ${message}` }, { status: 500 })
  }
}

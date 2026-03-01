import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

const GEMINI_MODEL = 'gemini-2.5-flash-lite'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY

  console.log('[summarize] 요청 수신', {
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey?.slice(0, 8),
  })

  if (!apiKey || apiKey === 'your_google_api_key_here') {
    console.error('[summarize] GOOGLE_API_KEY 없음')
    return NextResponse.json(
      { error: 'GOOGLE_API_KEY가 .env.local에 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  try {
    const { id, title, summary, url } = await req.json() as {
      id?: string
      title?: string
      summary?: string
      url?: string
    }

    console.log('[summarize] 파라미터', { id, titleLen: title?.length, hasSummary: !!summary, hasUrl: !!url })

    if (!title) {
      return NextResponse.json({ error: '제목이 필요합니다.' }, { status: 400 })
    }

    // 1. Firestore 캐시 먼저 확인
    if (id) {
      try {
        console.log(`[summarize] Firestore 조회 시작 id=${id}`)
        const cached = await db.collection('summaries').doc(id).get()
        console.log(`[summarize] Firestore 조회 완료 id=${id} exists=${cached.exists}`)

        if (cached.exists) {
          const data = cached.data()!
          console.log(`[summarize] 캐시 HIT → lines=${data.lines?.length}개`)
          return NextResponse.json({
            lines: data.lines,
            conclusion: data.conclusion,
            cached: true,
          })
        }
        console.log(`[summarize] 캐시 MISS → Gemini 실시간 생성`)
      } catch (fbErr) {
        console.error('[summarize] Firestore 조회 실패:', fbErr)
      }
    } else {
      console.log('[summarize] id 없음 → 실시간 생성')
    }

    // 2. 캐시 없으면 Gemini 실시간 생성
    console.log(`[summarize] Gemini 호출 시작 model=${GEMINI_MODEL}`)
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

    const content = [title, summary].filter(Boolean).join('\n\n')
    const prompt = `
    다음 뉴스를 3줄로 요약해주세요.
    말투는 음슴체를 사용
    각 줄은 핵심 내용을 담아야 합니다.
    무조건 뉴스에서 내용을 가져와야함.
    어려운 말들을 쉬운말로 바꿔서 요약.
    3줄 요약 아래쪽에 "결론 :  (이해하기 쉽게 비유해서 요약한내용)" 을 추가해줘.

    \n\n${content}${url ? `\n출처: ${url}` : ''}`

    const startTime = Date.now()
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 8000)
      ),
    ])
    const elapsed = Date.now() - startTime
    const text = result.response.text()
    console.log(`[summarize] Gemini 응답 완료 elapsed=${elapsed}ms textLen=${text.length}`)
    console.log(`[summarize] Gemini 응답 텍스트 (앞 200자): ${text.slice(0, 200)}`)

    const allLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    const conclusionLine = allLines.find((l) => l.startsWith('결론'))
    const conclusion = conclusionLine
      ? conclusionLine.replace(/^결론\s*[:：]\s*/, '').trim()
      : undefined

    const lines = allLines
      .filter((l) => !l.startsWith('결론'))
      .slice(0, 3)

    console.log(`[summarize] 파싱 완료 lines=${lines.length} hasConclusion=${!!conclusion}`)

    // 3. Firestore에 저장 (다음 요청부터 캐시 사용)
    if (id && lines.length > 0) {
      db.collection('summaries').doc(id).set({
        lines,
        conclusion: conclusion ?? '',
        title,
        generatedAt: new Date(),
        source: '',
      }).then(() => {
        console.log(`[summarize] Firestore 저장 완료 id=${id}`)
      }).catch((saveErr) => {
        console.error(`[summarize] Firestore 저장 실패 id=${id}:`, saveErr)
      })
    }

    return NextResponse.json({ lines, conclusion, cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('[summarize] 오류 발생:', { message, stack: err instanceof Error ? err.stack?.slice(0, 300) : undefined })

    if (message.includes('429') || message.toLowerCase().includes('too many requests') || message.includes('quota')) {
      return NextResponse.json({ error: '요청이 많습니다! 잠시 후 이용해주세요.' }, { status: 429 })
    }
    if (message === 'TIMEOUT') {
      return NextResponse.json({ error: 'AI 응답이 너무 오래 걸립니다. 잠시 후 다시 시도해주세요.' }, { status: 504 })
    }
    return NextResponse.json({ error: `요약 실패: ${message}` }, { status: 500 })
  }
}

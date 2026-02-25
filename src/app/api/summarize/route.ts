import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY

  if (!apiKey || apiKey === 'your_google_api_key_here') {
    return NextResponse.json(
      { error: 'GOOGLE_API_KEY가 .env.local에 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  try {
    const { title, summary, url } = await req.json() as {
      title?: string
      summary?: string
      url?: string
    }

    if (!title) {
      return NextResponse.json({ error: '제목이 필요합니다.' }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    const content = [title, summary].filter(Boolean).join('\n\n')
    const prompt = `
    다음 뉴스를 3줄로 요약해주세요.  
    말투는 음슴체를 사용
    각 줄은 핵심 내용을 담아야 합니다. 
    무조건 뉴스에서 내용을 가져와야함.
    어려운 말들을 쉬운말로 바꿔서 요약.
    3줄 요약 아래쪽에 "결론 :  (이해하기 쉽게 비유해서 요약한내용)" 을 추가해줘.
    
    \n\n${content}${url ? `\n출처: ${url}` : ''}`

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 3)

    return NextResponse.json({ lines })
  } catch (err) {
    console.error('[API/summarize]', err)
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: `요약 실패: ${message}` }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ thumbnail: null })

  // SSRF 방어: http/https 스킴만 허용
  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ thumbnail: null })
    }
  } catch {
    return NextResponse.json({ thumbnail: null })
  }

  // Google News URL은 og:image가 모든 기사에서 동일 → 건너뜀
  if (parsed.hostname === 'news.google.com') {
    return NextResponse.json({ thumbnail: null })
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })

    if (!res.ok) return NextResponse.json({ thumbnail: null })

    // Content-Type 확인 후 HTML만 파싱
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return NextResponse.json({ thumbnail: null })

    // 전체 파싱 대신 앞부분(헤더 영역)만 읽음
    const reader = res.body?.getReader()
    if (!reader) return NextResponse.json({ thumbnail: null })

    let html = ''
    while (html.length < 30000) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      // <head> 종료 이후는 불필요
      if (html.includes('</head>')) break
    }
    reader.cancel()

    // og:image 추출 (두 가지 속성 순서 대응)
    const ogImage =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)?.[1] ??
      null

    // 상대 경로를 절대 경로로 변환
    let thumbnail: string | null = null
    if (ogImage) {
      try {
        thumbnail = new URL(ogImage, parsed.origin).toString()
      } catch {
        thumbnail = null
      }
    }

    return NextResponse.json(
      { thumbnail },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      }
    )
  } catch {
    return NextResponse.json({ thumbnail: null })
  }
}

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ thumbnail: null, description: null })

  // SSRF 방어: http/https 스킴만 허용
  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ thumbnail: null, description: null })
    }
  } catch {
    return NextResponse.json({ thumbnail: null, description: null })
  }

  // Google News URL은 리다이렉트를 따라가 실제 기사 URL을 얻음
  if (parsed.hostname === 'news.google.com') {
    try {
      const redirectRes = await fetch(parsed.toString(), {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      })
      if (!redirectRes.ok) return NextResponse.json({ thumbnail: null, description: null })
      const finalUrl = new URL(redirectRes.url)
      if (finalUrl.hostname.includes('google.com')) {
        return NextResponse.json({ thumbnail: null, description: null })
      }
      parsed = finalUrl
    } catch {
      return NextResponse.json({ thumbnail: null, description: null })
    }
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

    if (!res.ok) return NextResponse.json({ thumbnail: null, description: null })

    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return NextResponse.json({ thumbnail: null, description: null })

    const reader = res.body?.getReader()
    if (!reader) return NextResponse.json({ thumbnail: null, description: null })

    let html = ''
    while (html.length < 30000) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      if (html.includes('</head>')) break
    }
    reader.cancel()

    // og:image 추출
    const ogImage =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)?.[1] ??
      null

    // og:description 추출 (본문 요약으로 사용)
    const ogDesc =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ??
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      null

    let thumbnail: string | null = null
    if (ogImage) {
      try {
        const t = new URL(ogImage, parsed.origin).toString()
        const isGeneric =
          t.includes('og_image_default') ||
          t.includes('/static.news/image/news/ogtag/') ||
          t.includes('noimage') ||
          t.includes('no_image')
        thumbnail = isGeneric ? null : t
      } catch {
        thumbnail = null
      }
    }

    const description = ogDesc
      ? ogDesc.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim()
      : null

    return NextResponse.json(
      { thumbnail, description },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } }
    )
  } catch {
    return NextResponse.json({ thumbnail: null, description: null })
  }
}

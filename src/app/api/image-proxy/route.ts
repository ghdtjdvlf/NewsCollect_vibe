import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

// 내부망 SSRF 방어
function isPrivateHost(hostname: string): boolean {
  return /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1|0\.)/.test(hostname)
}

// 한국 주요 뉴스 CDN → 실제 뉴스 사이트 Referer 명시 매핑
// (buildReferer의 도메인 추론은 CDN-전용 도메인에서 틀린 Referer 반환)
const CDN_REFERER: Record<string, string> = {
  // Naver: imgnews.pstatic.net, imgnn.pstatic.net 등
  'imgnews.pstatic.net':  'https://news.naver.com/',
  'imgnn.pstatic.net':    'https://news.naver.com/',
  'ssl.pstatic.net':      'https://news.naver.com/',
  'mimgnews.pstatic.net': 'https://news.naver.com/',
  // Daum / Kakao
  'img1.kakaocdn.net': 'https://news.daum.net/',
  'img2.kakaocdn.net': 'https://news.daum.net/',
  'img3.kakaocdn.net': 'https://news.daum.net/',
  't1.kakaocdn.net':   'https://news.daum.net/',
  't4.kakaocdn.net':   'https://news.daum.net/',
  // 조선일보
  'image.chosun.com': 'https://www.chosun.com/',
  // 한겨레
  'img.hani.co.kr': 'https://www.hani.co.kr/',
  // 중앙일보
  'pds.joins.com':    'https://www.joongang.co.kr/',
  'imgnn.joins.com':  'https://www.joongang.co.kr/',
  // 연합뉴스
  'img.yonhapnews.co.kr': 'https://www.yna.co.kr/',
  'img1.yna.co.kr':       'https://www.yna.co.kr/',
}

// CDN 매핑 없을 때: 서브도메인 → www 루트 도메인으로 변환
function buildReferer(protocol: string, hostname: string): string {
  const parts = hostname.split('.')
  // 한국 2단계 TLD: .co.kr .or.kr .ne.kr .go.kr 등
  const isKoreanTLD = parts[parts.length - 1] === 'kr' && parts.length >= 3
  const rootParts = isKoreanTLD ? parts.slice(-3) : parts.slice(-2)
  const rootDomain = rootParts.join('.')
  if (hostname === rootDomain || hostname === `www.${rootDomain}`) {
    return `${protocol}//${hostname}/`
  }
  return `${protocol}//www.${rootDomain}/`
}

function getReferer(protocol: string, hostname: string): string {
  return CDN_REFERER[hostname] ?? buildReferer(protocol, hostname)
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse(null, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return new NextResponse(null, { status: 400 })
    if (isPrivateHost(parsed.hostname)) return new NextResponse(null, { status: 403 })
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'same-site',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
  }

  try {
    // 1차: CDN별 지정 Referer 또는 추론 Referer 포함
    let res = await fetch(parsed.toString(), {
      headers: { ...baseHeaders, 'Referer': getReferer(parsed.protocol, parsed.hostname) },
      signal: AbortSignal.timeout(8000),
    })

    // 2차: Referer 없이 재시도 (Referer 없는 요청은 허용하는 CDN)
    if (res.status === 403 || res.status === 401 || res.status === 400) {
      res = await fetch(parsed.toString(), {
        headers: baseHeaders,
        signal: AbortSignal.timeout(8000),
      })
    }

    if (!res.ok) return new NextResponse(null, { status: res.status })

    const contentType = res.headers.get('content-type') ?? ''
    if (!ALLOWED_TYPES.some((t) => contentType.includes(t))) {
      return new NextResponse(null, { status: 415 })
    }

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MAX_SIZE) return new NextResponse(null, { status: 413 })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600',
        'Content-Length': String(buffer.byteLength),
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}

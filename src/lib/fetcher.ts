// 크롤링용 공통 fetch 래퍼
// User-Agent 위장, timeout, retry 포함

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
}

interface FetchOptions {
  timeout?: number
  retries?: number
  headers?: Record<string, string>
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const { timeout = 10000, retries = 2, headers = {} } = options
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const res = await fetch(url, {
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
      return await res.text()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        await sleep(500 * (attempt + 1))
      }
    }
  }

  throw lastError
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── RSS XML 파서 ─────────────────────────────────────────
export interface RssItem {
  title: string
  link: string
  pubDate?: string
  description?: string
  thumbnail?: string
  source?: string
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = []

  // <item> 블록 추출
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)

  for (const match of itemMatches) {
    const block = match[1]

    const title = extractCdata(block, 'title') ?? extractTag(block, 'title')
    const link =
      extractTag(block, 'link') ??
      extractTag(block, 'origLink') ??
      extractTag(block, 'guid')
    const pubDate = extractTag(block, 'pubDate')

    // description raw HTML에서 img src 추출 (클리닝 전)
    const rawDesc = extractCdata(block, 'description') ?? extractTag(block, 'description')
    const imgInDesc = rawDesc ? extractImgSrc(rawDesc) : undefined

    const description = rawDesc ? cleanText(rawDesc) : undefined

    const thumbnail =
      extractAttr(block, 'media:content', 'url') ??
      extractAttr(block, 'media:thumbnail', 'url') ??
      imgInDesc ??
      extractTag(block, 'enclosure')
    const source =
      extractCdata(block, 'source') ?? extractTag(block, 'source')

    if (title && link) {
      items.push({
        title: cleanText(title),
        link: link.trim(),
        pubDate,
        description,
        thumbnail,
        source,
      })
    }
  }

  return items
}

function extractTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m?.[1]?.trim()
}

function extractCdata(xml: string, tag: string): string | undefined {
  const m = xml.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i')
  )
  return m?.[1]?.trim()
}

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'))
  return m?.[1]
}

// description HTML 안의 img src 추출 (Google News RSS 전용)
function extractImgSrc(html: string): string | undefined {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m?.[1]
}

function cleanText(text: string): string {
  return text
    // CDATA 마커 제거
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    // 엔티티 인코딩된 HTML 태그 제거 (&lt;ol&gt; 등)
    .replace(/&lt;[^&]*?(?:&gt;|>)/g, '')
    .replace(/&lt;\/[^&]*?(?:&gt;|>)/g, '')
    // 실제 HTML 태그 제거
    .replace(/<[^>]+>/g, '')
    // HTML 엔티티 디코딩
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\s+/g, ' ')
    .trim()
}

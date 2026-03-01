import { load } from 'cheerio'
import { fetchWithRetry } from '@/lib/fetcher'
import { logCrawl } from '@/lib/crawlLogger'
import type { NewsItem, NewsCategory } from '@/types/news'
import { stableId, toIso, guessCategory, cleanSummary } from './utils'

// 네이버 뉴스 섹션 ID
const NAVER_SECTION: Record<string, string> = {
  정치: '100',
  경제: '101',
  사회: '102',
  세계: '104',
  'IT/과학': '105',
  연예: '106',
  스포츠: '107',
}

const BASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://news.naver.com/',
}

// ─── 섹션 HTML 크롤링 (이미지 포함) ─────────────────────
export async function fetchNaverSection(
  category: NewsCategory,
  limit = 15
): Promise<NewsItem[]> {
  const start = Date.now()
  const sid = NAVER_SECTION[category] ?? '102'
  const url = `https://news.naver.com/section/${sid}`

  try {
    const html = await fetchWithRetry(url, { timeout: 10000, headers: BASE_HEADERS })
    const $ = load(html)
    const items: NewsItem[] = []

    $('.sa_item').each((_, el) => {
      if (items.length >= limit) return false

      // 제목 + 링크
      const titleEl = $(el).find('.sa_text_title')
      const title = titleEl.text().trim()
      const link =
        $(el).find('a.sa_thumb_link').attr('href') ||
        titleEl.closest('a').attr('href') ||
        titleEl.parent('a').attr('href')

      if (!title || !link || title.length < 4) return

      // 이미지: 썸네일 링크(a.sa_thumb_link) 내부 img 우선 탐색 → 전체 img fallback
      // data:... 인라인 플레이스홀더는 제외하고 실제 HTTP URL만 사용
      const pickSrc = (sel: string) => {
        const ds = $(el).find(sel).attr('data-src') ?? ''
        const s  = $(el).find(sel).attr('src') ?? ''
        const candidate = (!ds.startsWith('data:') && ds) || (!s.startsWith('data:') && s) || ''
        return candidate || undefined
      }
      let imgSrc =
        pickSrc('a.sa_thumb_link img') ??
        pickSrc('.sa_thumb img, .sa_thumb_inner') ??
        pickSrc('img')

      // 프로토콜 상대 URL(//...) → https 보완
      if (imgSrc?.startsWith('//')) imgSrc = `https:${imgSrc}`

      // pstatic.net 이미지는 원본 크기로 변환
      if (imgSrc?.includes('pstatic.net') && imgSrc.includes('?type=')) {
        imgSrc = imgSrc.replace(/\?type=.*$/, '?type=w647')
      }

      const press = $(el).find('.sa_text_press').text().trim() || '네이버뉴스'

      // 날짜: 여러 셀렉터 순서대로 시도 (datetime 속성 → 텍스트 순)
      const dateText =
        $(el).find('[data-published-time]').attr('data-published-time') ||
        $(el).find('[datetime]').attr('datetime') ||
        $(el).find('.sa_text_datetime_bullet, .sa_date, .date, .info_date, .article_date, time').first().text().trim() ||
        ''

      const summary = cleanSummary($(el).find('.sa_text_lede, .sa_desc, .lede').text())

      const publishedAt = toIso(dateText || undefined)
      if (items.length === 0) console.log(`[Naver:${category}] dateText 샘플="${dateText}" → ${publishedAt}`)

      items.push({
        id: stableId(link, 'n'),
        title,
        summary,
        url: link,
        source: 'naver',
        sourceName: press,
        category: guessCategory(title) ?? category,
        publishedAt,
        collectedAt: new Date().toISOString(),
        thumbnail: imgSrc?.startsWith('http') ? imgSrc : undefined,
      })
    })

    logCrawl({
      source: 'naver',
      method: 'firecrawl',
      collected: items.length,
      deduplicated: items.length,
      filtered: 0,
      failed: 0,
      duration_ms: Date.now() - start,
    })

    return items
  } catch (err) {
    logCrawl({
      source: 'naver',
      method: 'firecrawl',
      collected: 0,
      deduplicated: 0,
      filtered: 0,
      failed: 1,
      duration_ms: Date.now() - start,
    })
    console.error(`[Naver:${category}] 섹션 크롤링 실패:`, err)
    return []
  }
}

// ─── 여러 카테고리 수집 ───────────────────────────────────
export async function fetchNaverRss(limit = 10): Promise<NewsItem[]> {
  const categories: NewsCategory[] = ['경제', '사회', '정치', 'IT/과학']
  const perCat = Math.ceil(limit / categories.length)

  const results = await Promise.allSettled(
    categories.map((cat) => fetchNaverSection(cat, perCat))
  )

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

// ─── 많이 본 뉴스 랭킹 ───────────────────────────────────
export async function fetchNaverRanking(limit = 20): Promise<NewsItem[]> {
  const start = Date.now()
  const url = 'https://news.naver.com/main/ranking/popularDay.naver'

  try {
    const html = await fetchWithRetry(url, { timeout: 10000, headers: BASE_HEADERS })
    const $ = load(html)
    const items: NewsItem[] = []

    $('li.rankingnews_list_item, .ct_li').each((_, el) => {
      if (items.length >= limit) return false

      const anchor = $(el).find('a').first()
      const title = anchor.text().trim()
      const href = anchor.attr('href') ?? ''
      const ds2 = $(el).find('img').attr('data-src') ?? ''
      const s2  = $(el).find('img').attr('src') ?? ''
      let imgSrc = (!ds2.startsWith('data:') && ds2) || (!s2.startsWith('data:') && s2) || undefined
      if (imgSrc?.startsWith('//')) imgSrc = `https:${imgSrc}`
      const url = href.startsWith('http') ? href : `https://news.naver.com${href}`

      if (title && href) {
        items.push({
          id: stableId(url, 'n'),
          title,
          url,
          source: 'naver',
          sourceName: $(el).find('.press, .info_group em').first().text().trim() || '네이버뉴스',
          category: guessCategory(title),
          publishedAt: new Date().toISOString(),
          collectedAt: new Date().toISOString(),
          thumbnail: imgSrc?.startsWith('http') ? imgSrc : undefined,
        })
      }
    })

    if (items.length === 0) return fetchNaverSection('사회', limit)

    logCrawl({
      source: 'naver',
      method: 'firecrawl',
      collected: items.length,
      deduplicated: items.length,
      filtered: 0,
      failed: 0,
      duration_ms: Date.now() - start,
    })

    return items
  } catch {
    return fetchNaverSection('사회', limit)
  }
}

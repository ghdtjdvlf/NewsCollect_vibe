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

// ─── 개별 기사 페이지에서 발행시간 추출 ──────────────────
async function fetchNaverArticleDate(articleUrl: string): Promise<string | null> {
  try {
    const html = await fetchWithRetry(articleUrl, {
      timeout: 6000,
      headers: { ...BASE_HEADERS, Referer: 'https://news.naver.com/' },
    })
    const $ = load(html)
    // data-date-time="2026-02-28 09:41:10" (KST)
    const dateTime = $('._ARTICLE_DATE_TIME').attr('data-date-time')
    if (dateTime) {
      return new Date(dateTime.replace(' ', 'T') + '+09:00').toISOString()
    }
    return null
  } catch {
    return null
  }
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
    const noDateIndices: number[] = []

    $('.sa_item').each((_, el) => {
      if (items.length >= limit) return false

      // _SECTION_HEADLINE 아이템은 날짜 없음 → 스킵, AI추천 기사만 수집
      if ($(el).hasClass('_SECTION_HEADLINE')) return

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

      // 날짜: sa_text_datetime에서 추출 ("9분전", "1시간전" 등)
      const dateText =
        $(el).find('.sa_text_datetime').first().text().trim() ||
        $(el).find('[data-published-time]').attr('data-published-time') ||
        $(el).find('[datetime]').attr('datetime') ||
        ''

      const summary = cleanSummary($(el).find('.sa_text_lede, .sa_desc, .lede').text())
      const hasDate = dateText.trim().length > 0

      const idx = items.length
      items.push({
        id: stableId(link, 'n'),
        title,
        summary,
        url: link,
        source: 'naver',
        sourceName: press,
        category: guessCategory(title) ?? category,
        publishedAt: hasDate ? toIso(dateText) : new Date().toISOString(),
        collectedAt: new Date().toISOString(),
        thumbnail: imgSrc?.startsWith('http') ? imgSrc : undefined,
      })

      // 날짜 없는 기사는 개별 페이지에서 날짜 보완 대기
      if (!hasDate) noDateIndices.push(idx)
    })

    // 날짜 없는 기사: 개별 페이지에서 병렬 보완 (최대 8개)
    if (noDateIndices.length > 0) {
      const targets = noDateIndices.slice(0, 8)
      const results = await Promise.allSettled(
        targets.map(i => fetchNaverArticleDate(items[i].url))
      )
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          items[targets[i]].publishedAt = r.value
        }
      })
      console.log(`[Naver:${category}] 날짜 보완 ${targets.length}건 → 성공 ${results.filter(r => r.status === 'fulfilled' && r.value).length}건`)
    }

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

import { load } from 'cheerio'
import { fetchWithRetry } from '@/lib/fetcher'
import { logCrawl } from '@/lib/crawlLogger'
import type { NewsItem, NewsCategory } from '@/types/news'
import { stableId, toIso, guessCategory, cleanSummary } from './utils'

// 다음 뉴스 섹션 경로
const DAUM_SECTION: Partial<Record<NewsCategory, string>> = {
  경제: 'economy',
  사회: 'society',
  정치: 'politics',
  연예: 'entertain',
  스포츠: 'sports',
  세계: 'foreign',
}

const BASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://news.daum.net/',
}

// picture > source[srcset]에서 실제 이미지 URL 추출
function extractDaumImg(srcset: string): string | undefined {
  if (!srcset) return undefined
  // srcset에서 fname= 파라미터로 원본 URL 추출
  const fnameMatch = srcset.match(/fname=(https?[^&\s]+)/)
  if (fnameMatch) {
    try {
      return decodeURIComponent(fnameMatch[1])
    } catch {
      return fnameMatch[1]
    }
  }
  // fname이 없으면 첫 번째 URL
  const first = srcset.split(',')[0].trim().split(' ')[0]
  return first.startsWith('//') ? `https:${first}` : first || undefined
}

// ─── 섹션 HTML 크롤링 (이미지 포함) ─────────────────────
export async function fetchDaumSection(
  category: NewsCategory,
  limit = 15
): Promise<NewsItem[]> {
  const start = Date.now()
  const path = DAUM_SECTION[category] ?? 'society'
  const url = `https://news.daum.net/${path}`

  try {
    const html = await fetchWithRetry(url, { timeout: 10000, headers: BASE_HEADERS })
    const $ = load(html)
    const items: NewsItem[] = []

    // 헤드라인 (a.item_newsheadline2) + 일반 목록 (.list_news2 li, .list_news li)
    $('a.item_newsheadline2, .list_news2 .item_issue2 a, .list_news .item_issue a').each((_, el) => {
      if (items.length >= limit) return false

      const title = $(el).find('.tit_txt, strong').text().trim()
      const link = $(el).attr('href') || $(el).find('a').first().attr('href') || ''

      if (!title || !link || title.length < 4) return

      const srcset = $(el).find('picture source').first().attr('srcset') || ''
      const imgFromSrcset = extractDaumImg(srcset)
      // picture>source가 없을 때 img 태그 fallback (data: 인라인 플레이스홀더 제외)
      const ds = $(el).find('img').attr('data-src') ?? ''
      const s  = $(el).find('img').attr('src') ?? ''
      let imgFromTag = (!ds.startsWith('data:') && ds) || (!s.startsWith('data:') && s) || ''
      if (imgFromTag.startsWith('//')) imgFromTag = `https:${imgFromTag}`
      const imgSrc = imgFromSrcset || (imgFromTag.startsWith('http') ? imgFromTag : undefined)

      // v.daum.net URL은 그대로 사용 (리다이렉트 없음)
      const fullUrl = link.startsWith('http') ? link : `https://news.daum.net${link}`

      // 날짜: 여러 셀렉터 순서대로 시도
      let dateText =
        $(el).find('[data-published-time]').attr('data-published-time') ||
        $(el).find('[datetime]').attr('datetime') ||
        $(el).find('.info_view, .txt_time, .date, .info_date, time').first().text().trim() ||
        ''
      // .txt_info 중 시간 관련 텍스트 추출 (예: "46분 전", "1시간 전")
      if (!dateText) {
        $(el).find('.txt_info').each((_, span) => {
          const t = $(span).text().trim()
          if (/\d+분 전|\d+시간 전|어제|방금|\d+일 전|\d{4}\./.test(t)) {
            dateText = t
            return false
          }
        })
      }
      const summary = cleanSummary($(el).find('.desc_txt, .desc, .tit_desc, .news_desc').text())

      items.push({
        id: stableId(fullUrl, 'd'),
        title,
        summary,
        url: fullUrl,
        source: 'daum',
        sourceName: $(el).find('.info_cp, .txt_cp').text().trim() || '다음뉴스',
        category: guessCategory(title) ?? category,
        publishedAt: dateText ? toIso(dateText) : new Date().toISOString(),
        collectedAt: new Date().toISOString(),
        thumbnail: imgSrc,
      })
    })

    logCrawl({
      source: 'daum',
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
      source: 'daum',
      method: 'firecrawl',
      collected: 0,
      deduplicated: 0,
      filtered: 0,
      failed: 1,
      duration_ms: Date.now() - start,
    })
    console.error(`[Daum:${category}] 크롤링 실패:`, err)
    return []
  }
}

// ─── 여러 카테고리 수집 (기존 fetchDaumRss 대체) ─────────
export async function fetchDaumRss(
  categories: NewsCategory[] = ['경제', '사회', '정치'],
  limitPerCategory = 10
): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    categories.map((cat) => fetchDaumSection(cat, limitPerCategory))
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

// ─── 다음 실시간 이슈 키워드 ─────────────────────────────
export async function fetchDaumHotIssues(): Promise<string[]> {
  try {
    const html = await fetchWithRetry('https://news.daum.net/', {
      timeout: 8000,
      headers: BASE_HEADERS,
    })
    const $ = load(html)
    const keywords: string[] = []

    $('a.link_issue, .issue_list a, .realtime_issue a, .hot_issue a').each((_, el) => {
      const text = $(el).text().trim()
      if (text && text.length > 1 && text.length < 20) keywords.push(text)
    })

    return [...new Set(keywords)].slice(0, 20)
  } catch (err) {
    console.error('[Daum] 이슈 키워드 실패:', err)
    return []
  }
}

export { guessCategory }

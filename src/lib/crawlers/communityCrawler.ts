import { load } from 'cheerio'
import { fetchWithRetry } from '@/lib/fetcher'
import { logCrawl } from '@/lib/crawlLogger'
import type { CommunityMention, CommunitySource } from '@/types/news'
import { randomId } from './utils'

export interface CommunityPost {
  source: CommunitySource
  postTitle: string
  postUrl: string
  commentCount: number
  viewCount: number
  keywords: string[]
}

// ─── 디시인사이드 실시간 베스트 ───────────────────────────
export async function fetchDcinsideBest(limit = 30): Promise<CommunityPost[]> {
  const start = Date.now()
  const urls = [
    'https://gall.dcinside.com/board/lists/?id=dcbest',
    'https://www.dcinside.com/index.php',
  ]

  for (const url of urls) {
    try {
      const html = await fetchWithRetry(url, {
        timeout: 8000,
        headers: {
          Referer: 'https://www.dcinside.com/',
          Cookie: 'DCID=1',
        },
      })

      const $ = load(html)
      const posts: CommunityPost[] = []

      // 디시 베스트 게시글 파싱
      $('tr.ub-content, .gall_list tr, tr[data-no]').each((_, el) => {
        if (posts.length >= limit) return false

        const titleEl = $(el).find('.gall_tit a:not(.reply_num), .ub-word')
        const title = titleEl.text().trim()
        const href = titleEl.attr('href') ?? ''
        const commentText = $(el).find('.reply_num, .gall_comment').text().replace(/\D/g, '')
        const viewText = $(el).find('.gall_count').text().replace(/\D/g, '')

        if (!title || title.length < 3) return

        const fullUrl = href.startsWith('http')
          ? href
          : `https://gall.dcinside.com${href}`

        posts.push({
          source: 'dcinside',
          postTitle: title,
          postUrl: fullUrl,
          commentCount: parseInt(commentText) || 0,
          viewCount: parseInt(viewText) || 0,
          keywords: extractKeywords(title),
        })
      })

      if (posts.length > 0) {
        logCrawl({
          source: 'dcinside',
          method: 'playwright',
          collected: posts.length,
          deduplicated: posts.length,
          filtered: posts.length,
          failed: 0,
          duration_ms: Date.now() - start,
        })
        return posts
      }
    } catch (err) {
      console.error('[DC] 파싱 실패:', err)
    }
  }

  logCrawl({
    source: 'dcinside',
    method: 'playwright',
    collected: 0,
    deduplicated: 0,
    filtered: 0,
    failed: 1,
    duration_ms: Date.now() - start,
  })
  return []
}

// ─── 에펨코리아 인기글 ────────────────────────────────────
export async function fetchFmkoreaBest(limit = 30): Promise<CommunityPost[]> {
  const start = Date.now()

  try {
    const html = await fetchWithRetry('https://www.fmkorea.com/best', {
      timeout: 8000,
      headers: { Referer: 'https://www.fmkorea.com/' },
    })

    const $ = load(html)
    const posts: CommunityPost[] = []

    $('li.li_best, .fm_best_widget ul li, table.bd_lst tr').each((_, el) => {
      if (posts.length >= limit) return false

      const titleEl = $(el).find('a.hotdeal_var8, a.title, .title a, td.title a').first()
      const title = titleEl.text().trim()
      const href = titleEl.attr('href') ?? ''
      const commentText = $(el).find('.num_comment, .comment_count').text().replace(/\D/g, '')
      const viewText = $(el).find('.num_hit, .hit').text().replace(/\D/g, '')

      if (!title || title.length < 3) return

      const fullUrl = href.startsWith('http') ? href : `https://www.fmkorea.com${href}`

      posts.push({
        source: 'fmkorea',
        postTitle: title,
        postUrl: fullUrl,
        commentCount: parseInt(commentText) || 0,
        viewCount: parseInt(viewText) || 0,
        keywords: extractKeywords(title),
      })
    })

    logCrawl({
      source: 'fmkorea',
      method: 'playwright',
      collected: posts.length,
      deduplicated: posts.length,
      filtered: posts.length,
      failed: 0,
      duration_ms: Date.now() - start,
    })

    return posts
  } catch (err) {
    logCrawl({
      source: 'fmkorea',
      method: 'playwright',
      collected: 0,
      deduplicated: 0,
      filtered: 0,
      failed: 1,
      duration_ms: Date.now() - start,
    })
    console.error('[FMKorea] 실패:', err)
    return []
  }
}

// ─── 클리앙 인기게시물 ────────────────────────────────────
export async function fetchClienBest(limit = 30): Promise<CommunityPost[]> {
  const start = Date.now()

  try {
    const html = await fetchWithRetry('https://www.clien.net/service/board/cm_allmovie?sort=popular&po=0', {
      timeout: 8000,
      headers: { Referer: 'https://www.clien.net/' },
    })

    const $ = load(html)
    const posts: CommunityPost[] = []

    // 클리앙 인기 게시글
    $('div.list_item, .post_subject, a.subject_fixed').each((_, el) => {
      if (posts.length >= limit) return false

      const titleEl = $(el).is('a') ? $(el) : $(el).find('a.subject_fixed, a.list_subject')
      const title = titleEl.text().trim()
      const href = titleEl.attr('href') ?? ''
      const commentText = $(el).find('.list_reply_cnt, .comment_count').text().replace(/\D/g, '')
      const viewText = $(el).find('.list_hit, .view_count').text().replace(/\D/g, '')

      if (!title || title.length < 3) return

      const fullUrl = href.startsWith('http') ? href : `https://www.clien.net${href}`

      posts.push({
        source: 'clien',
        postTitle: title,
        postUrl: fullUrl,
        commentCount: parseInt(commentText) || 0,
        viewCount: parseInt(viewText) || 0,
        keywords: extractKeywords(title),
      })
    })

    logCrawl({
      source: 'clien',
      method: 'playwright',
      collected: posts.length,
      deduplicated: posts.length,
      filtered: posts.length,
      failed: 0,
      duration_ms: Date.now() - start,
    })

    return posts
  } catch (err) {
    logCrawl({
      source: 'clien',
      method: 'playwright',
      collected: 0,
      deduplicated: 0,
      filtered: 0,
      failed: 1,
      duration_ms: Date.now() - start,
    })
    console.error('[Clien] 실패:', err)
    return []
  }
}

// ─── 전체 커뮤니티 수집 ───────────────────────────────────
export async function fetchAllCommunities(): Promise<CommunityPost[]> {
  const [dc, fm, clien] = await Promise.allSettled([
    fetchDcinsideBest(),
    fetchFmkoreaBest(),
    fetchClienBest(),
  ])

  return [
    ...(dc.status === 'fulfilled' ? dc.value : []),
    ...(fm.status === 'fulfilled' ? fm.value : []),
    ...(clien.status === 'fulfilled' ? clien.value : []),
  ]
}

// ─── CommunityMention 변환 ────────────────────────────────
export function toMention(post: CommunityPost): CommunityMention {
  return {
    source: post.source,
    postTitle: post.postTitle,
    postUrl: post.postUrl,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    collectedAt: new Date().toISOString(),
  }
}

// ─── 키워드 추출 ──────────────────────────────────────────
function extractKeywords(title: string): string[] {
  // 불용어 제거 후 2글자 이상 단어 추출
  const stopWords = new Set([
    '이', '가', '을', '를', '의', '에', '에서', '은', '는', '이다', '있다',
    '하다', '했다', '했습니다', '합니다', '입니다', '인데', '이고', '으로',
    '때문에', '대한', '위한', '관련', '현재', '오늘', '내일', '어제',
    'ㄷㄷ', 'ㅋㅋ', 'ㄴㄴ', 'ㅠㅠ', '진짜', '정말', '완전', '너무',
  ])

  return title
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w))
    .slice(0, 8)
}

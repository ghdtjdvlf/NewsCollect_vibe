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

        // .ub-word는 span이라 href 없음 → a 태그만 명시적으로 선택
        const titleEl = $(el).find('.gall_tit a:not(.reply_num)').first()
        const title = titleEl.text().trim()
        const href = titleEl.attr('href') ?? ''
        const commentText = $(el).find('.reply_num, .gall_comment').text().replace(/\D/g, '')
        const viewText = $(el).find('.gall_count').text().replace(/\D/g, '')

        // href가 비어있거나 javascript: 링크이면 skip
        if (!title || title.length < 3 || !href || href.startsWith('javascript:')) return

        // 상대 경로 처리: /board/view/... 또는 ?no=... 형태
        let fullUrl: string
        if (href.startsWith('http')) {
          fullUrl = href
        } else if (href.startsWith('/')) {
          fullUrl = `https://gall.dcinside.com${href}`
        } else if (href.startsWith('?')) {
          fullUrl = `https://gall.dcinside.com/board/view/${href}`
        } else {
          fullUrl = `https://gall.dcinside.com/${href}`
        }

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
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.fmkorea.com/',
        Cookie: 'fm_visited=1',
      },
    })

    const $ = load(html)
    const posts: CommunityPost[] = []

    // 실제 구조: <li><h3><a href="/best/ID">제목 [댓글수]</a></h3></li>
    $('li').each((_, el) => {
      if (posts.length >= limit) return false

      const titleEl = $(el).find('h3 > a').first()
      const titleRaw = titleEl.text().trim()
      const href = titleEl.attr('href') ?? ''

      if (!titleRaw || !href.startsWith('/best/')) return

      // 제목 끝 [N] 에서 댓글 수 추출
      const commentMatch = titleRaw.match(/\[(\d+)\]\s*$/)
      const commentCount = commentMatch ? parseInt(commentMatch[1]) : 0
      const title = titleRaw.replace(/\s*\[\d+\]\s*$/, '').trim()

      if (!title || title.length < 3) return

      posts.push({
        source: 'fmkorea',
        postTitle: title,
        postUrl: `https://www.fmkorea.com${href}`,
        commentCount,
        viewCount: 0,
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

// ─── 불용어 ───────────────────────────────────────────────
const STOP_WORDS = new Set([
  // 조사/어미
  '이', '가', '을', '를', '의', '에', '에서', '은', '는', '으로', '로',
  '와', '과', '이나', '나', '도', '만', '부터', '까지', '조차', '마저',
  '보다', '처럼', '같이', '만큼', '이라', '라고', '이라고',
  // 동사/형용사 어간
  '이다', '있다', '없다', '하다', '되다', '되어', '했다', '한다',
  '했습니다', '합니다', '입니다', '인데', '이고', '이며', '이지',
  '한다고', '했다고', '된다', '된다고',
  // 부사/관형사
  '때문에', '대한', '위한', '관련', '현재', '오늘', '내일', '어제',
  '이것', '그것', '저것', '이번', '그번', '어떤', '이런', '그런',
  '모든', '여러', '각각', '최근', '지금', '여기', '거기', '그리고',
  '하지만', '그러나', '따라서', '그래서', '또한', '만약', '비록',
  '아직', '이미', '다시', '또', '더', '가장', '매우', '너무',
  // 인터넷 슬랭
  'ㄷㄷ', 'ㅋㅋ', 'ㄴㄴ', 'ㅠㅠ', 'ㅎㅎ', 'ㄱㄱ', '진짜', '정말', '완전',
  '레전드', '개웃김', '헐', '대박', '실화', '팩트', '인정', '동의',
])

// ─── 키워드 추출 (단어 + 바이그램) ──────────────────────
export function extractKeywords(title: string): string[] {
  const words = title
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))

  // 바이그램: 인접한 두 단어 조합 (복합 고유명사 포함)
  const bigrams: string[] = []
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`)
  }

  return [...new Set([...words, ...bigrams])].slice(0, 14)
}

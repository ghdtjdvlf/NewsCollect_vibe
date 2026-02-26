'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, MessageSquare, TrendingUp, ExternalLink, Eye, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { NewsItem } from '@/types/news'

// ── 모듈 레벨 직렬 큐: 동시 Gemini 호출 방지 ──────────────
let _summarizeQueue: Promise<void> = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = _summarizeQueue.then(fn)
  _summarizeQueue = p.then(() => {}, () => {})
  return p
}

const cardTransition = { ease: 'easeIn', duration: 0.2 }

interface NewsCardProps {
  item: NewsItem
  className?: string
  expandedId?: string | null
  onExpand?: (id: string | null) => void
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

const CATEGORY_COLORS: Record<string, string> = {
  경제: 'bg-blue-50 text-blue-600',
  사건사고: 'bg-red-50 text-red-600',
  사회: 'bg-green-50 text-green-600',
  정치: 'bg-amber-50 text-amber-600',
  세계: 'bg-cyan-50 text-cyan-600',
  'IT/과학': 'bg-violet-50 text-violet-600',
  연예: 'bg-pink-50 text-pink-600',
  스포츠: 'bg-orange-50 text-orange-600',
  기타: 'bg-gray-50 text-gray-500',
}

const CATEGORY_THUMB_BG: Record<string, string> = {
  경제: 'from-blue-400 to-blue-600',
  사건사고: 'from-red-400 to-red-600',
  사회: 'from-green-400 to-green-600',
  정치: 'from-amber-400 to-amber-600',
  세계: 'from-cyan-400 to-cyan-600',
  'IT/과학': 'from-violet-400 to-violet-600',
  연예: 'from-pink-400 to-pink-600',
  스포츠: 'from-orange-400 to-orange-600',
  기타: 'from-gray-300 to-gray-500',
}

// 썸네일 + description 메모리 캐시 (최대 300개)
const thumbCache = new Map<string, { thumbnail: string | null; description: string | null }>()

export function NewsCard({ item, className, expandedId, onExpand }: NewsCardProps) {
  const controlledExpanded = expandedId !== undefined ? expandedId === item.id : undefined
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded

  // 썸네일
  const [lazyThumb, setLazyThumb] = useState<string | null>(null)
  const [lazyDesc, setLazyDesc] = useState<string | null>(null)
  const [thumbLoading, setThumbLoading] = useState(false)
  // 브라우저 이미지 로드 실패 (핫링크 차단 등)
  const [imgFailed, setImgFailed] = useState(false)

  // AI 3줄 요약
  const [summaryLines, setSummaryLines] = useState<string[] | null>(null)
  const [summaryConclusion, setSummaryConclusion] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [retryTrigger, setRetryTrigger] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const summarizeCalledRef = useRef(false)

  // 로그 헬퍼: [Card:출처/id끝4자리] 형식
  const tag = `[Card:${item.sourceName}/${item.id.slice(-4)}]`

  // 마운트 시 초기 상태 로그
  useEffect(() => {
    console.log(`${tag} 초기상태`, {
      이미지: item.thumbnail ? `✅ ${item.thumbnail.slice(0, 60)}...` : '❌ 없음',
      본문: item.summary ? `✅ ${item.summary.slice(0, 40)}...` : '❌ 없음',
      링크: item.url ? `✅ ${item.url.slice(0, 60)}` : '❌ 없음',
      제목: item.title.slice(0, 30),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const collapse = useCallback(() => {
    if (onExpand) onExpand(null)
    else setInternalExpanded(false)
  }, [onExpand])

  function handleToggle() {
    if (onExpand) onExpand(isExpanded ? null : item.id)
    else setInternalExpanded((v) => !v)
  }

  // 카드 열릴 때 3줄 요약 자동 실행
  useEffect(() => {
    if (!isExpanded) return
    if (summarizeCalledRef.current) return
    summarizeCalledRef.current = true

    // 배치에서 미리 embed된 summaryLines가 있으면 API 호출 생략
    if (item.summaryLines && item.summaryLines.length > 0) {
      console.log(`${tag} 요약 캐시(embed) 사용 ✅ ${item.summaryLines.length}줄`)
      setSummaryLines(item.summaryLines)
      setSummaryConclusion(item.conclusion ?? null)
      return
    }

    setSummaryLoading(true)
    setSummaryError('')

    console.log(`${tag} 요약요청 →`, item.url.slice(0, 60))

    enqueue(async () => {
      const r = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, title: item.title, summary: item.summary ?? lazyDesc, url: item.url }),
      })
      const data: { lines?: string[]; conclusion?: string; error?: string } = await r.json()

      if (data.lines && data.lines.length > 0) {
        console.log(`${tag} 요약성공 ✅ ${data.lines.length}줄`)
        setSummaryLines(data.lines)
        setSummaryConclusion(data.conclusion ?? null)
      } else if (r.status === 429) {
        console.warn(`${tag} 429 → 3초 후 자동 재시도`)
        setSummaryError('잠시 후 자동으로 재시도합니다...')
        summarizeCalledRef.current = false
        setTimeout(() => setRetryTrigger((t) => t + 1), 3000)
      } else {
        const err = data.error ?? '요약에 실패했습니다.'
        console.warn(`${tag} 요약실패 ❌`, err)
        setSummaryError(err)
      }
    })
      .catch((e) => {
        console.error(`${tag} 요약네트워크오류 ❌`, e)
        setSummaryError('네트워크 오류가 발생했습니다.')
      })
      .finally(() => setSummaryLoading(false))
  }, [isExpanded, retryTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // 열린 카드가 뷰포트에서 완전히 사라지면 자동 닫힘
  useEffect(() => {
    if (!isExpanded) return
    const el = wrapRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => { if (!entries[0].isIntersecting) collapse() },
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isExpanded, collapse])

  // 썸네일 + description lazy load
  useEffect(() => {
    const cached = thumbCache.get(item.id)
    if (cached !== undefined) {
      setLazyThumb(cached.thumbnail)
      setLazyDesc(cached.description)
      return
    }
    if (item.thumbnail && item.summary) return

    const el = wrapRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        observer.disconnect()
        setThumbLoading(true)

        console.log(`${tag} 썸네일fetch →`, item.url.slice(0, 60))
        fetch(`/api/thumbnail?url=${encodeURIComponent(item.url)}`)
          .then((r) => r.json())
          .then((data: { thumbnail: string | null; description: string | null }) => {
            const result = { thumbnail: data.thumbnail ?? null, description: data.description ?? null }
            console.log(`${tag} 썸네일fetch결과`, {
              이미지: result.thumbnail ? `✅ ${result.thumbnail.slice(0, 60)}` : '❌ 없음',
              본문: result.description ? `✅ ${result.description.slice(0, 40)}...` : '❌ 없음',
            })
            if (thumbCache.size >= 300) {
              const firstKey = thumbCache.keys().next().value
              if (firstKey) thumbCache.delete(firstKey)
            }
            thumbCache.set(item.id, result)
            setLazyThumb(result.thumbnail)
            setLazyDesc(result.description)
          })
          .catch((e) => {
            console.error(`${tag} 썸네일fetch실패 ❌`, e)
            thumbCache.set(item.id, { thumbnail: null, description: null })
          })
          .finally(() => setThumbLoading(false))
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [item.id, item.url, item.thumbnail, item.summary])

  // 이미지 로드 성공
  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const src = (e.target as HTMLImageElement).src
    console.log(`${tag} 이미지로드 ✅`, src.slice(0, 80))
  }

  // 이미지 로드 실패 → gradient fallback + 캐시 무효화
  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    const src = (e.target as HTMLImageElement).src
    console.warn(`${tag} 이미지로드실패 ❌ proxy:`, src.slice(0, 80))
    setImgFailed(true)
    const cached = thumbCache.get(item.id)
    if (cached) thumbCache.set(item.id, { ...cached, thumbnail: null })
  }

  // 알려진 기본/플레이스홀더 이미지 URL 감지
  const isGenericThumb = (src: string | null | undefined): boolean => {
    if (!src) return false
    return (
      src.includes('J6_coFbogx') ||                    // Google News 기본
      src.includes('og_image_default') ||               // Naver 기본 og:image
      src.includes('/static.news/image/news/ogtag/') || // Naver ogtag (로고/기본)
      src.includes('noimage') ||                        // 공통 no-image 패턴
      src.includes('no_image') ||
      src.includes('noimge')                            // 오타 변종
    )
  }

  const rawThumb = item.thumbnail ?? lazyThumb
  const thumbnail = imgFailed || isGenericThumb(rawThumb) ? null : rawThumb
  const bodyText = item.summary || lazyDesc
  const thumbGradient = CATEGORY_THUMB_BG[item.category] ?? CATEGORY_THUMB_BG['기타']

  return (
    <div ref={wrapRef}>
      <motion.article
        onClick={handleToggle}
        className={cn(
          'bg-white rounded-2xl overflow-hidden cursor-pointer select-none',
          'border border-gray-100 shadow-sm',
          className
        )}
        whileTap={{ scale: 0.98 }}
      >
        {/* 썸네일 */}
        {thumbnail ? (
          <div
            className="relative w-full overflow-hidden transition-[height] duration-200 ease-in"
            style={{ height: isExpanded ? 200 : 120 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/image-proxy?url=${encodeURIComponent(thumbnail)}`}
              alt={item.title}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              onLoad={handleImgLoad}
              onError={handleImgError}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
        ) : thumbLoading ? (
          <div className="shimmer h-20 w-full" />
        ) : (
          <div className={cn('w-full h-1 bg-gradient-to-r', thumbGradient)} />
        )}

        <div className="p-4 space-y-2">
          {/* 카테고리 + 출처 */}
          <div className="flex items-center gap-2">
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS['기타'])}>
              {item.category}
            </span>
            <span className="text-xs text-gray-400 font-bold">{item.sourceName}</span>
            {item.trendScore !== undefined && (
              <span className="ml-auto flex items-center gap-1 text-xs text-orange-500 font-medium">
                <TrendingUp className="w-3 h-3" />
                {item.trendScore}
              </span>
            )}
          </div>

          {/* 제목 */}
          <h2 className={cn('font-semibold text-gray-900 leading-snug', isExpanded ? 'text-base' : 'text-sm line-clamp-2')}>
            {item.title}
          </h2>

          {/* 확장 시 본문 */}
          <AnimatePresence>
            {isExpanded && bodyText && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-gray-500 leading-relaxed"
              >
                {bodyText}
              </motion.p>
            )}
          </AnimatePresence>

          {/* 메타 정보 */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(item.publishedAt)}
            </span>
            {item.commentCount !== undefined && (
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {item.commentCount.toLocaleString()}
              </span>
            )}
            {item.viewCount !== undefined && (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {item.viewCount.toLocaleString()}
              </span>
            )}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="ml-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-gray-400 hover:text-gray-600"
                  >
                    원문 <ExternalLink className="w-3 h-3" />
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* AI 3줄 요약 */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="pt-2 border-t border-indigo-50"
                onClick={(e) => e.stopPropagation()}
              >
                {summaryLoading && (
                  <p className="text-xs text-indigo-400 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    야무지게 요약 중이에요...
                  </p>
                )}
                {summaryError && !summaryLoading && (
                  <p className="text-xs text-red-400">{summaryError}</p>
                )}
                {summaryLines && (
                  <>
                    <ol className="space-y-1">
                      {summaryLines.map((line, i) => (
                        <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                          <span className="text-indigo-400 font-bold shrink-0">{i + 1}.</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ol>
                    {summaryConclusion && (
                      <div className="mt-3 px-3 py-2 bg-indigo-50 rounded-xl">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">결론</span>
                        <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">{summaryConclusion}</p>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-300 mt-1">AI가 뉴스 원문을 파악하고 요약합니다.</p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 커뮤니티 반응 */}
          <AnimatePresence>
            {isExpanded && item.communityMentions && item.communityMentions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="pt-2 border-t border-gray-100 space-y-1"
              >
                <p className="text-xs text-gray-400 mb-1">커뮤니티 반응</p>
                {item.communityMentions.slice(0, 3).map((mention, i) => (
                  <a
                    key={i}
                    href={mention.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800"
                  >
                    <span className="text-gray-300 uppercase text-[10px] w-14 shrink-0">{mention.source}</span>
                    <span className="truncate">{mention.postTitle}</span>
                    <span className="shrink-0 text-gray-300">{mention.commentCount}</span>
                  </a>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.article>
    </div>
  )
}

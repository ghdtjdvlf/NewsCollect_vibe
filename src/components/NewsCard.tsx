'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, MessageSquare, TrendingUp, ExternalLink, Eye, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { NewsItem } from '@/types/news'

const cardTransition = { ease: 'easeIn', duration: 0.2 }

interface NewsCardProps {
  item: NewsItem
  className?: string
  expandedId?: string | null
  onExpand?: (id: string | null) => void
  viewMode?: 'list' | 'grid'
}

function formatArticleDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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

// 포털별 로고 색상
const SOURCE_COLORS: Record<string, string> = {
  naver: 'bg-green-500',
  daum: 'bg-blue-500',
  google: 'bg-red-500',
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

export function NewsCard({ item, className, expandedId, onExpand, viewMode = 'list' }: NewsCardProps) {
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

  const wrapRef = useRef<HTMLDivElement>(null)
  const summarizeCalledRef = useRef(false)

  const tag = `[Card:${item.sourceName}/${item.id.slice(-4)}]`

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
      console.log(`${tag} 요약embed✅ ${item.summaryLines.length}줄`)
      setSummaryLines(item.summaryLines)
      setSummaryConclusion(item.conclusion ?? null)
      return
    }

    setSummaryLoading(true)
    setSummaryError('')
    console.log(`${tag} 요약요청`)

    fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    })
      .then((r) => r.json())
      .then((data: { lines?: string[]; conclusion?: string; error?: string }) => {
        if (data.lines && data.lines.length > 0) {
          console.log(`${tag} 요약완료 ${data.lines.length}줄`)
          setSummaryLines(data.lines)
          setSummaryConclusion(data.conclusion ?? null)
        } else {
          console.log(`${tag} 요약없음`)
        }
      })
      .catch(() => {
        console.log(`${tag} 요약오류`)
        setSummaryError('네트워크 오류가 발생했습니다.')
      })
      .finally(() => setSummaryLoading(false))
  }, [isExpanded]) // eslint-disable-line react-hooks/exhaustive-deps

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

        console.log(`${tag} 썸네일요청`)
        fetch(`/api/thumbnail?url=${encodeURIComponent(item.url)}`)
          .then((r) => r.json())
          .then((data: { thumbnail: string | null; description: string | null }) => {
            const result = { thumbnail: data.thumbnail ?? null, description: data.description ?? null }
            console.log(`${tag} 썸네일${result.thumbnail ? '✅' : '❌'}`)
            if (thumbCache.size >= 300) {
              const firstKey = thumbCache.keys().next().value
              if (firstKey) thumbCache.delete(firstKey)
            }
            thumbCache.set(item.id, result)
            setLazyThumb(result.thumbnail)
            setLazyDesc(result.description)
          })
          .catch(() => {
            console.log(`${tag} 썸네일오류`)
            thumbCache.set(item.id, { thumbnail: null, description: null })
          })
          .finally(() => setThumbLoading(false))
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [item.id, item.url, item.thumbnail, item.summary]) // eslint-disable-line react-hooks/exhaustive-deps

  // 이미지 로드 실패 → gradient fallback + 캐시 무효화
  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    console.log(`${tag} 이미지❌`)
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

  // ── 그리드 뷰 (compact 카드) ───────────────────────────
  if (viewMode === 'grid') {
    return (
      <div ref={wrapRef}>
        <motion.article
          onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
          className={cn(
            'bg-white rounded-2xl overflow-hidden cursor-pointer select-none',
            'border border-gray-100 shadow-sm',
            className
          )}
          whileTap={{ scale: 0.97 }}
          transition={cardTransition}
        >
          {/* 썸네일 */}
          {thumbnail ? (
            <div className="relative w-full h-28 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/image-proxy?url=${encodeURIComponent(thumbnail)}`}
                alt={item.title}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                onError={handleImgError}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <span className={cn('absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium', CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS['기타'])}>
                {item.category}
              </span>
            </div>
          ) : (
            <div className={cn('w-full h-16 bg-gradient-to-br flex items-end p-2', thumbGradient)}>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-medium">
                {item.category}
              </span>
            </div>
          )}
          <div className="p-2.5 space-y-1.5">
            <p className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2">{item.title}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className={cn('w-3.5 h-3.5 rounded-full flex items-center justify-center text-white shrink-0', SOURCE_COLORS[item.source] ?? 'bg-gray-400')}
                style={{ fontSize: '7px', fontWeight: 700 }}>
                {item.sourceName.slice(0, 1)}
              </span>
              <span>{item.sourceName}</span>
              <span className="ml-auto">{formatArticleDate(item.publishedAt)}</span>
            </div>
          </div>
        </motion.article>
      </div>
    )
  }

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
        transition={cardTransition}
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
            <span className={cn('w-4 h-4 rounded-full flex items-center justify-center text-white shrink-0', SOURCE_COLORS[item.source] ?? 'bg-gray-400')}
              style={{ fontSize: '8px', fontWeight: 700 }}>
              {item.sourceName.slice(0, 1)}
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
              {formatArticleDate(item.publishedAt)}
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

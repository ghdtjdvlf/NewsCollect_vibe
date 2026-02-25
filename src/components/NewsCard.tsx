'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Clock, MessageSquare, TrendingUp, ExternalLink, Eye, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { NewsItem } from '@/types/news'

function toSlug(id: string) {
  return encodeURIComponent(id)
}

// [애니메이션] 뉴스 클릭 시 통통 튀는 spring → ease-in으로 교체
const cardTransition = { ease: 'easeInOut', duration: 0.25 }

interface NewsCardProps {
  item: NewsItem
  className?: string
  // [아코디언] 부모가 현재 열린 ID를 관리
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

// 메모리 캐시 (세션 유지, 최대 300개)
const thumbCache = new Map<string, string | null>()

export function NewsCard({ item, className, expandedId, onExpand }: NewsCardProps) {
  // [아코디언] 부모가 넘겨준 expandedId 기반으로 열림 여부 결정
  const expanded = expandedId !== undefined ? expandedId === item.id : false
  const [internalExpanded, setInternalExpanded] = useState(false)
  // expandedId prop 없으면 자체 관리
  const isExpanded = expandedId !== undefined ? expanded : internalExpanded

  // [AI 3줄 요약] 상태
  const [summaryLines, setSummaryLines] = useState<string[] | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(false)
  const [summaryErrorMsg, setSummaryErrorMsg] = useState('')

  const [lazyThumb, setLazyThumb] = useState<string | null>(null)
  const [thumbLoading, setThumbLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  function handleToggle() {
    if (onExpand) {
      // 이미 열려 있으면 닫기, 아니면 열기 (다른 카드 자동 닫힘)
      onExpand(isExpanded ? null : item.id)
    } else {
      setInternalExpanded((v) => !v)
    }
  }

  async function handleSummarize(e: React.MouseEvent) {
    e.stopPropagation()
    if (summaryLines || summaryLoading) return
    setSummaryLoading(true)
    setSummaryError(false)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, summary: item.summary, url: item.url }),
      })
      const data = await res.json() as { lines?: string[]; error?: string }
      if (data.lines && data.lines.length > 0) {
        setSummaryLines(data.lines)
      } else {
        // error 메시지를 에러 상태로 저장
        setSummaryError(true)
        setSummaryErrorMsg(data.error ?? '요약에 실패했습니다.')
      }
    } catch {
      setSummaryError(true)
      setSummaryErrorMsg('네트워크 오류가 발생했습니다.')
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (item.thumbnail) return

    const cached = thumbCache.get(item.id)
    if (cached !== undefined) {
      setLazyThumb(cached)
      return
    }

    const el = wrapRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        observer.disconnect()
        setThumbLoading(true)

        fetch(`/api/thumbnail?url=${encodeURIComponent(item.url)}`)
          .then((r) => r.json())
          .then((data: { thumbnail: string | null }) => {
            const thumb = data.thumbnail ?? null
            // 캐시 크기 제한
            if (thumbCache.size >= 300) {
              const firstKey = thumbCache.keys().next().value
              if (firstKey) thumbCache.delete(firstKey)
            }
            thumbCache.set(item.id, thumb)
            setLazyThumb(thumb)
          })
          .catch(() => {
            thumbCache.set(item.id, null)
          })
          .finally(() => setThumbLoading(false))
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [item.id, item.url, item.thumbnail])

  // Google News 공통 플레이스홀더 이미지 필터링
  const isGenericGoogleThumb = (src: string | null | undefined) =>
    src?.includes('J6_coFbogx') ?? false

  const rawThumb = item.thumbnail ?? lazyThumb
  const thumbnail = isGenericGoogleThumb(rawThumb) ? null : rawThumb
  const thumbGradient = CATEGORY_THUMB_BG[item.category] ?? CATEGORY_THUMB_BG['기타']

  return (
    <div ref={wrapRef}>
      <motion.article
        layout
        layoutId={`card-${item.id}`}
        onClick={handleToggle}
        transition={cardTransition}
        className={cn(
          'bg-white rounded-2xl overflow-hidden cursor-pointer select-none',
          'border border-gray-100 shadow-sm',
          className
        )}
        whileTap={{ scale: 0.98 }}
      >
        {/* 썸네일 영역 */}
        {thumbnail ? (
          <motion.div
            layout
            className="relative w-full overflow-hidden"
            style={{ height: isExpanded ? 200 : 120 }}
            transition={cardTransition}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnail}
              alt={item.title}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </motion.div>
        ) : thumbLoading ? (
          <div className="shimmer h-20 w-full" />
        ) : (
          // 카테고리 컬러 1px 상단 스트라이프
          <div className={cn('w-full h-1 bg-gradient-to-r', thumbGradient)} />
        )}

        <div className="p-4 space-y-2">
          {/* 카테고리 + 출처 */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS['기타']
              )}
            >
              {item.category}
            </span>
            <span className="text-xs text-gray-400">{item.sourceName}</span>

            {item.trendScore !== undefined && (
              <span className="ml-auto flex items-center gap-1 text-xs text-orange-500 font-medium">
                <TrendingUp className="w-3 h-3" />
                {item.trendScore}
              </span>
            )}
          </div>

          {/* 제목 */}
          <motion.h2
            layout
            className={cn(
              'font-semibold text-gray-900 leading-snug',
              isExpanded ? 'text-base' : 'text-sm line-clamp-2'
            )}
            transition={cardTransition}
          >
            {item.title}
          </motion.h2>

          {/* 확장 시 요약 */}
          <AnimatePresence>
            {isExpanded && item.summary && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-gray-500 leading-relaxed"
              >
                {item.summary}
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

            {/* [정보 표시] 실제 조회수 연동 */}
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
                  className="ml-auto flex items-center gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* [AI 요약] '상세보기' → '3줄 요약' */}
                  <button
                    onClick={handleSummarize}
                    disabled={summaryLoading || !!summaryLines}
                    className="flex items-center gap-1 text-indigo-500 hover:text-indigo-600 disabled:opacity-50"
                  >
                    {summaryLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {summaryLoading ? '요약 중...' : summaryLines ? '요약 완료' : '3줄 요약'}
                  </button>
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

          {/* [AI 3줄 요약] 결과 표시 */}
          <AnimatePresence>
            {isExpanded && (summaryLines || summaryLoading || summaryError) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="pt-2 border-t border-indigo-50 space-y-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {summaryLoading && (
                  <p className="text-xs text-indigo-400 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    야무지게 요약 중이에요...
                  </p>
                )}
                {summaryError && (
                  <p className="text-xs text-red-400">{summaryErrorMsg || '요약에 실패했습니다.'}</p>
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
                    <p className="text-[10px] text-gray-300">AI가 뉴스 원문을 파악하고 요약합니다.</p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 커뮤니티 언급 */}
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
                    <span className="text-gray-300 uppercase text-[10px] w-14 shrink-0">
                      {mention.source}
                    </span>
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

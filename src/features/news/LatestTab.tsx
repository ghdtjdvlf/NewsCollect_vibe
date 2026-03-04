'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { NewsCard } from '@/components/NewsCard'
import { useLatestNews } from './useNewsQuery'
import type { NewsCategory, NewsResponse } from '@/types/news'
import { cn } from '@/lib/cn'

const BASE_CATEGORIES: (NewsCategory | '전체')[] = ['전체', '경제', '사건사고', '사회', '정치']

interface LatestTabProps {
  selectedCategory?: NewsCategory
  onCategoryChange?: (cat: NewsCategory | undefined) => void
}

export function LatestTab({ selectedCategory, onCategoryChange }: LatestTabProps) {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLatestNews({ category: selectedCategory })

  const sentinelRef = useRef<HTMLDivElement>(null)
  // 아코디언: 현재 펼쳐진 카드 ID
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 페이지 병합 + 중복 제거 (publishedAt 커서 충돌로 같은 기사가 두 페이지에 걸칠 수 있음)
  const allItems = useMemo(() => {
    const seen = new Set<string>()
    return (
      data?.pages
        ?.flatMap((p) => (p as NewsResponse).items ?? [])
        .filter((item) => {
          if (seen.has(item.id)) return false
          seen.add(item.id)
          return true
        }) ?? []
    )
  }, [data])

  // 로드된 아이템에서 카테고리 동적 수집 (Fix: 카테고리 태그 동기화)
  const displayCategories = useMemo(() => {
    const extra = allItems
      .map((item) => item.category)
      .filter((cat, idx, arr) => !BASE_CATEGORIES.includes(cat) && arr.indexOf(cat) === idx)
    return [...BASE_CATEGORIES, ...extra]
  }, [allItems])

  // 무한 스크롤
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  return (
    <div className="space-y-3">
      {/* 카테고리 필터 + 뷰 토글 */}
      <div className="flex items-center gap-2">
        <div
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 flex-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {displayCategories.map((cat) => {
            const isActive = cat === '전체' ? !selectedCategory : selectedCategory === cat
            return (
              <button
                key={cat}
                onClick={() => onCategoryChange?.(cat === '전체' ? undefined : cat)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  isActive ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                )}
              >
                {cat}
              </button>
            )
          })}
        </div>
        {/* 그리드/리스트 토글 */}
        <div
          className="flex gap-1 shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 rounded-lg transition-all',
              viewMode === 'list' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-400'
            )}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1.5 rounded-lg transition-all',
              viewMode === 'grid' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-400'
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 뉴스 리스트 */}
      {isLoading ? (
        Array.from({ length: viewMode === 'grid' ? 6 : 5 }).map((_, i) => (
          viewMode === 'grid' ? (
            <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
              <div className="shimmer h-28 w-full" />
              <div className="p-2.5 space-y-1.5">
                <div className="shimmer h-3.5 w-full rounded" />
                <div className="shimmer h-3 w-3/4 rounded" />
              </div>
            </div>
          ) : (
            <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
              <div className="p-4 space-y-2.5">
                <div className="flex gap-2">
                  <div className="shimmer h-5 w-14 rounded-full" />
                  <div className="shimmer h-5 w-20 rounded-full" />
                </div>
                <div className="shimmer h-4 w-full rounded" />
                <div className="shimmer h-4 w-3/4 rounded" />
                <div className="shimmer h-3 w-24 rounded" />
              </div>
            </div>
          )
        ))
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
          <span className="text-2xl">⚠️</span>
          <p className="text-sm">뉴스를 불러오지 못했습니다.</p>
          <p className="text-xs">잠시 후 다시 시도해주세요.</p>
        </div>
      ) : allItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
          <span className="text-2xl">📭</span>
          <p className="text-sm">불러올 뉴스가 없습니다.</p>
          <p className="text-xs">헤더의 ⚡ 배치실행을 눌러 뉴스를 수집해주세요.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3">
          {allItems.map((item) => (
            <NewsCard
              key={item.id}
              item={item}
              viewMode="grid"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {allItems.map((item) => (
            <NewsCard
              key={item.id}
              item={item}
              expandedId={expandedId}
              onExpand={setExpandedId}
            />
          ))}
        </div>
      )}

      {/* 무한 스크롤 센티넬 */}
      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      )}

      {!hasNextPage && allItems.length > 0 && (
        <div className="flex flex-col items-center gap-2 py-8">
          <div className="flex gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce [animation-delay:300ms]" />
          </div>
          <p className="text-xs text-gray-400 font-medium">최신 뉴스를 수집 중이에요</p>
          <p className="text-[10px] text-gray-300">5분마다 새 기사를 가져옵니다</p>
        </div>
      )}
    </div>
  )
}

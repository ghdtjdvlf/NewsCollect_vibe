'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { NewsCard } from '@/components/NewsCard'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { useTrendingNews } from './useNewsQuery'
import type { NewsCategory, TrendingPageResponse } from '@/types/news'
import { cn } from '@/lib/cn'

type SortType = 'trending' | 'latest'

const BASE_CATEGORIES: (NewsCategory | '전체')[] = ['전체', '경제', '사건사고', '사회', '정치', 'IT/과학']

export function TrendingTab() {
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTrendingNews()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory | '전체'>('전체')
  const [sort, setSort] = useState<SortType>('latest')
  const sentinelRef = useRef<HTMLDivElement>(null)

  // 페이지 병합 + 중복 제거
  const allItems = useMemo(() => {
    const seen = new Set<string>()
    return (
      data?.pages
        ?.flatMap((p) => (p as TrendingPageResponse).items ?? [])
        .filter((item) => {
          if (seen.has(item.id)) return false
          seen.add(item.id)
          return true
        }) ?? []
    )
  }, [data])

  // 로드된 아이템에서 카테고리 동적 수집
  const displayCategories = useMemo(() => {
    const extra = allItems
      .map((item) => item.category)
      .filter((cat, idx, arr) => !BASE_CATEGORIES.includes(cat) && arr.indexOf(cat) === idx)
    return [...BASE_CATEGORIES, ...extra]
  }, [allItems])

  // 필터 + 정렬
  const filteredItems = useMemo(() => {
    let items = allItems
    if (selectedCategory !== '전체') {
      items = items.filter((item) => item.category === selectedCategory)
    }
    if (sort === 'latest') {
      items = [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    }
    return items
  }, [allItems, selectedCategory, sort])

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

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
            <div className="shimmer h-24 w-full" />
            <div className="p-4 space-y-2.5">
              <div className="flex gap-2">
                <div className="shimmer h-5 w-14 rounded-full" />
                <div className="shimmer h-5 w-20 rounded-full" />
              </div>
              <div className="shimmer h-4 w-full rounded" />
              <div className="shimmer h-4 w-4/5 rounded" />
              <div className="shimmer h-3 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400">
        <p>뉴스를 불러올 수 없습니다.</p>
        <p className="text-xs mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={() => refetch()}>
      <div className="space-y-3">
        {/* 정렬 토글 */}
        <div className="flex items-center justify-between">
          <div
            className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 flex-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {displayCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  selectedCategory === cat
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          <div
            className="flex gap-1 ml-2 shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSort('latest')}
              className={cn(
                'px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
                sort === 'latest' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'
              )}
            >
              최신순
            </button>
            <button
              onClick={() => setSort('trending')}
              className={cn(
                'px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
                sort === 'trending' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'
              )}
            >
              화제순
            </button>
          </div>
        </div>

        {/* 뉴스 리스트 */}
        {filteredItems.map((item) => (
          <div key={item.id}>
            <NewsCard item={item} expandedId={expandedId} onExpand={setExpandedId} />
          </div>
        ))}

        {filteredItems.length === 0 && !isLoading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400">
            <p>화제 뉴스가 없습니다.</p>
          </div>
        )}

        {/* 무한 스크롤 센티넬 */}
        <div ref={sentinelRef} className="h-1" />

        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}

        {!hasNextPage && allItems.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-8">
            <div className="flex gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-300 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-orange-300 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-orange-300 animate-bounce [animation-delay:300ms]" />
            </div>
            <p className="text-xs text-gray-400 font-medium">최신 뉴스를 수집 중이에요</p>
            <p className="text-[10px] text-gray-300">5분마다 새 기사를 가져옵니다</p>
          </div>
        )}
      </div>
    </PullToRefresh>
  )
}

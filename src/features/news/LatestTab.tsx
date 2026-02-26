'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { NewsCard } from '@/components/NewsCard'
import { useLatestNews } from './useNewsQuery'
import type { NewsCategory } from '@/types/news'

const BASE_CATEGORIES: (NewsCategory | '전체')[] = ['전체', '경제', '사건사고', '사회', '정치']

interface LatestTabProps {
  selectedCategory?: NewsCategory
  onCategoryChange?: (cat: NewsCategory | undefined) => void
}

export function LatestTab({ selectedCategory, onCategoryChange }: LatestTabProps) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLatestNews({ category: selectedCategory })

  const sentinelRef = useRef<HTMLDivElement>(null)
  // 아코디언: 현재 펼쳐진 카드 ID
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Fix: p.items 가 undefined 일 때 flatMap 오류 방지
  const allItems = data?.pages.flatMap((p) => p.items ?? []) ?? []

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
      {/* 카테고리 필터 — pointerDown stopPropagation으로 부모 drag(탭 전환) 차단 */}
      <div
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {displayCategories.map((cat) => {
          const isActive = cat === '전체' ? !selectedCategory : selectedCategory === cat
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange?.(cat === '전체' ? undefined : cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* 뉴스 리스트 */}
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
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
        <p className="text-center text-xs text-gray-300 py-4">모든 뉴스를 불러왔습니다.</p>
      )}
    </div>
  )
}

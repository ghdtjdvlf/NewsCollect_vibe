'use client'

import { useState, useMemo } from 'react'
import { NewsCard } from '@/components/NewsCard'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { useTrendingNews } from './useNewsQuery'
import type { NewsCategory } from '@/types/news'
import { cn } from '@/lib/cn'

type SortType = 'trending' | 'latest'

const BASE_CATEGORIES: (NewsCategory | '전체')[] = ['전체', '경제', '사건사고', '사회', '정치', 'IT/과학']

export function TrendingTab() {
  const { data, isLoading, error, refetch } = useTrendingNews()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory | '전체'>('전체')
  const [sort, setSort] = useState<SortType>('trending')

  // 로드된 아이템에서 카테고리 동적 수집
  const displayCategories = useMemo(() => {
    const items = data?.items ?? []
    const extra = items
      .map((item) => item.category)
      .filter((cat, idx, arr) => !BASE_CATEGORIES.includes(cat) && arr.indexOf(cat) === idx)
    return [...BASE_CATEGORIES, ...extra]
  }, [data?.items])

  // 필터 + 정렬
  const filteredItems = useMemo(() => {
    let items = data?.items ?? []
    if (selectedCategory !== '전체') {
      items = items.filter((item) => item.category === selectedCategory)
    }
    if (sort === 'latest') {
      items = [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    }
    // trending 정렬은 서버에서 이미 trendScore 기준 내림차순
    return items
  }, [data?.items, selectedCategory, sort])

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
              onClick={() => setSort('trending')}
              className={cn(
                'px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
                sort === 'trending' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'
              )}
            >
              화제순
            </button>
            <button
              onClick={() => setSort('latest')}
              className={cn(
                'px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
                sort === 'latest' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'
              )}
            >
              최신순
            </button>
          </div>
        </div>

        {/* 뉴스 리스트 */}
        {filteredItems.map((item) => (
          <div key={item.id}>
            <NewsCard item={item} expandedId={expandedId} onExpand={setExpandedId} />
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400">
            <p>화제 뉴스가 없습니다.</p>
          </div>
        )}
      </div>
    </PullToRefresh>
  )
}

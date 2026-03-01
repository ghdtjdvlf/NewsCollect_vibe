import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { newsApi } from '@/lib/api'
import { useUIStore } from '@/stores/uiStore'
import type { FetchNewsParams, SearchParams } from '@/types/news'

const REFETCH_INTERVAL = 60 * 1000 // 60초

// ─── 화제뉴스 ─────────────────────────────────────────────
export function useTrendingNews() {
  const autoRefresh = useUIStore((s) => s.autoRefresh)
  return useQuery({
    queryKey: ['trending'],
    queryFn: newsApi.getTrending,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: autoRefresh ? REFETCH_INTERVAL : false,
    retry: 1,
  })
}

// ─── 최신뉴스 (무한 스크롤) ──────────────────────────────
export function useLatestNews(params: Omit<FetchNewsParams, 'cursor'> = {}) {
  const autoRefresh = useUIStore((s) => s.autoRefresh)
  return useInfiniteQuery({
    queryKey: ['latest', params],
    queryFn: ({ pageParam }) =>
      newsApi.getLatest({ ...params, cursor: pageParam as string | null }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: null,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: autoRefresh ? REFETCH_INTERVAL : false,
    retry: 1,
  })
}

// ─── 검색 ─────────────────────────────────────────────────
export function useSearchNews(params: SearchParams) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () => newsApi.search(params),
    enabled: params.keyword.trim().length > 0,
    staleTime: 30 * 1000,
    gcTime: 3 * 60 * 1000,
    retry: 1,
  })
}

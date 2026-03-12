import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { newsApi } from '@/lib/api'
import type { FetchNewsParams, SearchParams, TrendingPageResponse } from '@/types/news'

const REFETCH_INTERVAL = 60 * 1000 // 60초

const INITIAL_LIMIT = 100
const SCROLL_LIMIT = 5

// ─── 화제뉴스 (무한 스크롤) ──────────────────────────────
export function useTrendingNews() {
  return useInfiniteQuery({
    queryKey: ['trending-inf'],
    queryFn: ({ pageParam }) =>
      newsApi.getTrending(pageParam as number, pageParam === 0 ? INITIAL_LIMIT : SCROLL_LIMIT),
    getNextPageParam: (lastPage: TrendingPageResponse) =>
      lastPage.hasMore ? (lastPage.nextOffset ?? undefined) : undefined,
    initialPageParam: 0 as number,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: REFETCH_INTERVAL,
    retry: 1,
  })
}

// ─── 최신뉴스 (무한 스크롤) ──────────────────────────────
export function useLatestNews(params: Omit<FetchNewsParams, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: ['latest', params],
    queryFn: ({ pageParam }) =>
      newsApi.getLatest({
        ...params,
        cursor: pageParam as string | null,
        limit: pageParam === null ? INITIAL_LIMIT : SCROLL_LIMIT,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: null as string | null,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: REFETCH_INTERVAL,
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

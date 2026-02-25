import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { newsApi } from '@/lib/api'
import type { FetchNewsParams, SearchParams } from '@/types/news'

// ─── 화제뉴스 ─────────────────────────────────────────────
export function useTrendingNews() {
  return useQuery({
    queryKey: ['trending'],
    queryFn: newsApi.getTrending,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}

// ─── 최신뉴스 (무한 스크롤) ──────────────────────────────
export function useLatestNews(params: Omit<FetchNewsParams, 'page'> = {}) {
  return useInfiniteQuery({
    queryKey: ['latest', params],
    queryFn: ({ pageParam = 1 }) =>
      newsApi.getLatest({ ...params, page: pageParam as number }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 60 * 1000,
  })
}

// ─── 검색 ─────────────────────────────────────────────────
export function useSearchNews(params: SearchParams) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () => newsApi.search(params),
    enabled: params.keyword.trim().length > 0,
    staleTime: 30 * 1000,
  })
}

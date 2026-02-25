import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TabType, NewsCategory } from '@/types/news'

const MAX_HISTORY = 8

interface UIState {
  // 탭
  activeTab: TabType
  setActiveTab: (tab: TabType) => void

  // 카테고리 필터
  selectedCategory: NewsCategory | undefined
  setSelectedCategory: (cat: NewsCategory | undefined) => void

  // 실시간 자동 업데이트 토글
  autoRefresh: boolean
  setAutoRefresh: (v: boolean) => void

  // 검색 히스토리 (localStorage 영속)
  searchHistory: string[]
  addSearchHistory: (kw: string) => void
  clearSearchHistory: () => void
  removeSearchHistory: (kw: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeTab: 'trending',
      setActiveTab: (tab) => set({ activeTab: tab }),

      selectedCategory: undefined,
      setSelectedCategory: (cat) => set({ selectedCategory: cat }),

      autoRefresh: true,
      setAutoRefresh: (v) => set({ autoRefresh: v }),

      searchHistory: [],
      addSearchHistory: (kw) =>
        set((state) => ({
          searchHistory: [kw, ...state.searchHistory.filter((h) => h !== kw)].slice(0, MAX_HISTORY),
        })),
      clearSearchHistory: () => set({ searchHistory: [] }),
      removeSearchHistory: (kw) =>
        set((state) => ({
          searchHistory: state.searchHistory.filter((h) => h !== kw),
        })),
    }),
    {
      name: 'liquid-news-ui',
      // autoRefresh, searchHistory만 영속
      partialize: (state) => ({
        searchHistory: state.searchHistory,
        autoRefresh: state.autoRefresh,
      }),
      // SSR 하이드레이션 불일치 방지: 서버/클라 첫 렌더를 기본값으로 통일
      skipHydration: true,
    }
  )
)

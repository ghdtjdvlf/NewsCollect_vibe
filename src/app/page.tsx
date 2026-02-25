'use client'

import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { BlobBackground } from '@/components/ui/BlobBackground'
import { Header } from '@/components/layout/Header'
import { TabBar } from '@/components/layout/TabBar'
import { TrendingTab } from '@/features/news/TrendingTab'
import { LatestTab } from '@/features/news/LatestTab'
import { SearchTab } from '@/features/news/SearchTab'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useUIStore } from '@/stores/uiStore'
import type { TabType } from '@/types/news'

const TABS: TabType[] = ['trending', 'latest', 'search']

export default function Home() {
  const { activeTab, setActiveTab, selectedCategory, setSelectedCategory } = useUIStore()

  const tabIndex = TABS.indexOf(activeTab)
  const dragX = useMotionValue(0)
  const dragOpacity = useTransform(dragX, [-80, 0, 80], [0.6, 1, 0.6])

  function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    const threshold = 60
    if (info.offset.x < -threshold && tabIndex < TABS.length - 1) {
      setActiveTab(TABS[tabIndex + 1])
    } else if (info.offset.x > threshold && tabIndex > 0) {
      setActiveTab(TABS[tabIndex - 1])
    }
    dragX.set(0)
  }

  return (
    <>
      <BlobBackground />
      <Header />

      <motion.main
        className="relative z-10 min-h-screen pt-16 pb-24 px-4"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        style={{ opacity: dragOpacity }}
      >
        <AnimatePresence mode="wait">
          {activeTab === 'trending' && (
            <motion.div
              key="trending"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22 }}
            >
              <SectionTitle icon="🔥" title="실시간 화제뉴스" />
              <ErrorBoundary name="TrendingTab">
                <TrendingTab />
              </ErrorBoundary>
            </motion.div>
          )}

          {activeTab === 'latest' && (
            <motion.div
              key="latest"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22 }}
            >
              <SectionTitle icon="📰" title="최신뉴스" />
              <ErrorBoundary name="LatestTab">
                <LatestTab
                  selectedCategory={selectedCategory}
                  onCategoryChange={setSelectedCategory}
                />
              </ErrorBoundary>
            </motion.div>
          )}

          {activeTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22 }}
            >
              <SectionTitle icon="🔍" title="검색" />
              <ErrorBoundary name="SearchTab">
                <SearchTab />
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>

      <TabBar active={activeTab} onChange={setActiveTab} />
    </>
  )
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xl">{icon}</span>
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
    </div>
  )
}

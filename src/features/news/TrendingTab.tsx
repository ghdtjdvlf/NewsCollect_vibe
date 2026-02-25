'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { NewsCard } from '@/components/NewsCard'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { useTrendingNews } from './useNewsQuery'

export function TrendingTab() {
  const { data, isLoading, error, refetch } = useTrendingNews()
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        {data?.items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <NewsCard item={item} expandedId={expandedId} onExpand={setExpandedId} />
          </motion.div>
        ))}

        {data?.items.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400">
            <p>화제 뉴스가 없습니다.</p>
          </div>
        )}
      </motion.div>
    </PullToRefresh>
  )
}

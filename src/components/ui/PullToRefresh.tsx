'use client'

import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

interface Props {
  onRefresh: () => Promise<unknown> | void
  children: ReactNode
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const [progress, setProgress] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const { onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh({ onRefresh })

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={(e) => onTouchMove(e, setProgress)}
      onTouchEnd={() => onTouchEnd(progress, setProgress, setRefreshing)}
      className="relative"
    >
      {/* 당기기 인디케이터 */}
      {(progress > 0 || refreshing) && (
        <motion.div
          className="flex justify-center py-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div
            className={`w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-500 ${
              refreshing ? 'animate-spin' : ''
            }`}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
              opacity: Math.max(progress, refreshing ? 1 : 0),
            }}
          />
        </motion.div>
      )}
      {children}
    </div>
  )
}

'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/cn'

export function Header() {
  const { scrollY } = useScroll()
  const blur = useTransform(scrollY, [0, 60], [8, 20])
  const bg = useTransform(scrollY, [0, 60], ['rgba(255,255,255,0)', 'rgba(255,255,255,0.88)'])
  const borderOpacity = useTransform(scrollY, [0, 60], [0, 1])

  const { autoRefresh, setAutoRefresh } = useUIStore()

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 safe-top"
      style={{ backdropFilter: `blur(${blur}px)`, backgroundColor: bg }}
    >
      <motion.div className="border-b border-gray-100" style={{ opacity: borderOpacity }} />
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_text.svg" alt="딱!세줄" className="h-8 w-auto" />
        </div>

        {/* 실시간 업데이트 토글 */}
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
            autoRefresh
              ? 'bg-indigo-50 text-indigo-500'
              : 'bg-gray-100 text-gray-400'
          )}
          title={autoRefresh ? '실시간 업데이트 켜짐 (클릭하여 끄기)' : '실시간 업데이트 꺼짐 (클릭하여 켜기)'}
        >
          <RefreshCw
            className={cn('w-3.5 h-3.5', autoRefresh && 'animate-spin')}
            style={autoRefresh ? { animationDuration: '3s' } : undefined}
          />
          <span>{autoRefresh ? '실시간' : '정지'}</span>
        </button>
      </div>
    </motion.header>
  )
}

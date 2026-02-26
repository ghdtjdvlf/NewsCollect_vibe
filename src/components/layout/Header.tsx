'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { RefreshCw, Zap } from 'lucide-react'
import { useState } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/cn'

export function Header() {
  const { scrollY } = useScroll()
  const blur = useTransform(scrollY, [0, 60], [8, 20])
  const bg = useTransform(scrollY, [0, 60], ['rgba(255,255,255,0)', 'rgba(255,255,255,1)'])
  const borderOpacity = useTransform(scrollY, [0, 60], [0, 1])

  const { autoRefresh, setAutoRefresh } = useUIStore()
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchMsg, setBatchMsg] = useState('')

  async function handleBatch() {
    setBatchLoading(true)
    setBatchMsg('')
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'x-cron-secret': 'nc-batch-secret-2025' },
      })
      const data = await res.json()
      setBatchMsg(data.message ?? data.error ?? '완료')
    } catch {
      setBatchMsg('실패')
    } finally {
      setBatchLoading(false)
      setTimeout(() => setBatchMsg(''), 4000)
    }
  }

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 safe-top"
      style={{ backdropFilter: `blur(${blur}px)`, backgroundColor: bg }}
    >
      <motion.div className="border-b border-gray-100" style={{ opacity: borderOpacity }} />
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_text.svg" alt="딱!세줄" className="h-6 w-auto" />
        </div>

        <div className="flex items-center gap-2">
          {/* 배치 수동 실행 버튼 */}
          <button
            onClick={handleBatch}
            disabled={batchLoading}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
              batchLoading
                ? 'bg-amber-50 text-amber-400 cursor-not-allowed'
                : 'bg-emerald-50 text-emerald-500 active:scale-95'
            )}
            title="뉴스 크롤링 + 요약 지금 실행"
          >
            <Zap className={cn('w-3.5 h-3.5', batchLoading && 'animate-pulse')} />
            <span>{batchLoading ? '실행중...' : batchMsg || '배치실행'}</span>
          </button>

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
      </div>
    </motion.header>
  )
}

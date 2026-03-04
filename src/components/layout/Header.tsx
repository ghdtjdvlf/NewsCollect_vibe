'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { RefreshCw, Zap, Timer, RotateCcw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/cn'

function getSecondsUntilNextBatch(): number {
  const now = new Date()
  const elapsed = (now.getMinutes() % 5) * 60 + now.getSeconds()
  return 300 - elapsed
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function Header() {
  const { scrollY } = useScroll()
  const blur = useTransform(scrollY, [0, 60], [8, 20])
  const bg = useTransform(scrollY, [0, 60], ['rgba(255,255,255,0)', 'rgba(255,255,255,1)'])
  const borderOpacity = useTransform(scrollY, [0, 60], [0, 1])

  const { autoRefresh, setAutoRefresh } = useUIStore()
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchMsg, setBatchMsg] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    setCountdown(getSecondsUntilNextBatch())
    const id = setInterval(() => setCountdown(getSecondsUntilNextBatch()), 1000)
    return () => clearInterval(id)
  }, [])

  async function runBatch(reset = false) {
    setBatchLoading(true)
    setBatchMsg('')
    try {
      const res = await fetch('/api/batch-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset }),
        signal: AbortSignal.timeout(290_000),
      })
      const data = await res.json()
      setBatchMsg(data.message ?? data.error ?? '완료')
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      setBatchMsg(isTimeout ? '시간 초과' : '실패')
    } finally {
      setBatchLoading(false)
      setTimeout(() => setBatchMsg(''), 4000)
    }
  }

  function handleBatch() { runBatch(false) }
  function handleReset() { runBatch(true) }

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
          {/* 다음 배치까지 카운트다운 */}
          {countdown !== null && (
            <div
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-mono font-medium tabular-nums',
                countdown <= 30
                  ? 'bg-amber-50 text-amber-500'
                  : 'bg-gray-100 text-gray-400'
              )}
              title="다음 뉴스 갱신까지 남은 시간"
            >
              <Timer className="w-3 h-3 shrink-0" />
              <span>{formatCountdown(countdown)}</span>
            </div>
          )}

          {/* 캐시 초기화 + 재배치 */}
          <button
            onClick={handleReset}
            disabled={batchLoading}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium transition-all',
              batchLoading
                ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                : 'bg-rose-50 text-rose-400 active:scale-95'
            )}
            title="쿨다운 초기화 후 즉시 배치 실행"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

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

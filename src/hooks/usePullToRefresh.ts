import { useRef, useCallback } from 'react'

interface Options {
  onRefresh: () => Promise<unknown> | void
  threshold?: number
}

export function usePullToRefresh({ onRefresh, threshold = 72 }: Options) {
  const startY = useRef(0)
  const pulling = useRef(false)
  const isRefreshing = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY
      pulling.current = true
    }
  }, [])

  const onTouchMove = useCallback(
    (e: React.TouchEvent, setProgress: (v: number) => void) => {
      if (!pulling.current || isRefreshing.current) return
      const delta = e.touches[0].clientY - startY.current
      if (delta > 0) {
        setProgress(Math.min(delta / threshold, 1))
      }
    },
    [threshold]
  )

  const onTouchEnd = useCallback(
    async (progress: number, setProgress: (v: number) => void, setRefreshing: (v: boolean) => void) => {
      pulling.current = false
      if (progress >= 1 && !isRefreshing.current) {
        isRefreshing.current = true
        setRefreshing(true)
        try {
          await onRefresh()
        } finally {
          isRefreshing.current = false
          setRefreshing(false)
          setProgress(0)
        }
      } else {
        setProgress(0)
      }
    },
    [onRefresh]
  )

  return { onTouchStart, onTouchMove, onTouchEnd }
}

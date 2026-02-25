'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1분
            refetchInterval: 60 * 1000,
          },
        },
      })
  )

  // skipHydration 설정 후 클라이언트 마운트 시 localStorage 값 로드
  useEffect(() => {
    useUIStore.persist.rehydrate()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

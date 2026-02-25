'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Clock } from 'lucide-react'
import { NewsCard } from '@/components/NewsCard'
import { useSearchNews } from './useNewsQuery'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/cn'

export function SearchTab() {
  const [keyword, setKeyword] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { searchHistory, addSearchHistory, clearSearchHistory, removeSearchHistory } =
    useUIStore()

  const { data, isLoading } = useSearchNews({
    keyword: submittedKeyword,
    sort: 'relevance',
  })

  function handleSubmit(kw: string) {
    const trimmed = kw.trim()
    if (!trimmed) return
    setSubmittedKeyword(trimmed)
    addSearchHistory(trimmed)
  }

  function handleClear() {
    setKeyword('')
    setSubmittedKeyword('')
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-4">
      {/* 검색 인풋 */}
      <div className="relative flex items-center bg-white rounded-2xl border border-gray-200 px-4 py-3 gap-3 shadow-sm">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit(keyword)}
          placeholder="뉴스 검색..."
          className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-sm outline-none min-w-0"
          autoComplete="off"
          inputMode="search"
        />
        <AnimatePresence>
          {keyword && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleClear}
              className="shrink-0 text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
        {keyword && (
          <button
            onClick={() => handleSubmit(keyword)}
            className="shrink-0 text-xs bg-indigo-500 text-white px-3 py-1.5 rounded-lg"
          >
            검색
          </button>
        )}
      </div>

      {/* 결과 없을 때: 최근 검색어 */}
      {!submittedKeyword && (
        <div className="space-y-3">
          {searchHistory.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400 font-medium">최근 검색어</p>
                <button
                  onClick={clearSearchHistory}
                  className="text-xs text-gray-300 hover:text-gray-500"
                >
                  전체 삭제
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((h) => (
                  <div key={h} className="flex items-center">
                    <button
                      onClick={() => {
                        setKeyword(h)
                        handleSubmit(h)
                      }}
                      className={cn(
                        'flex items-center gap-1.5 bg-gray-100 pl-3 pr-2 py-1.5 rounded-full text-xs text-gray-500',
                        'hover:text-gray-800 transition-colors'
                      )}
                    >
                      <Clock className="w-3 h-3" />
                      {h}
                    </button>
                    <button
                      onClick={() => removeSearchHistory(h)}
                      className="ml-0.5 p-1 text-gray-300 hover:text-gray-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchHistory.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-300">
              <Search className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">검색어를 입력하세요</p>
            </div>
          )}
        </div>
      )}

      {/* 검색 결과 */}
      {submittedKeyword && (
        <div className="space-y-3">
          {/* 관련 키워드 추천 */}
          {data?.suggestions && data.suggestions.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {data.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setKeyword(s)
                    handleSubmit(s)
                  }}
                  className="shrink-0 bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-2xl h-28 animate-pulse" />
            ))
          ) : (
            <>
              {data && (
                <p className="text-xs text-gray-400">
                  &quot;{submittedKeyword}&quot; 검색 결과 {data.total}건
                </p>
              )}

              {data?.clusters.map((cluster) => (
                <div key={cluster.id} className="space-y-2">
                  <NewsCard item={cluster.representative} />
                  {cluster.related.length > 0 && (
                    <div className="ml-4 space-y-2">
                      {cluster.related.slice(0, 2).map((item) => (
                        <NewsCard
                          key={item.id}
                          item={item}
                          className="opacity-70 scale-[0.98] origin-left"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {data?.clusters.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400">
                  <p className="text-sm">검색 결과가 없습니다.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

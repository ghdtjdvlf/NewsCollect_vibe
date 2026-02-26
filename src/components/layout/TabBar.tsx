'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import type { TabType } from '@/types/news'

const TABS: { id: TabType; label: string; icon: string }[] = [
  { id: 'trending', label: '화제', icon: '🔥' },
  { id: 'latest', label: '최신', icon: '📰' },
  { id: 'search', label: '검색', icon: '🔍' },
]

interface TabBarProps {
  active: TabType
  onChange: (tab: TabType) => void
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      <div className="bg-white/90 backdrop-blur-xl border-t border-gray-100">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative flex-1 flex flex-col items-center gap-1 py-3 px-2',
                'min-h-[44px] transition-colors duration-200',
                active === tab.id ? 'text-gray-900' : 'text-gray-400'
              )}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>

              {active === tab.id && (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-500 rounded-full"
                  transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

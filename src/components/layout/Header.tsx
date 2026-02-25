'use client'

import { motion, useScroll, useTransform } from 'framer-motion'

export function Header() {
  const { scrollY } = useScroll()
  const blur = useTransform(scrollY, [0, 60], [8, 20])
  const bg = useTransform(scrollY, [0, 60], ['rgba(255,255,255,0)', 'rgba(255,255,255,0.88)'])
  const borderOpacity = useTransform(scrollY, [0, 60], [0, 1])

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 safe-top"
      style={{ backdropFilter: `blur(${blur}px)`, backgroundColor: bg }}
    >
      <motion.div
        className="border-b border-gray-100"
        style={{ opacity: borderOpacity }}
      />
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <h1 className="text-lg font-bold text-gray-900">Liquid News</h1>
        </div>
        <span className="text-xs text-gray-400 font-medium">KR</span>
      </div>
    </motion.header>
  )
}

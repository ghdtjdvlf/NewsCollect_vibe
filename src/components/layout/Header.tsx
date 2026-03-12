'use client'

import { motion, useScroll, useTransform } from 'framer-motion'

export function Header() {
  const { scrollY } = useScroll()
  const blur = useTransform(scrollY, [0, 60], [8, 20])
  const bg = useTransform(scrollY, [0, 60], ['rgba(255,255,255,0)', 'rgba(255,255,255,1)'])
  const borderOpacity = useTransform(scrollY, [0, 60], [0, 1])

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
      </div>
    </motion.header>
  )
}

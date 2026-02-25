'use client'

interface BlobProps {
  className?: string
}

export function BlobBackground({ className }: BlobProps) {
  return (
    <div
      className={`fixed inset-0 pointer-events-none bg-slate-50 ${className ?? ''}`}
      aria-hidden="true"
    />
  )
}

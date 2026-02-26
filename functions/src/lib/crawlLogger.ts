import type { NewsSource } from '../types/news'

// ─── 타입 ─────────────────────────────────────────────────
export type CrawlMethod = 'firecrawl' | 'playwright'

export interface CrawlLog {
  timestamp: string
  source: NewsSource
  method: CrawlMethod
  collected: number
  deduplicated: number
  filtered: number
  failed: number
  duration_ms: number
}

// ─── 인메모리 로그 저장소 ────────────────────────────────
const logs: CrawlLog[] = []

const consecutiveFailures: Partial<Record<NewsSource, number>> = {}
const methodOverrides: Partial<Record<NewsSource, CrawlMethod>> = {}

export function logCrawl(entry: Omit<CrawlLog, 'timestamp'>): CrawlLog {
  const log: CrawlLog = {
    ...entry,
    timestamp: new Date().toISOString(),
  }

  logs.push(log)

  const total = entry.collected + entry.failed
  const failureRate = total > 0 ? entry.failed / total : 0

  if (entry.failed > 0) {
    consecutiveFailures[entry.source] =
      (consecutiveFailures[entry.source] ?? 0) + 1
  } else {
    consecutiveFailures[entry.source] = 0
  }

  const consecutive = consecutiveFailures[entry.source] ?? 0

  if (consecutive >= 3) {
    console.warn(
      `[CrawlLogger] ⚠️ ${entry.source} — 연속 ${consecutive}회 실패. 해당 소스 skip 처리.`
    )
  } else if (failureRate > 0.2 && entry.method === 'firecrawl') {
    console.warn(
      `[CrawlLogger] 🔄 ${entry.source} — 실패율 ${(failureRate * 100).toFixed(0)}% > 20%.`
    )
    methodOverrides[entry.source] = 'playwright'
  }

  return log
}

export function getRecommendedMethod(source: NewsSource): CrawlMethod {
  return methodOverrides[source] ?? 'firecrawl'
}

export function isSourceSkipped(source: NewsSource): boolean {
  return (consecutiveFailures[source] ?? 0) >= 3
}

export function getRecentLogs(n = 50): CrawlLog[] {
  return logs.slice(-n)
}

export function getSummary(): Record<string, { successRate: string; totalRuns: number }> {
  const sourceMap: Partial<Record<NewsSource, { success: number; total: number }>> = {}

  for (const log of logs) {
    const entry = sourceMap[log.source] ?? { success: 0, total: 0 }
    entry.total += log.collected + log.failed
    entry.success += log.collected
    sourceMap[log.source] = entry
  }

  const result: Record<string, { successRate: string; totalRuns: number }> = {}
  for (const [source, data] of Object.entries(sourceMap)) {
    result[source] = {
      successRate:
        data.total > 0
          ? `${((data.success / data.total) * 100).toFixed(1)}%`
          : '0%',
      totalRuns: data.total,
    }
  }
  return result
}

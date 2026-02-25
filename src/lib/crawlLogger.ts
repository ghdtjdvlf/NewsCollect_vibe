import type { NewsSource } from '@/types/news'

// ─── 타입 ─────────────────────────────────────────────────
export type CrawlMethod = 'firecrawl' | 'playwright'

export interface CrawlLog {
  timestamp: string
  source: NewsSource
  method: CrawlMethod
  collected: number       // 수집 기사 수
  deduplicated: number    // 중복 제거 후
  filtered: number        // 커뮤니티 필터 통과 (화제뉴스)
  failed: number
  duration_ms: number
}

// ─── 인메모리 로그 저장소 ────────────────────────────────
const logs: CrawlLog[] = []

// 소스별 연속 실패 카운터
const consecutiveFailures: Partial<Record<NewsSource, number>> = {}

// 소스별 메서드 오버라이드 (자동 Playwright 전환 시 기록)
const methodOverrides: Partial<Record<NewsSource, CrawlMethod>> = {}

// ─── 주요 함수 ────────────────────────────────────────────

/** 크롤링 결과를 기록하고 자동 폴백 여부를 반환 */
export function logCrawl(entry: Omit<CrawlLog, 'timestamp'>): CrawlLog {
  const log: CrawlLog = {
    ...entry,
    timestamp: new Date().toISOString(),
  }

  logs.push(log)

  // 실패율 계산
  const total = entry.collected + entry.failed
  const failureRate = total > 0 ? entry.failed / total : 0

  if (entry.failed > 0) {
    consecutiveFailures[entry.source] =
      (consecutiveFailures[entry.source] ?? 0) + 1
  } else {
    consecutiveFailures[entry.source] = 0
  }

  const consecutive = consecutiveFailures[entry.source] ?? 0

  // 연속 3회 실패 → skip 경고
  if (consecutive >= 3) {
    console.warn(
      `[CrawlLogger] ⚠️ ${entry.source} — 연속 ${consecutive}회 실패. 해당 소스 skip 처리.`
    )
  }
  // 실패율 > 20% → Playwright 전환 권고
  else if (failureRate > 0.2 && entry.method === 'firecrawl') {
    console.warn(
      `[CrawlLogger] 🔄 ${entry.source} — 실패율 ${(failureRate * 100).toFixed(0)}% > 20%. Playwright 전환.`
    )
    methodOverrides[entry.source] = 'playwright'
  }

  return log
}

/** 특정 소스의 권장 크롤링 메서드 반환 */
export function getRecommendedMethod(source: NewsSource): CrawlMethod {
  return methodOverrides[source] ?? 'firecrawl'
}

/** 특정 소스가 skip 상태인지 확인 */
export function isSourceSkipped(source: NewsSource): boolean {
  return (consecutiveFailures[source] ?? 0) >= 3
}

/** 최근 N개 로그 반환 */
export function getRecentLogs(n = 50): CrawlLog[] {
  return logs.slice(-n)
}

/** 소스별 성공률 요약 */
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

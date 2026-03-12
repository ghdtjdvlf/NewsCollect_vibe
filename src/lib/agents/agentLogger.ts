// ─── 에이전트 실행 로그 (Firestore 영속 + 인메모리 캐시) ──

import { db } from '@/lib/firebase'

export interface AgentRunLog {
  id: string
  agentName: string
  runAt: string
  duration_ms: number
  success: boolean
  input: Record<string, unknown>
  output: Record<string, unknown>
  error?: string
}

const MAX_LOGS = 50

// ─── 배치 스케줄 상태 ─────────────────────────────────────
const BATCH_INTERVAL_MS = 10 * 60 * 1000 // 10분

export interface BatchSchedule {
  lastRunAt: string | null
  nextRunAt: string | null
  intervalMinutes: number
  isRunning: boolean
  isRunningSince: string | null  // 타임아웃 감지용
}

const RUNNING_TIMEOUT_MS = 10 * 60 * 1000 // 10분 초과 시 자동 초기화

// ─── Groq API 한도 ────────────────────────────────────────
export interface GroqRateLimit {
  updatedAt: string
  // 분당
  limitRequests: number
  remainingRequests: number
  limitTokens: number
  remainingTokens: number
  // 일일
  limitTokensDay: number
  remainingTokensDay: number
}

// ─── 인메모리 캐시 (같은 인스턴스 내 빠른 접근용) ───────────
const memLogs: AgentRunLog[] = []
let memBatchState: BatchSchedule = {
  lastRunAt: null,
  nextRunAt: null,
  intervalMinutes: 10,
  isRunning: false,
  isRunningSince: null,
}
let memGroqRateLimit: GroqRateLimit | null = null

const logsDoc = () => db.collection('meta').doc('agentLogs')

// Firestore 비직렬화 타입(Map, Set, 배열)을 요약 문자열로 변환
function toFirestoreValue(v: unknown): unknown {
  if (Array.isArray(v)) return `[Array(${v.length})]`
  if (v instanceof Map) return `[Map(${v.size})]`
  if (v instanceof Set) return `[Set(${v.size})]`
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, toFirestoreValue(val)])
    )
  }
  return v
}

function compactLog(log: AgentRunLog): AgentRunLog {
  const compact = (obj: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, toFirestoreValue(v)])
    )
  return { ...log, input: compact(log.input), output: compact(log.output) }
}

// ─── Firestore 전체 상태 저장 (fire-and-forget) ───────────
function persist() {
  const compactLogs = memLogs.slice(0, MAX_LOGS).map(compactLog)
  logsDoc()
    .set({ logs: compactLogs, batchState: memBatchState, groqRateLimit: memGroqRateLimit ?? null })
    .catch((err) => console.warn('[agentLogger] Firestore 저장 실패:', err?.message))
}

// ─── 배치 실행 상태 ───────────────────────────────────────
export async function setBatchRunning(running: boolean) {
  memBatchState.isRunning = running
  if (running) {
    memBatchState.isRunningSince = new Date().toISOString()
  } else {
    memBatchState.isRunningSince = null
    memBatchState.lastRunAt = new Date().toISOString()
    memBatchState.nextRunAt = new Date(Date.now() + BATCH_INTERVAL_MS).toISOString()
  }
  // isRunning 변경은 즉시 Firestore에 반영 (409 중복 방지를 위해 await)
  try {
    const compactLogs = memLogs.slice(0, MAX_LOGS).map(compactLog)
    await logsDoc().set({ logs: compactLogs, batchState: memBatchState, groqRateLimit: memGroqRateLimit ?? null })
  } catch (err) {
    console.warn('[agentLogger] setBatchRunning Firestore 실패:', (err as Error)?.message)
  }
}

// ─── Groq 한도 업데이트 ───────────────────────────────────
export function setGroqRateLimit(rl: GroqRateLimit) {
  memGroqRateLimit = rl
  persist()
}

// ─── 로그 기록 ────────────────────────────────────────────
export function recordLog(log: Omit<AgentRunLog, 'id'>) {
  const entry: AgentRunLog = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...log,
  }
  memLogs.unshift(entry)
  if (memLogs.length > MAX_LOGS) memLogs.splice(MAX_LOGS)
  persist()
}

// ─── Firestore에서 읽기 ───────────────────────────────────
export async function getLogsFromStore(agentName?: string): Promise<AgentRunLog[]> {
  try {
    const doc = await logsDoc().get()
    if (doc.exists) {
      const data = doc.data() as { logs?: AgentRunLog[] }
      const logs = data.logs ?? []
      return agentName ? logs.filter((l) => l.agentName === agentName) : logs
    }
  } catch (err) {
    console.warn('[agentLogger] Firestore 읽기 실패:', (err as Error)?.message)
  }
  return []
}

export async function getBatchScheduleFromStore(): Promise<BatchSchedule> {
  try {
    const doc = await logsDoc().get()
    if (doc.exists) {
      const data = doc.data() as { batchState?: BatchSchedule }
      const state = data.batchState
      if (state) {
        // isRunningSince 기준 10분 초과 시 자동 초기화 (함수 타임아웃으로 stuck된 경우)
        if (state.isRunning && state.isRunningSince) {
          const elapsed = Date.now() - new Date(state.isRunningSince).getTime()
          if (elapsed > RUNNING_TIMEOUT_MS) {
            console.warn('[agentLogger] isRunning stuck 감지 — 자동 초기화')
            state.isRunning = false
            state.isRunningSince = null
            logsDoc().set({ ...data, batchState: state }, { merge: true }).catch(() => {})
          }
        }
        return state
      }
    }
  } catch (err) {
    console.warn('[agentLogger] batchState 읽기 실패:', (err as Error)?.message)
  }
  return { lastRunAt: null, nextRunAt: null, intervalMinutes: 10, isRunning: false, isRunningSince: null }
}

export async function getGroqRateLimitFromStore(): Promise<GroqRateLimit | null> {
  try {
    const doc = await logsDoc().get()
    if (doc.exists) {
      const data = doc.data() as { groqRateLimit?: GroqRateLimit }
      return data.groqRateLimit ?? null
    }
  } catch (err) {
    console.warn('[agentLogger] groqRateLimit 읽기 실패:', (err as Error)?.message)
  }
  return null
}

// ─── 로그 초기화 ──────────────────────────────────────────
export async function clearLogs() {
  memLogs.splice(0)
  try {
    await logsDoc().set({
      logs: [],
      batchState: { ...memBatchState, isRunning: false },
    })
  } catch (err) {
    console.warn('[agentLogger] clearLogs Firestore 실패:', (err as Error)?.message)
  }
}

// ─── 동기 인메모리 접근 (레거시 호환) ─────────────────────
export function getLogs(agentName?: string): AgentRunLog[] {
  return agentName ? memLogs.filter((l) => l.agentName === agentName) : memLogs
}

export function getBatchSchedule(): BatchSchedule {
  return { ...memBatchState }
}

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, Trash2, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Zap, Timer, Activity, Play, RotateCcw, Filter } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { AgentRunLog, BatchSchedule, GroqRateLimit } from '@/lib/agents/agentLogger'

const AGENT_COLORS: Record<string, string> = {
  CrawlerAgent:    'bg-blue-100 text-blue-700 border-blue-200',
  FilterAgent:     'bg-green-100 text-green-700 border-green-200',
  SummarizerAgent: 'bg-violet-100 text-violet-700 border-violet-200',
}

const AGENT_DESC: Record<string, string> = {
  CrawlerAgent:    '뉴스 수집 (네이버/다음/구글/커뮤니티)',
  FilterAgent:     '중복제거 + 트렌드 필터링',
  SummarizerAgent: 'AI 요약 생성 (Groq)',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── 카운트다운 훅 ────────────────────────────────────────
// nextRunAt이 없으면 크론 주기(10분)를 기준으로 현재 위치 계산
function useCountdown(targetIso: string | null, intervalMinutes: number) {
  const INTERVAL_MS = intervalMinutes * 60 * 1000

  const getNextCronTime = () => {
    const now = Date.now()
    const elapsed = now % INTERVAL_MS
    return now - elapsed + INTERVAL_MS
  }

  const [nextMs, setNextMs] = useState<number>(() =>
    targetIso ? new Date(targetIso).getTime() : getNextCronTime()
  )
  const [remaining, setRemaining] = useState<number>(0)

  useEffect(() => {
    setNextMs(targetIso ? new Date(targetIso).getTime() : getNextCronTime())
  }, [targetIso]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = () => {
      const diff = nextMs - Date.now()
      if (diff <= 0 && !targetIso) {
        setNextMs(getNextCronTime())
      }
      setRemaining(Math.max(0, diff))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [nextMs]) // eslint-disable-line react-hooks/exhaustive-deps

  const min = Math.floor(remaining / 60000)
  const sec = Math.floor((remaining % 60000) / 1000)
  const progress = Math.max(0, Math.min(100, (1 - remaining / INTERVAL_MS) * 100))

  return {
    remaining,
    progress,
    display: remaining > 0 ? `${min}분 ${sec.toString().padStart(2, '0')}초` : '곧 실행',
  }
}

// ─── Groq API 한도 카드 ───────────────────────────────────
// "6s" / "1m30s" → ms
function parseDurationMs(raw: string): number {
  const m = raw.match(/(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/)
  if (!m) return 0
  return (parseInt(m[1] ?? '0') * 60 + parseFloat(m[2] ?? '0')) * 1000
}

// 남은 시간(ms) → 표시 문자열
function fmtRemaining(ms: number): string {
  if (ms <= 0) return '초기화됨'
  const totalSec = Math.ceil(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const min = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  if (h > 0) return `${h}시간 ${min}분 후 초기화`
  if (min > 0 && sec > 0) return `${min}분 ${sec}초 후 초기화`
  if (min > 0) return `${min}분 후 초기화`
  return `${sec}초 후 초기화`
}

// 절대 타임스탬프까지 카운트다운하는 훅
function useCountdownTo(targetMs: number): string {
  const [display, setDisplay] = useState(() => fmtRemaining(targetMs - Date.now()))
  useEffect(() => {
    const tick = () => setDisplay(fmtRemaining(targetMs - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetMs])
  return display
}

function GroqUsageCardInner({ usage }: { usage: GroqRateLimit }) {
  const updatedMs = new Date(usage.updatedAt).getTime()
  const tpmResetMs = usage.resetTokens ? updatedMs + parseDurationMs(usage.resetTokens) : 0
  const rpmResetMs = usage.resetRequests ? updatedMs + parseDurationMs(usage.resetRequests) : 0
  const dayResetMs = usage.resetTokensDay ? new Date(usage.resetTokensDay).getTime() : 0

  const tpmTimer = useCountdownTo(tpmResetMs)
  const rpmTimer = useCountdownTo(rpmResetMs)
  const dayTimer = useCountdownTo(dayResetMs)

  const dayPct = usage.limitTokensDay > 0
    ? Math.round((1 - usage.remainingTokensDay / usage.limitTokensDay) * 100)
    : 0
  const minPct = usage.limitTokens > 0
    ? Math.round((1 - usage.remainingTokens / usage.limitTokens) * 100)
    : 0

  const dayColor = dayPct >= 90 ? 'bg-red-500' : dayPct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'
  const minColor = minPct >= 90 ? 'bg-red-500' : minPct >= 70 ? 'bg-amber-400' : 'bg-indigo-500'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-orange-400" />
        <span className="font-semibold text-sm text-gray-800">Groq API 한도</span>
        <span className="ml-auto text-[10px] text-gray-300">{formatTime(usage.updatedAt)} 기준</span>
      </div>

      {/* 일일 토큰 */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">일일 토큰 (TPD)</span>
          <span className="font-semibold text-gray-800">
            {usage.remainingTokensDay.toLocaleString()} / {usage.limitTokensDay.toLocaleString()} 남음
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', dayColor)} style={{ width: `${dayPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-amber-500 font-medium">{dayResetMs > 0 ? dayTimer : ''}</span>
          <span className="text-gray-400">{dayPct}% 사용</span>
        </div>
      </div>

      {/* 분당 토큰 */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">분당 토큰 (TPM)</span>
          <span className="font-semibold text-gray-800">
            {usage.remainingTokens.toLocaleString()} / {usage.limitTokens.toLocaleString()} 남음
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', minColor)} style={{ width: `${minPct}%` }} />
        </div>
        {tpmResetMs > 0 && (
          <p className="text-[10px] text-indigo-400 font-medium">{tpmTimer}</p>
        )}
      </div>

      {/* 분당 요청 수 */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>분당 요청: <b className="text-gray-800">{usage.remainingRequests}</b> / {usage.limitRequests} 남음</span>
        {rpmResetMs > 0 && (
          <span className="text-indigo-400 font-medium ml-auto">{rpmTimer}</span>
        )}
      </div>
    </div>
  )
}

function GroqUsageCard({ usage }: { usage: GroqRateLimit | null }) {
  if (!usage) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="w-4 h-4 text-orange-400" />
        <span className="font-semibold text-sm text-gray-800">Groq API 한도</span>
      </div>
      <p className="text-xs text-gray-400">요약 실행 후 표시됩니다</p>
    </div>
  )
  return <GroqUsageCardInner usage={usage} />
}

// ─── 요약 현황 카드 ──────────────────────────────────────
// 기사 20개당 Groq 1회 호출, 호출당 ~10초 + 청크 간 2초 딜레이
const TOKENS_PER_ARTICLE = 200   // 실측 기준 평균
const SEC_PER_CHUNK = 12         // 20개 청크 처리 평균 소요 시간
const CHUNK_SIZE = 20

function SummaryStatsCard({ stats }: { stats: { total: number; unsummarized: number } | null }) {
  if (!stats) return null

  const { total, unsummarized } = stats
  const summarized = total - unsummarized
  const pct = total > 0 ? Math.round((summarized / total) * 100) : 100
  const chunks = Math.ceil(unsummarized / CHUNK_SIZE)
  const estSec = chunks * SEC_PER_CHUNK
  const estTokens = unsummarized * TOKENS_PER_ARTICLE

  const estTime = estSec <= 0 ? '없음' :
    estSec < 60 ? `약 ${estSec}초` :
    `약 ${Math.ceil(estSec / 60)}분`

  const barColor = pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-amber-400'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-violet-500" />
        <span className="font-semibold text-sm text-gray-800">요약 현황</span>
        <span className="ml-auto text-xs font-bold text-gray-700">{summarized.toLocaleString()} / {total.toLocaleString()}개</span>
      </div>

      <div className="space-y-1">
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400">
          <span>요약 완료 <b className="text-gray-700">{pct}%</b></span>
          <span>미요약 <b className="text-amber-500">{unsummarized.toLocaleString()}개</b></span>
        </div>
      </div>

      {unsummarized > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">예상 소요 시간</p>
            <p className="text-sm font-bold text-gray-800">{estTime}</p>
            <p className="text-[10px] text-gray-400">{chunks}회 API 호출</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">예상 토큰 사용</p>
            <p className="text-sm font-bold text-gray-800">{estTokens.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400">기사당 ~{TOKENS_PER_ARTICLE}토큰</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 배치 스케줄 카드 ─────────────────────────────────────
function BatchScheduleCard({ schedule, onIntervalChange }: { schedule: BatchSchedule | null; onIntervalChange: () => void }) {
  const intervalMinutes = schedule?.intervalMinutes ?? 10
  const { display, progress } = useCountdown(schedule?.nextRunAt ?? null, intervalMinutes)
  const [inputVal, setInputVal] = useState(String(intervalMinutes))
  const [saving, setSaving] = useState(false)

  const saveInterval = async () => {
    const val = parseInt(inputVal)
    if (isNaN(val) || val < 5 || val > 120) return
    setSaving(true)
    await fetch('/api/agent/interval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalMinutes: val }),
    })
    setSaving(false)
    onIntervalChange()
  }

  if (!schedule) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Timer className="w-4 h-4 text-indigo-500" />
        <span className="font-semibold text-sm text-gray-800">배치 스케줄</span>
        <span className={cn(
          'ml-auto text-xs px-2 py-0.5 rounded-full font-medium',
          schedule.isRunning ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
        )}>
          {schedule.isRunning ? '⚡ 실행 중' : '대기 중'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-1.5">수집 주기</p>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={5} max={120}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              className="w-14 text-sm font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-center"
            />
            <span className="text-xs text-gray-400">분</span>
            <button
              onClick={saveInterval}
              disabled={saving}
              className="ml-auto text-[10px] px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
            >
              {saving ? '저장 중' : '저장'}
            </button>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-0.5">마지막 실행</p>
          <p className="font-semibold text-gray-800 text-xs">
            {schedule.lastRunAt ? formatTime(schedule.lastRunAt) : '기록 없음'}
          </p>
        </div>
      </div>

      {schedule.isRunning ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-orange-500">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            에이전트들이 작업 중입니다...
          </div>
          <div className="w-full bg-orange-100 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-orange-400 rounded-full animate-pulse w-full" />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">다음 실행까지</span>
            <span className="font-semibold text-indigo-600">{display}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-300 text-right">{progress.toFixed(0)}% 경과</p>
        </div>
      )}
    </div>
  )
}

// ─── 로그 상세 ───────────────────────────────────────────
function LogDetail({ log }: { log: AgentRunLog }) {
  const [open, setOpen] = useState(false)

  const outputSummary = () => {
    const o = log.output as Record<string, unknown>
    if (log.agentName === 'CrawlerAgent') {
      return `뉴스 ${(o.newsItems as unknown[])?.length ?? 0}개, 커뮤니티 ${(o.communityPosts as unknown[])?.length ?? 0}개 수집`
    }
    if (log.agentName === 'FilterAgent') {
      return `${(o as { totalBefore?: number }).totalBefore ?? '?'}개 → ${(o as { totalAfter?: number }).totalAfter ?? '?'}개`
    }
    if (log.agentName === 'SummarizerAgent') {
      const s = o as { succeeded?: number; failed?: number; tokensUsed?: number }
      const tokens = s.tokensUsed ? ` · ${s.tokensUsed.toLocaleString()} 토큰` : ''
      return `${s.succeeded ?? 0}개 요약 완료, ${s.failed ?? 0}개 실패${tokens}`
    }
    return JSON.stringify(o).slice(0, 80)
  }

  return (
    <div className={cn('rounded-xl border p-3 text-sm', log.success ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100')}>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setOpen(v => !v)}>
        {log.success
          ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
        <span className="text-xs text-gray-400 shrink-0">{formatTime(log.runAt)}</span>
        <span className="text-gray-700 flex-1 truncate text-xs">{log.success ? outputSummary() : log.error}</span>
        <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
          <Clock className="w-3 h-3" />{formatDuration(log.duration_ms)}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          <p className="text-xs text-gray-400 font-medium">INPUT</p>
          <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(log.input, null, 2).slice(0, 500)}
          </pre>
          {log.success && (
            <>
              <p className="text-xs text-gray-400 font-medium mt-1">OUTPUT</p>
              <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(log.output, (_, v) => Array.isArray(v) ? `[Array(${v.length})]` : v, 2).slice(0, 500)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 에이전트 카드 ────────────────────────────────────────
function AgentCard({ name, logs }: { name: string; logs: AgentRunLog[] }) {
  const successCount = logs.filter(l => l.success).length
  const avgDuration = logs.length > 0
    ? Math.round(logs.reduce((s, l) => s + l.duration_ms, 0) / logs.length)
    : 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-50">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', AGENT_COLORS[name] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
            {name}
          </span>
          <span className="text-xs text-gray-400">{AGENT_DESC[name]}</span>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>총 <b className="text-gray-800">{logs.length}회</b></span>
          <span>성공 <b className="text-green-600">{successCount}회</b></span>
          <span>실패 <b className="text-red-500">{logs.length - successCount}회</b></span>
          {logs.length > 0 && <span>평균 <b className="text-gray-800">{formatDuration(avgDuration)}</b></span>}
        </div>
      </div>
      <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
        {logs.length === 0
          ? <p className="text-xs text-gray-400 text-center py-4">실행 기록 없음 — 배치를 실행해보세요</p>
          : logs.map(log => <LogDetail key={log.id} log={log} />)
        }
      </div>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────
export default function AgentDashboard() {
  const [logs, setLogs] = useState<AgentRunLog[]>([])
  const [schedule, setSchedule] = useState<BatchSchedule | null>(null)
  const [groqUsage, setGroqUsage] = useState<GroqRateLimit | null>(null)
  const [articleStats, setArticleStats] = useState<{ total: number; unsummarized: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<{ deleted: number; remaining: number } | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agent-logs')
      const data = await res.json() as { logs: AgentRunLog[]; schedule: BatchSchedule; groqRateLimit: GroqRateLimit | null; articleStats: { total: number; unsummarized: number } }
      setLogs(data.logs)
      setSchedule(data.schedule)
      setGroqUsage(data.groqRateLimit)
      setArticleStats(data.articleStats ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  const runNow = async () => {
    setRunning(true)
    try {
      await fetch('/api/agent/run', { method: 'POST' })
      await fetchLogs()
    } finally {
      setRunning(false)
    }
  }

  const runSummarize = async () => {
    setSummarizing(true)
    try {
      await fetch('/api/agent/summarize', { method: 'POST' })
      await fetchLogs()
    } finally {
      setSummarizing(false)
    }
  }

  const resetRunning = async () => {
    await fetch('/api/agent/reset', { method: 'POST' })
    await fetchLogs()
  }

  const clearAll = async () => {
    await fetch('/api/agent-logs', { method: 'DELETE' })
    setLogs([])
  }

  const runCleanup = async () => {
    if (!confirm('Firestore 중복 기사를 정리합니다. 계속할까요?')) return
    setCleaning(true)
    setCleanResult(null)
    try {
      const res = await fetch('/api/agent/cleanup', { method: 'POST' })
      const data = await res.json() as { deleted: number; remaining: number }
      setCleanResult(data)
    } finally {
      setCleaning(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // 실행 중이면 5초마다 자동 새로고침
    intervalRef.current = setInterval(fetchLogs, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchLogs])

  const agents = ['CrawlerAgent', 'FilterAgent', 'SummarizerAgent']
  const byAgent = (name: string) => logs.filter(l => l.agentName === name)

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-10">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* 헤더 */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-500" />
              <h1 className="text-lg font-bold text-gray-900">Agent Dashboard</h1>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">에이전트 실행 기록 · 5초마다 자동 갱신</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={runNow}
              disabled={running || summarizing || schedule?.isRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-xs text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className={cn('w-3.5 h-3.5', running && 'animate-pulse')} />
              {running ? '수집 중...' : '수집 실행'}
            </button>
            <button
              onClick={runSummarize}
              disabled={running || summarizing || schedule?.isRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500 text-xs text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className={cn('w-3.5 h-3.5', summarizing && 'animate-pulse')} />
              {summarizing ? '요약 중...' : '요약 실행'}
            </button>
            {schedule?.isRunning && (
              <button
                onClick={resetRunning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-100 text-xs text-orange-600 hover:bg-orange-200"
                title="stuck된 실행 상태 강제 초기화"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                초기화
              </button>
            )}
            <button
              onClick={runCleanup}
              disabled={cleaning || running || summarizing || schedule?.isRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Filter className={cn('w-3.5 h-3.5', cleaning && 'animate-pulse')} />
              {cleaning ? '정리 중...' : '중복 정리'}
            </button>
            <button
              onClick={fetchLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              새로고침
            </button>
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-red-500 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              로그 삭제
            </button>
          </div>
        </div>

        {/* 중복 정리 결과 */}
        {cleanResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
            <span className="text-emerald-700">
              중복 정리 완료 — <b>{cleanResult.deleted}개</b> 삭제, <b>{cleanResult.remaining}개</b> 남음
            </span>
            <button onClick={() => setCleanResult(null)} className="text-emerald-400 hover:text-emerald-600 text-xs">✕</button>
          </div>
        )}

        {/* 요약 현황 */}
        <SummaryStatsCard stats={articleStats} />

        {/* Groq API 한도 */}
        <GroqUsageCard usage={groqUsage} />

        {/* 배치 스케줄 */}
        <BatchScheduleCard schedule={schedule} onIntervalChange={fetchLogs} />

        {/* 에이전트 요약 */}
        <div className="grid grid-cols-3 gap-3">
          {agents.map(name => {
            const agentLogs = byAgent(name)
            const success = agentLogs.filter(l => l.success).length
            return (
              <div key={name} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-400 truncate">{name.replace('Agent', '')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{agentLogs.length}</p>
                <p className="text-[10px] text-green-500">{success}회 성공</p>
              </div>
            )
          })}
        </div>

        {/* 에이전트별 카드 */}
        {agents.map(name => (
          <AgentCard key={name} name={name} logs={byAgent(name)} />
        ))}

        <p className="text-center text-xs text-gray-300">
          <a href="/" className="hover:text-gray-500">← 뉴스로 돌아가기</a>
        </p>
      </div>
    </div>
  )
}

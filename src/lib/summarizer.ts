import Groq from 'groq-sdk'
import type { NewsItem } from '@/types/news'
import { setGroqRateLimit } from '@/lib/agents/agentLogger'

export type SummaryData = { lines: string[]; conclusion: string }

const GROQ_MODEL = 'llama-3.1-8b-instant' // TPD 500,000 (70b-versatile은 100,000 한도)
const MAX_PER_CALL = 20  // 30 → 20으로 줄여 토큰 절약

function buildPrompt(items: NewsItem[]): string {
  return `다음 뉴스들을 각각 3줄(음슴체)로 요약하고 결론을 추가해줘.
어려운 말은 쉽게 바꾸고 핵심만 담아줘.

${items.map((item, i) => `[${i + 1}] ${item.title}\n${(item.summary ?? '').slice(0, 150)}`).join('\n\n')}

출력 형식 (번호와 줄바꿈만 사용, 다른 설명 없이):
[1]
줄1
줄2
줄3
결론: 비유내용

[2]
줄1
줄2
줄3
결론: 비유내용`
}

function parseGroqResponse(text: string, items: NewsItem[]): Map<string, SummaryData> {
  const resultMap = new Map<string, SummaryData>()
  const blocks = text.split(/\[(\d+)\]/).filter((s) => s.trim())

  for (let i = 0; i < blocks.length - 1; i += 2) {
    const idx = parseInt(blocks[i]) - 1
    const content = blocks[i + 1].trim()
    if (idx < 0 || idx >= items.length) continue

    const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const conclusionLine = lines.find((l) => l.startsWith('결론'))
    const conclusion = conclusionLine
      ? conclusionLine.replace(/^결론\s*[:：]\s*/, '').trim()
      : ''
    const summaryLines = lines.filter((l) => !l.startsWith('결론')).slice(0, 3)

    if (summaryLines.length > 0) {
      resultMap.set(items[idx].id, { lines: summaryLines, conclusion })
    }
  }

  return resultMap
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Groq 모델별 일일 토큰 한도 (헤더로 제공 안 됨 — 공식 문서 기준)
const GROQ_TPD_LIMITS: Record<string, number> = {
  'llama-3.1-8b-instant':    500_000,
  'llama-3.3-70b-versatile': 100_000,
  'llama3-8b-8192':          500_000,
  'gemma2-9b-it':            500_000,
}

// 일일 사용 토큰 누적 (인스턴스 내 메모리)
let dailyTokensUsed = 0
let dailyTokensDate = ''

// Rate limit 헤더 + 사용량 저장
async function trySaveRateLimit(completion: { usage?: { total_tokens?: number } }, response: Response) {
  try {
    const g = (key: string) => {
      try { return parseInt(response.headers.get(key) ?? '0', 10) } catch { return 0 }
    }

    // 일일 사용량 누적 (날짜 바뀌면 초기화)
    const today = new Date().toISOString().slice(0, 10)
    if (dailyTokensDate !== today) { dailyTokensUsed = 0; dailyTokensDate = today }
    dailyTokensUsed += completion.usage?.total_tokens ?? 0

    const limitTokensDay = GROQ_TPD_LIMITS[GROQ_MODEL] ?? 100_000
    const remainingTokensDay = Math.max(0, limitTokensDay - dailyTokensUsed)
    const limitTokens = g('x-ratelimit-limit-tokens')
    const remainingTokens = g('x-ratelimit-remaining-tokens')

    console.log(`[summarizer] 일일 토큰 사용: ${dailyTokensUsed.toLocaleString()} / ${limitTokensDay.toLocaleString()} (TPM: ${remainingTokens}/${limitTokens})`)

    setGroqRateLimit({
      updatedAt: new Date().toISOString(),
      limitRequests: g('x-ratelimit-limit-requests'),
      remainingRequests: g('x-ratelimit-remaining-requests'),
      limitTokens,
      remainingTokens,
      limitTokensDay,
      remainingTokensDay,
    })
  } catch (e) {
    console.warn('[summarizer] trySaveRateLimit 실패:', e)
  }
}

async function callGroqWithRetry(
  groq: Groq,
  prompt: string,
  maxRetries = 3
): Promise<string> {
  let delay = 8_000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // withResponse()로 헤더 캡처, 실패 시 일반 create()로 폴백
      let text = ''
      try {
        const { data: completion, response } = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: 2048,
        }).withResponse()
        text = completion.choices[0]?.message?.content ?? ''
        trySaveRateLimit(completion, response) // fire-and-forget
      } catch (innerErr: unknown) {
        const status = (innerErr as { status?: number })?.status
        // 429/401/5xx는 재시도 로직에서 처리
        if (status) throw innerErr
        // withResponse() 자체가 안되는 경우 폴백
        console.warn('[summarizer] withResponse 실패, 폴백:', (innerErr as Error)?.message)
        const completion = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: 2048,
        })
        text = completion.choices[0]?.message?.content ?? ''
      }
      return text
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if (status === 429 && attempt < maxRetries) {
        console.warn(`[summarizer] 429 rate limit — ${delay / 1000}초 후 재시도 (${attempt + 1}/${maxRetries})`)
        await sleep(delay)
        delay *= 2
      } else {
        throw err
      }
    }
  }
  return ''
}

/**
 * Groq로 기사 배열을 요약. 20개 단위로 청크 처리.
 * 429 rate limit 시 최대 3회 지수 백오프 재시도.
 */
export async function summarizeItems(
  items: NewsItem[],
  apiKey: string,
  timeoutMs = 120_000  // 60s → 120s
): Promise<Map<string, SummaryData>> {
  if (items.length === 0) return new Map()

  if (!apiKey) {
    console.error('[summarizer] GROQ_API_KEY 없음 — 요약 건너뜀')
    return new Map()
  }

  console.log(`[summarizer] 시작 — ${items.length}개, timeout=${timeoutMs}ms`)
  const groq = new Groq({ apiKey, timeout: timeoutMs })
  const resultMap = new Map<string, SummaryData>()

  for (let i = 0; i < items.length; i += MAX_PER_CALL) {
    const chunk = items.slice(i, i + MAX_PER_CALL)
    console.log(`[summarizer] 청크 ${i + 1}~${i + chunk.length} 요약 중...`)

    if (i > 0) await sleep(2_000)

    try {
      const text = await callGroqWithRetry(groq, buildPrompt(chunk))
      const chunkResult = parseGroqResponse(text, chunk)
      console.log(`[summarizer] 청크 결과: ${chunkResult.size}/${chunk.length}개 성공`)
      chunkResult.forEach((v, k) => resultMap.set(k, v))
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      const msg = (err as Error)?.message ?? String(err)
      console.error(`[summarizer] 청크 ${i}~${i + chunk.length} 실패 status=${status} msg=${msg}`)
    }
  }

  console.log(`[summarizer] 완료 — ${resultMap.size}/${items.length}개`)
  return resultMap
}

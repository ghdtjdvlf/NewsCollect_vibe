import Groq from 'groq-sdk'
import type { NewsItem } from '@/types/news'

export type SummaryData = { lines: string[]; conclusion: string }

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MAX_PER_CALL = 30

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

/**
 * Groq로 기사 배열을 요약. 30개 단위로 청크 처리.
 * 실패 시 빈 Map 반환 (호출부에서 catch-up cron이 처리)
 */
export async function summarizeItems(
  items: NewsItem[],
  apiKey: string,
  timeoutMs = 60_000
): Promise<Map<string, SummaryData>> {
  if (items.length === 0) return new Map()

  const groq = new Groq({ apiKey, timeout: timeoutMs })
  const resultMap = new Map<string, SummaryData>()

  // 30개씩 청크 처리
  for (let i = 0; i < items.length; i += MAX_PER_CALL) {
    const chunk = items.slice(i, i + MAX_PER_CALL)
    const prompt = buildPrompt(chunk)

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 2048,
    })

    const text = completion.choices[0]?.message?.content ?? ''
    const chunkResult = parseGroqResponse(text, chunk)
    chunkResult.forEach((v, k) => resultMap.set(k, v))
  }

  return resultMap
}

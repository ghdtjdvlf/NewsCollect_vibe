// ─── 에이전트 기본 인터페이스 ────────────────────────────
import { recordLog } from './agentLogger'

export interface AgentResult<T> {
  success: boolean
  data: T
  error?: string
  duration_ms: number
}

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string

  abstract execute(input: TInput): Promise<TOutput>

  async run(input: TInput): Promise<AgentResult<TOutput>> {
    const start = Date.now()
    console.log(`[${this.name}] 시작`)

    try {
      const data = await this.execute(input)
      const duration_ms = Date.now() - start
      console.log(`[${this.name}] 완료 (${duration_ms}ms)`)
      recordLog({
        agentName: this.name,
        runAt: new Date(start).toISOString(),
        duration_ms,
        success: true,
        input: input as Record<string, unknown>,
        output: data as Record<string, unknown>,
      })
      return { success: true, data, duration_ms }
    } catch (err) {
      const duration_ms = Date.now() - start
      const error = err instanceof Error ? err.message : String(err)
      console.error(`[${this.name}] 실패 (${duration_ms}ms):`, error)
      recordLog({
        agentName: this.name,
        runAt: new Date(start).toISOString(),
        duration_ms,
        success: false,
        input: input as Record<string, unknown>,
        output: {},
        error,
      })
      return { success: false, data: null as TOutput, error, duration_ms }
    }
  }
}

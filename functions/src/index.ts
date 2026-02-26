import { onSchedule } from 'firebase-functions/v2/scheduler'
import { setGlobalOptions } from 'firebase-functions/v2'
import { runBatch } from './batch'

// 서울 리전 — 한국 뉴스 서비스
setGlobalOptions({ region: 'asia-northeast3' })

export const batchCron = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeoutSeconds: 540,   // 9분 (Firebase Functions v2 최대 9분)
    memory: '512MiB',
  },
  async () => {
    console.log('[batchCron] 실행 시작')
    try {
      await runBatch()
      console.log('[batchCron] 완료')
    } catch (err) {
      console.error('[batchCron] 실패:', err)
      throw err  // Firebase에 실패 기록
    }
  }
)

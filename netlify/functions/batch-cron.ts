import { schedule } from '@netlify/functions'

// 5분마다 /api/batch 호출 → 뉴스 크롤링 + Gemini 요약 + Firebase 저장
export const handler = schedule('*/5 * * * *', async () => {
  const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_BASE_URL
  if (!siteUrl) {
    console.error('[batch-cron] URL 환경변수가 없습니다.')
    return { statusCode: 500 }
  }

  try {
    const res = await fetch(`${siteUrl}/api/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.CRON_SECRET ?? '',
      },
    })

    const data = await res.json()
    console.log('[batch-cron] 완료:', data)
    return { statusCode: 200 }
  } catch (err) {
    console.error('[batch-cron] 실패:', err)
    return { statusCode: 500 }
  }
})

// Netlify Functions v2: config.schedule로 크론 정의 (@netlify/functions import 불필요)
export default async function batchCron(): Promise<Response> {
  const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_BASE_URL
  if (!siteUrl) {
    console.error('[batch-cron] URL 환경변수가 없습니다.')
    return new Response(null, { status: 500 })
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
    return new Response(null, { status: 200 })
  } catch (err) {
    console.error('[batch-cron] 실패:', err)
    return new Response(null, { status: 500 })
  }
}

export const config = {
  schedule: '*/5 * * * *',
}

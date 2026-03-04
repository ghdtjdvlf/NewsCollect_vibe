import type { Config } from '@netlify/functions'

export default async function summarizeCron(req: Request): Promise<Response> {
  const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_BASE_URL
  const cronSecret = process.env.CRON_SECRET ?? ''

  if (!siteUrl) {
    console.error('[summarize-cron] URL 환경변수가 없습니다.')
    return new Response(null, { status: 500 })
  }

  try {
    const res = await fetch(`${siteUrl}/api/summarize-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
    })

    const data = await res.json()
    console.log('[summarize-cron] 완료:', JSON.stringify(data))
    return new Response(null, { status: 200 })
  } catch (err) {
    console.error('[summarize-cron] 오류:', err instanceof Error ? err.message : err)
    return new Response(null, { status: 500 })
  }
}

export const config: Config = {
  schedule: '* * * * *',
}

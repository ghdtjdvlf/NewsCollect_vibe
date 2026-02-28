import type { Config } from '@netlify/functions'

export default async function batchSummarize(_req: Request): Promise<Response> {
  const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_BASE_URL
  const cronSecret = process.env.CRON_SECRET ?? ''
  const start = Date.now()

  console.log('[batch-summarize] 실행 시작', {
    siteUrl,
    hasCronSecret: !!cronSecret,
    time: new Date().toISOString(),
  })

  if (!siteUrl) {
    console.error('[batch-summarize] URL 환경변수가 없습니다. URL 또는 NEXT_PUBLIC_BASE_URL을 설정하세요.')
    return new Response(null, { status: 500 })
  }

  try {
    const targetUrl = `${siteUrl}/api/summarize-batch`
    console.log(`[batch-summarize] POST ${targetUrl}`)

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
    })

    console.log(`[batch-summarize] 응답 status=${res.status} elapsed=${Date.now() - start}ms`)

    if (!res.ok) {
      const text = await res.text()
      console.error(`[batch-summarize] 실패 status=${res.status} body=${text.slice(0, 200)}`)
      return new Response(null, { status: 500 })
    }

    const data = await res.json()
    console.log('[batch-summarize] 완료:', JSON.stringify(data))
    return new Response(null, { status: 200 })
  } catch (err) {
    console.error('[batch-summarize] 네트워크 오류:', err instanceof Error ? err.message : err)
    return new Response(null, { status: 500 })
  }
}

export const config: Config = {
  schedule: '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
}

import { schedule } from '@netlify/functions'

const handler = schedule('*/3 * * * *', async () => {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spnewscollet.netlify.app'
  const secret = process.env.CRON_SECRET ?? ''

  try {
    const res = await fetch(`${baseUrl}/api/batch`, {
      method: 'POST',
      headers: {
        'x-cron-secret': secret,
        'Content-Type': 'application/json',
      },
    })

    const data = await res.json()
    console.log('[scheduled-batch] success:', JSON.stringify(data))
  } catch (err) {
    console.error('[scheduled-batch] error:', err)
  }

  return { statusCode: 200 }
})

export { handler }

import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Liquid News KR — 실시간 한국 뉴스'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #eef2ff 0%, #fdf2f8 50%, #eff6ff 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 72, marginBottom: 24 }}>⚡</div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#111827',
            letterSpacing: '-2px',
          }}
        >
          Liquid News KR
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#6b7280',
            marginTop: 16,
          }}
        >
          실시간 한국 뉴스 애그리게이터
        </div>
        <div
          style={{
            marginTop: 32,
            display: 'flex',
            gap: 12,
          }}
        >
          {['🔥 화제뉴스', '📰 최신뉴스', '🔍 검색'].map((label) => (
            <div
              key={label}
              style={{
                background: 'white',
                borderRadius: 99,
                padding: '8px 20px',
                fontSize: 20,
                color: '#374151',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}

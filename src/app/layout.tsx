import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { ServiceWorkerRegister } from '@/components/ui/ServiceWorkerRegister'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'),
  title: 'Liquid News KR — 실시간 한국 뉴스',
  description: '네이버·다음·구글뉴스와 커뮤니티 반응을 한 곳에서 — 실시간 화제뉴스 애그리게이터',
  keywords: ['뉴스', '실시간', '한국뉴스', '네이버뉴스', '다음뉴스', '화제뉴스'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Liquid News',
  },
  openGraph: {
    title: 'Liquid News KR',
    description: '실시간 한국 뉴스 애그리게이터',
    type: 'website',
    locale: 'ko_KR',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}

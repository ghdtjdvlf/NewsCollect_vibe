import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { ServiceWorkerRegister } from '@/components/ui/ServiceWorkerRegister'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spnewscollet.netlify.app'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: '딱!세줄 - 뉴스는 읽기 귀찮고 세상 돌아가는 건 궁금한 당신을 위해',
    template: '%s | 딱!세줄',
  },
  description: '길고 복잡한 뉴스는 이제 그만! 딱!세줄이 핵심만 짚어 드립니다. 실시간 뉴스 3줄 요약부터 커뮤니티 실시간 반응까지 한눈에 확인하세요.',
  keywords: ['뉴스요약', '3줄요약', '실시간뉴스', '뉴스브리핑', '커뮤니티반응', '딱세줄', '뉴스정리'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '딱!세줄',
  },
  openGraph: {
    type: 'website',
    url: BASE_URL,
    siteName: '딱!세줄',
    locale: 'ko_KR',
    title: '딱!세줄: 뉴스는 읽기 귀찮고 세상 돌아가는 건 궁금한 당신을 위해',
    description: '딱!세줄이 핵심만 짚어 드립니다. 3줄 뉴스 요약과 실시간 커뮤니티 반응을 지금 확인하세요.',
    images: [
      {
        url: '/SEO.png',
        width: 1200,
        height: 630,
        alt: '딱!세줄 - 3줄 뉴스 요약',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '딱!세줄 - 핵심만 짚어 드리는 3줄 뉴스',
    description: '읽기 귀찮은 뉴스, 딱!세줄이 핵심만 짚어 드립니다. 실시간 커뮤니티 반응까지 한 번에!',
    images: ['/SEO.png'],
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: '/logo_symbol.svg',
    shortcut: '/logo_symbol.svg',
    apple: '/logo_symbol.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}

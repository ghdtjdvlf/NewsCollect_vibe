import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Clock, MessageSquare, ExternalLink } from 'lucide-react'
import type { NewsItem } from '@/types/news'

interface Props {
  params: { category: string; slug: string }
}

async function getNewsItem(slug: string): Promise<NewsItem | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/news/${slug}`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getNewsItem(params.slug)
  if (!item) return { title: '뉴스를 찾을 수 없습니다' }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

  return {
    title: item.title,
    description: item.summary ?? item.title,
    openGraph: {
      title: item.title,
      description: item.summary ?? item.title,
      type: 'article',
      publishedTime: item.publishedAt,
      authors: [item.sourceName],
      images: item.thumbnail ? [{ url: item.thumbnail }] : [],
    },
    alternates: {
      canonical: `${baseUrl}/news/${params.category}/${params.slug}`,
    },
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function NewsDetailPage({ params }: Props) {
  const item = await getNewsItem(params.slug)
  if (!item) notFound()

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

  // JSON-LD NewsArticle 스키마
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: item.title,
    description: item.summary ?? item.title,
    image: item.thumbnail ? [item.thumbnail] : [],
    datePublished: item.publishedAt,
    dateModified: item.collectedAt,
    author: [{ '@type': 'Organization', name: item.sourceName }],
    publisher: {
      '@type': 'Organization',
      name: 'Liquid News KR',
      logo: { '@type': 'ImageObject', url: `${baseUrl}/icon-192.png` },
    },
    url: `${baseUrl}/news/${params.category}/${params.slug}`,
    mainEntityOfPage: `${baseUrl}/news/${params.category}/${params.slug}`,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-white">
        {/* 헤더 */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 safe-top">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-sm font-medium text-gray-700 truncate">{item.sourceName}</span>
          </div>
        </header>

        <main className="px-4 pb-12 max-w-2xl mx-auto">
          {/* 카테고리 */}
          <div className="mt-5 mb-3">
            <span className="text-xs font-medium bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">
              {item.category}
            </span>
          </div>

          {/* 제목 */}
          <h1 className="text-xl font-bold text-gray-900 leading-snug mb-3">
            {item.title}
          </h1>

          {/* 메타 */}
          <div className="flex items-center gap-3 text-xs text-gray-400 mb-5">
            <span className="font-medium text-gray-600">{item.sourceName}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(item.publishedAt)}
            </span>
            {item.commentCount !== undefined && (
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {item.commentCount.toLocaleString()}
              </span>
            )}
          </div>

          {/* 썸네일 */}
          {item.thumbnail && (
            <div className="relative w-full h-52 rounded-2xl overflow-hidden mb-6">
              <Image
                src={item.thumbnail}
                alt={item.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {/* 본문 요약 */}
          {item.summary && (
            <p className="text-gray-600 leading-relaxed text-[15px] mb-8">
              {item.summary}
            </p>
          )}

          {/* 원문 링크 */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-indigo-500 text-white text-sm font-medium"
          >
            원문 기사 보기 <ExternalLink className="w-4 h-4" />
          </a>
        </main>
      </div>
    </>
  )
}

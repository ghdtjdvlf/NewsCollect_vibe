import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://liquidnews.kr'

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 1,
    },
    {
      url: `${baseUrl}/?tab=trending`,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/?tab=latest`,
      lastModified: new Date(),
      changeFrequency: 'always',
      priority: 0.9,
    },
    // 카테고리별 페이지
    ...['경제', '사건사고', '사회', '정치', 'IT/과학'].map((cat) => ({
      url: `${baseUrl}/?tab=latest&category=${encodeURIComponent(cat)}`,
      lastModified: new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    })),
  ]
}

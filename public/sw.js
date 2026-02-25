const CACHE_NAME = 'liquid-news-v1'
const STATIC_ASSETS = ['/', '/manifest.json']

// 설치: 정적 자산 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// 활성화: 이전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: Network-first (API), Cache-first (정적)
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API 요청: Network-first → 실패 시 캐시
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return res
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // 페이지/정적 파일: Cache-first → 없으면 네트워크
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request))
  )
})

# Liquid News KR — CLAUDE.md

## MCP 설치
```bash
/plugin install firecrawl
/mcp add playwright          # 언론사 개별 사이트 (JS 렌더링 필수)
/mcp add google-search
claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking
```
> 크롤링 순서: Firecrawl 우선 → 실패 시 Playwright 폴백. 디시·에펨·언론사 개별 사이트는 처음부터 Playwright.

## 패키지 설치
```bash
npm install framer-motion gsap @gsap/react lottie-react
npm install lucide-react clsx tailwind-merge
npm install @tanstack/react-query zustand axios
npm install -D typescript @types/react @types/node prettier eslint
```

## 프로젝트 구조
```
src/
├── components/ui/       # 버튼, 카드 등 원자 단위
├── components/layout/   # 헤더, 탭바 등
├── features/news/       # 뉴스 도메인 로직
├── hooks/               # 커스텀 훅
├── lib/                 # 유틸, API 클라이언트, crawlLogger.ts
├── stores/              # Zustand 전역 상태
├── types/               # TypeScript 타입
└── assets/lottie/       # Lottie JSON 파일
```

## 코드 규칙
- TypeScript strict, `any` 금지
- 함수형 컴포넌트, `React.FC` 대신 명시적 Props 타입
- 스타일: Tailwind + `cn()` (clsx + tailwind-merge), CSS-in-JS 금지
- GSAP은 반드시 `useGSAP()` 사용 (`useEffect` 내 직접 호출 금지)
- async 함수 전부 try-catch, 컴포넌트 단위 ErrorBoundary 적용
- API fetch 로직은 훅으로 분리, 컴포넌트 내부 작성 금지

## 애니메이션 규칙
```ts
// Liquid 전환 — 이 값 고정
const liquidSpring = { type: "spring", bounce: 0.4, duration: 0.6 }

// GSAP Blob — GPU 가속, transform만 사용
gsap.to(".blob", { x: "random(-40,40)", y: "random(-40,40)", ease: "sine.inOut", yoyo: true, repeat: -1 })
```
- `layout` prop은 확장 컨테이너에만, 리스트 전체에 남용 금지

## 글래스모피즘 토큰
```css
bg: rgba(255,255,255,0.08)   border: 1px solid rgba(255,255,255,0.2)
blur: backdrop-filter: blur(25px)   shadow: 0 8px 32px rgba(0,0,0,0.2)
```

## 데이터 수집 로깅
크롤링 실행마다 `src/lib/crawlLogger.ts`에 기록:
```ts
type CrawlLog = {
  timestamp: string
  source: 'naver' | 'daum' | 'google' | 'dcinside' | 'fmkorea' | 'clien'
  method: 'firecrawl' | 'playwright'
  collected: number       // 수집 기사 수
  deduplicated: number    // 중복 제거 후
  filtered: number        // 커뮤니티 필터 통과 (화제뉴스)
  failed: number
  duration_ms: number
}
```
> 실패율 > 20% → 자동 Playwright 전환. 연속 3회 실패 → 해당 소스 skip + 경고 로그.

## 첫 작업 순서
1. `src/types/news.ts`
2. `src/lib/cn.ts` + `src/lib/crawlLogger.ts`
3. `src/components/ui/BlobBackground.tsx`
4. `src/components/NewsCard.tsx` (Framer Motion 확장 + GSAP Blob)
5. `src/features/news/useNewsQuery.ts`
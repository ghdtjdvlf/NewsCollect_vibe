# PRD: Firebase 배치 요약 시스템

## 목표
3분마다 모든 뉴스 기사를 수집하여 AI 3줄요약 + 결론을 Firebase Firestore에 저장하고,
사용자가 요청 시 DB에서 즉시 반환하는 구조로 전환.

## 현재 구조 (문제점)
- 사용자가 카드 클릭 → `/api/summarize` → Gemini API 실시간 호출 → 3~5초 대기
- 사용자마다 Gemini API 호출 발생 → 429 에러 빈번
- 모델: `gemini-2.0-flash` (하루 1,500회 무료)

## 목표 구조
```
[크론 스케줄러 - cron-job.org]
  └─ 3분마다 POST /api/batch 호출
      ├─ 뉴스 크롤러 실행 (기존 로직 재사용)
      ├─ Firestore에 없는 새 기사만 필터링
      ├─ Gemini 30건씩 배치 요약 (3줄 + 결론)
      └─ Firestore summaries/{newsId} 저장

[사용자 카드 클릭]
  └─ POST /api/summarize
      ├─ Firestore에서 newsId로 조회
      ├─ 있으면 → 즉시 반환 (0초)
      └─ 없으면 → Gemini 실시간 생성 → Firestore 저장 후 반환
```

## Firebase Firestore 구조
```
summaries/
  {newsId}/
    lines: string[]        // 3줄 요약 배열
    conclusion: string     // 결론 비유
    title: string          // 기사 제목 (참조용)
    generatedAt: Timestamp // 생성 시각
    source: string         // 출처 (naver/daum 등)
```

## 구현 파일 목록

### 신규 생성
| 파일 | 역할 |
|------|------|
| `src/lib/firebase.ts` | Firebase Admin SDK 초기화 |
| `src/app/api/batch/route.ts` | 배치 수집+요약+저장 엔드포인트 |

### 수정
| 파일 | 변경 내용 |
|------|---------|
| `src/app/api/summarize/route.ts` | Firestore 먼저 조회 → 없으면 실시간 생성 |
| `.env.local` | Firebase 환경변수 추가 |

## 환경변수 (.env.local 추가 필요)
```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

## Gemini 배치 프롬프트 형식
```
다음 뉴스들을 각각 3줄(음슴체)로 요약하고 결론을 추가해줘.

[1] 제목: ...
내용: ...

[2] 제목: ...
내용: ...

출력 형식 (반드시 준수):
[1]
줄1
줄2
줄3
결론: 비유내용

[2]
...
```

## 배치 처리 로직
1. `/api/news?type=trending` + `/api/news?type=latest` 호출로 전체 기사 수집
2. Firestore에서 이미 요약된 newsId 목록 조회
3. 새 기사만 필터링
4. 30건씩 청크로 나눠서 Gemini 순차 호출 (RPM 초과 방지)
5. 파싱 후 Firestore 개별 저장

## 호출량 계산
| 항목 | 수치 |
|------|------|
| 주기 | 3분 |
| 신규 기사/주기 | 약 5~10건 |
| Gemini 호출/주기 | 1회 |
| 하루 총 호출 | 약 480회 |
| 무료 한도 | 1,500회/일 ✅ |

## 외부 크론 설정 (cron-job.org)
- URL: `https://spnewscollet.netlify.app/api/batch`
- Method: POST
- Header: `x-cron-secret: {CRON_SECRET}`
- 주기: 3분
- 인증: 환경변수 `CRON_SECRET`으로 무단 호출 방지

## 구현 순서
1. [ ] Firebase 프로젝트 생성 + Firestore 활성화 (사용자)
2. [ ] Firebase 서비스 계정 키 발급 + .env.local 추가 (사용자)
3. [ ] `src/lib/firebase.ts` 작성
4. [ ] `src/app/api/batch/route.ts` 작성
5. [ ] `src/app/api/summarize/route.ts` 수정 (Firestore 우선 조회)
6. [ ] 로컬 테스트 (`/api/batch` 직접 POST)
7. [ ] Netlify 배포 + 환경변수 설정
8. [ ] cron-job.org 등록

## 완료 기준
- 카드 클릭 시 요약이 즉시(0초) 표시됨
- Gemini 429 에러 없음
- Firebase 콘솔에서 summaries 컬렉션에 데이터 쌓임
- cron-job.org 실행 로그 정상 확인

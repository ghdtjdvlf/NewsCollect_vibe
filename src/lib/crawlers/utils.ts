import type { NewsCategory } from '@/types/news'
import { createHash } from 'crypto'

let counter = 0

// URL 기반 안정적 ID — 같은 기사는 항상 같은 ID 반환
export function stableId(url: string, prefix = 'n'): string {
  const hash = createHash('md5').update(url).digest('hex').slice(0, 12)
  return `${prefix}_${hash}`
}

// 하위 호환: URL 없는 경우에만 사용
export function randomId(prefix = 'n'): string {
  return `${prefix}_${Date.now()}_${(++counter).toString(36)}`
}

// 한국어 상대시간 → Date 변환
function parseKoreanRelativeDate(str: string): Date | null {
  const s = str.trim()
  const now = new Date()

  // "방금", "방금 전"
  if (/^방금/.test(s)) return now

  // "X분 전"
  const min = s.match(/^(\d+)분\s*전$/)
  if (min) { const d = new Date(now); d.setMinutes(d.getMinutes() - +min[1]); return d }

  // "X시간 전"
  const hour = s.match(/^(\d+)시간\s*전$/)
  if (hour) { const d = new Date(now); d.setHours(d.getHours() - +hour[1]); return d }

  // "어제"
  if (/^어제/.test(s)) { const d = new Date(now); d.setDate(d.getDate() - 1); return d }

  // "X일 전"
  const day = s.match(/^(\d+)일\s*전$/)
  if (day) { const d = new Date(now); d.setDate(d.getDate() - +day[1]); return d }

  // "2026. 2. 25. 17:21" or "2025.01.15. 오후 3:45" or "2025.01.15."
  // 점 뒤 공백 허용 (\.\s*)
  const full = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(?:(오전|오후)?\s*(\d{1,2}):(\d{2}))?/)
  if (full) {
    let h = full[5] ? +full[5] : 0
    const m = full[6] ? +full[6] : 0
    if (full[4] === '오후' && h < 12) h += 12
    if (full[4] === '오전' && h === 12) h = 0
    return new Date(+full[1], +full[2] - 1, +full[3], h, m)
  }

  // "01.15. 오후 3:45" or "01.15." (올해 기준)
  const short = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(?:(오전|오후)?\s*(\d{1,2}):(\d{2}))?/)
  if (short) {
    let h = short[4] ? +short[4] : 0
    const m = short[5] ? +short[5] : 0
    if (short[3] === '오후' && h < 12) h += 12
    if (short[3] === '오전' && h === 12) h = 0
    return new Date(now.getFullYear(), +short[1] - 1, +short[2], h, m)
  }

  return null
}

export function toIso(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString()

  // 한국어 상대시간 먼저 시도
  const korean = parseKoreanRelativeDate(dateStr)
  if (korean) return korean.toISOString()

  // 일반 날짜 문자열 파싱
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch { /* fall through */ }

  return new Date().toISOString()
}

// ─── summary 정제 ─────────────────────────────────────────
const NOISE_PATTERNS: RegExp[] = [
  /무단\s*전재(\s*및\s*재배포)?\s*(금지|禁止)?.*$/i,
  /저작권.*$/i,
  /ⓒ\s*\S+.*$/,
  /Copyright\s*.*$/i,
  /\[\s*[가-힣]{2,5}\s*기자\s*\]/,
  /[가-힣]{2,5}\s*기자\s*=?\s*$/,
]

export function cleanSummary(raw: string): string | undefined {
  let text = raw.trim()
  if (!text) return undefined

  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, '').trim()
  }

  // 끝에 붙는 " - 언론사명" 또는 " | 언론사명" 제거
  text = text.replace(/\s+[-–—|]\s+[가-힣a-zA-Z0-9\s()]{2,20}$/, '').trim()
  text = text.replace(/\s+/g, ' ').trim()

  if (!text) return undefined
  return text.slice(0, 300) || undefined
}

// 제목 기반 카테고리 추정 (공통)
export function guessCategory(title: string): NewsCategory {
  if (/코스피|코스닥|금리|환율|주가|경제|GDP|물가|금융|주식|부동산|증시|채권|수출|수입|무역|원자재|원유|유가|기업|ETF/.test(title))
    return '경제'
  if (/사고|화재|추락|사망|부상|범죄|경찰|검거|체포|살인|강도|폭행|절도|실종|익사|교통사고|형사|구속|기소/.test(title))
    return '사건사고'
  if (/대통령|국회|정부|여당|야당|선거|장관|총리|국정|정치|법안|이재명|국민의힘|민주당|내란|특검|윤석열|탄핵|검찰|의원/.test(title))
    return '정치'
  if (/AI|인공지능|반도체|삼성|LG|카카오|네이버|애플|구글|메타|IT|챗GPT|테슬라|엔비디아|로봇|드론|과학|우주|양자/.test(title))
    return 'IT/과학'
  if (/월드컵|올림픽|축구|야구|농구|배구|스포츠|선수|경기|리그|감독|골프|수영|육상|테니스|격투/.test(title))
    return '스포츠'
  if (/드라마|영화|아이돌|연예|가수|배우|음악|콘서트|팬덤|예능|방송|OTT|넷플릭스/.test(title))
    return '연예'
  if (/미국|중국|일본|러시아|북한|유럽|해외|외교|전쟁|국제|이란|이스라엘|하마스|우크라이나|팔레스타인|중동|NATO|UN|트럼프|하메네이|두바이|호르무즈/.test(title))
    return '세계'
  if (/복지|교육|의료|병원|환경|사회|시민|학교|학생|민생|취업|일자리|저출생|인구|재난|기후/.test(title))
    return '사회'
  return '기타'
}

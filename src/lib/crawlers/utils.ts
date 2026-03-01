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

export function toIso(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString()
  try {
    return new Date(dateStr).toISOString()
  } catch {
    return new Date().toISOString()
  }
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

import type { NewsCategory } from '../../types/news'
import { createHash } from 'crypto'

let counter = 0

export function stableId(url: string, prefix = 'n'): string {
  const hash = createHash('md5').update(url).digest('hex').slice(0, 12)
  return `${prefix}_${hash}`
}

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

export function guessCategory(title: string): NewsCategory {
  if (/코스피|코스닥|금리|환율|주가|경제|GDP|물가|금융|주식|부동산|증시|채권/.test(title))
    return '경제'
  if (/사고|화재|추락|사망|부상|범죄|경찰|검거|체포|살인|강도|폭행|절도/.test(title))
    return '사건사고'
  if (/대통령|국회|정부|여당|야당|선거|장관|총리|국정|정치|법안/.test(title))
    return '정치'
  if (/AI|반도체|삼성|LG|카카오|네이버|애플|구글|메타|IT|챗GPT|테슬라|엔비디아/.test(title))
    return 'IT/과학'
  if (/월드컵|올림픽|축구|야구|농구|배구|스포츠|선수|경기|리그|감독/.test(title))
    return '스포츠'
  if (/드라마|영화|아이돌|연예|가수|배우|음악|콘서트|팬덤/.test(title))
    return '연예'
  if (/미국|중국|일본|러시아|북한|유럽|해외|외교|전쟁|국제/.test(title))
    return '세계'
  if (/복지|교육|의료|병원|환경|사회|시민|학교|학생/.test(title))
    return '사회'
  return '기타'
}

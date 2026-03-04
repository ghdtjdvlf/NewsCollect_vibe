import axios from 'axios'
import type {
  NewsResponse,
  TrendingPageResponse,
  SearchResponse,
  FetchNewsParams,
  SearchParams,
} from '@/types/news'

const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

export const newsApi = {
  getTrending: async (offset = 0): Promise<TrendingPageResponse> => {
    const { data } = await client.get<TrendingPageResponse>('/trending', {
      params: { offset },
    })
    return data
  },

  getLatest: async (params: FetchNewsParams = {}): Promise<NewsResponse> => {
    const { cursor, ...rest } = params
    const { data } = await client.get<NewsResponse>('/latest', {
      params: cursor ? { ...rest, cursor } : rest,
    })
    return data
  },

  search: async (params: SearchParams): Promise<SearchResponse> => {
    const { data } = await client.get<SearchResponse>('/search', { params })
    return data
  },
}

import axios from 'axios'
import type {
  NewsResponse,
  TrendingResponse,
  SearchResponse,
  FetchNewsParams,
  SearchParams,
} from '@/types/news'

const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

export const newsApi = {
  getTrending: async (): Promise<TrendingResponse> => {
    const { data } = await client.get<TrendingResponse>('/trending')
    return data
  },

  getLatest: async (params: FetchNewsParams = {}): Promise<NewsResponse> => {
    const { data } = await client.get<NewsResponse>('/latest', { params })
    return data
  },

  search: async (params: SearchParams): Promise<SearchResponse> => {
    const { data } = await client.get<SearchResponse>('/search', { params })
    return data
  },
}

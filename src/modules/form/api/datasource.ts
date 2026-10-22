import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'

export interface ManagedDatasource {
  id: string
  name: string
  type: 'postgresql' | 'mysql' | 'h2' | 'oracle'
  jdbcUrl: string
  driverClass: string
  username: string
  readOnly: number
  enabled: number
  updateTime?: string
}

export interface ManagedDatasourcePayload {
  name: string
  type: ManagedDatasource['type']
  jdbcUrl: string
  driverClass: string
  username: string
  password?: string
  readOnly: number
  enabled: number
}

interface BackendPage<T> {
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

export async function pageManagedDatasources(
  page: PageQuery,
  filter: { name?: string; enabled?: number },
): Promise<PageResult<ManagedDatasource>> {
  const raw = await request<BackendPage<ManagedDatasource>>({
    method: 'GET',
    url: '/workflow/external-datasource/page',
    params: { ...page, ...filter },
  })
  return { list: raw.records, total: raw.total, pageNum: raw.pageNum, pageSize: raw.pageSize }
}

export function createManagedDatasource(payload: ManagedDatasourcePayload): Promise<string> {
  return request({ method: 'POST', url: '/workflow/external-datasource', data: payload })
}

export function updateManagedDatasource(
  id: string,
  payload: ManagedDatasourcePayload,
): Promise<void> {
  return request({ method: 'PUT', url: `/workflow/external-datasource/${id}`, data: payload })
}

export function deleteManagedDatasource(id: string): Promise<void> {
  return request({ method: 'DELETE', url: `/workflow/external-datasource/${id}` })
}

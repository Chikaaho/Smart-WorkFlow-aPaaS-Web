import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'

/**
 * request 已统一以 /api 为 baseURL。这里使用服务端 Controller 映射中
 * /api 之后的部分，避免形成 /api/api/workflow 的双前缀。
 */
const DATASOURCE_BASE = '/workflow/external-datasource'

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

export type DatasourceGrantSubjectType = 'ROLE' | 'USER'

export interface DatasourceGrant {
  subjectType: DatasourceGrantSubjectType
  subjectKey: string
}

export interface ExtQueryContractField {
  name: string
  type: string
}

export interface ExtQueryContract {
  queryKey: string
  queryVersion: number
  datasourceId: string
  outputFields: ExtQueryContractField[]
  enabled: number | boolean
}

export interface ExtQueryContractFilter {
  queryKey?: string
  enabled?: number
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
    url: `${DATASOURCE_BASE}/page`,
    params: { ...page, ...filter },
  })
  return { list: raw.records, total: raw.total, pageNum: raw.pageNum, pageSize: raw.pageSize }
}

export function createManagedDatasource(payload: ManagedDatasourcePayload): Promise<string> {
  return request({ method: 'POST', url: DATASOURCE_BASE, data: payload })
}

export function updateManagedDatasource(
  id: string,
  payload: ManagedDatasourcePayload,
): Promise<void> {
  return request({ method: 'PUT', url: `${DATASOURCE_BASE}/${id}`, data: payload })
}

export function deleteManagedDatasource(id: string): Promise<void> {
  return request({ method: 'DELETE', url: `${DATASOURCE_BASE}/${id}` })
}

/** 指定数据源的授权主体；无权管理时由服务端拒绝，页面按错误展示。 */
export function listDatasourceGrants(id: string): Promise<DatasourceGrant[]> {
  return request<DatasourceGrant[]>({
    method: 'GET',
    url: `${DATASOURCE_BASE}/${id}/grants`,
  })
}

/** 整集合替换授权主体；传空数组即撤销全部授权。 */
export async function replaceDatasourceGrants(
  id: string,
  grants: DatasourceGrant[],
): Promise<void> {
  await request<void>({
    method: 'PUT',
    url: `${DATASOURCE_BASE}/${id}/grants`,
    data: { grants },
  })
}

/** 当前登录主体可引用的查询契约（管理员可见全部），响应不含 SQL。 */
export function listExtQueryContracts(
  filter: ExtQueryContractFilter = {},
): Promise<ExtQueryContract[]> {
  return request<ExtQueryContract[]>({
    method: 'GET',
    url: '/form/ext/query-contracts',
    params: filter,
  })
}

/** 启停某个查询标识的最新版本。 */
export async function setExtQueryContractEnabled(
  queryKey: string,
  enabled: boolean,
): Promise<void> {
  await request<void>({
    method: 'PUT',
    url: `/form/ext/query-contract/${encodeURIComponent(queryKey)}/status`,
    data: { enabled },
  })
}

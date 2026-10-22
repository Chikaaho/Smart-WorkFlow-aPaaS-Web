/**
 * 租户管理 API（0.2.0 T020）。
 *
 * 全部经 foundation/request 单一请求层；后端 R<T> 由 request() 解包。
 * 页面响应沿用 PageResult.records 形状，适配为前端 PageResult.list。
 */
import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type {
  SysTenant,
  TenantFilter,
  TenantCreatePayload,
  TenantAdminCandidate,
} from '@/modules/system/types/tenant'

interface BackendPageResult<T> {
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

function adaptPage<T>(raw: BackendPageResult<T>): PageResult<T> {
  return {
    list: raw.records,
    total: raw.total,
    pageNum: raw.pageNum,
    pageSize: raw.pageSize,
  }
}

/** GET /system/tenant/page?pageNum=&pageSize=&name=&status= */
export async function pageTenants(
  page: PageQuery,
  filter: TenantFilter,
): Promise<PageResult<SysTenant>> {
  const raw = await request<BackendPageResult<SysTenant>>({
    method: 'GET',
    url: '/system/tenant/page',
    params: {
      pageNum: page.pageNum,
      pageSize: page.pageSize,
      name: filter.name || undefined,
      status: filter.status,
    },
  })
  return adaptPage(raw)
}

/** GET /system/tenant/{id} */
export async function getTenant(id: string): Promise<SysTenant> {
  return request<SysTenant>({ method: 'GET', url: `/system/tenant/${id}` })
}

/** POST /system/tenant —— 租户、首任管理员与根部门一次建立 */
export async function createTenant(payload: TenantCreatePayload): Promise<string> {
  return request<string>({ method: 'POST', url: '/system/tenant', data: payload })
}

/** PUT /system/tenant/{id} —— 仅修改名称 */
export async function renameTenant(id: string, name: string): Promise<void> {
  return request<void>({ method: 'PUT', url: `/system/tenant/${id}`, data: { name } })
}

/** PUT /system/tenant/{id}/status —— 0=启用 1=停用 */
export async function updateTenantStatus(id: string, status: number): Promise<void> {
  return request<void>({ method: 'PUT', url: `/system/tenant/${id}/status`, data: { status } })
}

export function queryTenantAdministrators(id: string): Promise<TenantAdminCandidate[]> {
  return request({ method: 'GET', url: `/system/tenant/${id}/administrators` })
}

export function assignTenantAdministrator(id: string, adminUserId: string): Promise<void> {
  return request({
    method: 'PUT',
    url: `/system/tenant/${id}/administrator`,
    data: { adminUserId },
  })
}

export function createTenantAdministrator(
  id: string,
  adminUsername: string,
  adminPassword: string,
): Promise<string> {
  return request({
    method: 'POST',
    url: `/system/tenant/${id}/administrator`,
    data: { adminUsername, adminPassword },
  })
}

/**
 * 角色管理 API 层 —— 5 个 CRUD 函数。
 *
 * 全部经 foundation/request 单一请求层，禁直引 axios。
 * 后端统一响应 R<T> 由 request() 解包，本层直接拿到 data: T。
 */
import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type { SysRole, RoleFilter } from '@/modules/system/types/role'

// ─── 后端分页原始形状 ───

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

// ═══════════════════════════════════════

/** POST /system/role/page?pageNum=&pageSize= + body 筛选 */
export async function pageRoles(page: PageQuery, filter: RoleFilter): Promise<PageResult<SysRole>> {
  const raw = await request<BackendPageResult<SysRole>>({
    method: 'POST',
    url: '/system/role/page',
    params: page,
    data: filter,
  })
  return adaptPage(raw)
}

/** GET /system/role/{id} */
export async function getRole(id: string): Promise<SysRole> {
  return request<SysRole>({ method: 'GET', url: `/system/role/${id}` })
}

/** POST /system/role → R<Long> */
export async function createRole(data: SysRole): Promise<string> {
  return request<string>({ method: 'POST', url: '/system/role', data })
}

/** PUT /system/role → R<Void> */
export async function updateRole(data: SysRole): Promise<void> {
  return request<void>({ method: 'PUT', url: '/system/role', data })
}

/** DELETE /system/role/{id} → R<Void> */
export async function deleteRole(id: string): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/system/role/${id}` })
}

/**
 * 角色菜单/按钮权限绑定（M02-F02/F03）。
 *
 * 防腐层：后端契约（step1 §5）为 `R<List<Long>>`，真实载荷是**数字数组**
 * （项目 Jackson 配置 Long→String 影响对象字段 id，不影响数组元素类型）。
 * 页面权限树 node-key 为 string，此处统一在 API 层做 number↔string 双向转换，
 * 避免数字/字符串漂移导致 setCheckedKeys 回填失效或保存错位。
 */
function toNumberArray(ids: string[]): number[] {
  return ids.map((id) => Number(id))
}

function toStringArray(ids: number[]): string[] {
  return ids.map((id) => String(id))
}

export async function getRoleMenus(id: string): Promise<string[]> {
  const menuIds = await request<number[]>({ method: 'GET', url: `/system/role/${id}/menus` })
  return toStringArray(menuIds)
}

export async function updateRoleMenus(id: string, menuIds: string[]): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/system/role/${id}/menus`,
    data: toNumberArray(menuIds),
  })
}

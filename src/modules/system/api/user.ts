/**
 * 用户管理 API 层 —— 5 个 CRUD 函数。
 *
 * 全部经 foundation/request 单一请求层，禁直引 axios。
 * 后端统一响应 R<T> 由 request() 解包，本层直接拿到 data: T。
 * 创建/更新使用 UserFormRequest DTO（含 plainPassword 字段）。
 */
import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type { SysUser, UserFormRequest, UserFilter } from '@/modules/system/types/user'

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

/** POST /system/user/page?pageNum=&pageSize= + body 筛选
 *  NOTE: 后端 SysUserService.page(PageParam) 当前不支持 query 筛选，
 *  body 参数后端接受但不使用（已知限制，后续增强） */
export async function pageUsers(page: PageQuery, filter: UserFilter): Promise<PageResult<SysUser>> {
  const raw = await request<BackendPageResult<SysUser>>({
    method: 'POST',
    url: '/system/user/page',
    params: page,
    data: {
      username: filter.username,
      realName: filter.realName,
      keyword: filter.username || filter.realName,
      status: filter.status,
      deptId: filter.deptId,
      postId: filter.postId,
      roleId: filter.roleId,
    },
  })
  return adaptPage(raw)
}

/** GET /system/user/{id} */
export async function getUser(id: string): Promise<SysUser> {
  return request<SysUser>({
    method: 'GET',
    url: `/system/user/${id}`,
  })
}

/** POST /system/user → R<Long> */
export async function createUser(data: UserFormRequest): Promise<string> {
  return request<string>({
    method: 'POST',
    url: '/system/user',
    data,
  })
}

/** PUT /system/user → R<Void> */
export async function updateUser(data: UserFormRequest): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: '/system/user',
    data,
  })
}

/** DELETE /system/user/{id} → R<Void> */
export async function deleteUser(id: string): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/system/user/${id}`,
  })
}

export async function getUserRoles(id: string): Promise<string[]> {
  return request<string[]>({ method: 'GET', url: `/system/user/${id}/roles` })
}

export async function updateUserRoles(id: string, roleIds: string[]): Promise<void> {
  return request<void>({ method: 'PUT', url: `/system/user/${id}/roles`, data: roleIds })
}

export async function getUserPosts(id: string): Promise<string[]> {
  return request<string[]>({ method: 'GET', url: `/system/user/${id}/posts` })
}

export async function updateUserPosts(id: string, postIds: string[]): Promise<void> {
  return request<void>({ method: 'PUT', url: `/system/user/${id}/posts`, data: postIds })
}

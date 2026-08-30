/**
 * 用户组管理 API 层。
 *
 * 全部经 foundation/request 单一请求层，禁直引 axios。
 * 后端统一响应 R<T> 由 request() 解包，本层直接拿到 data: T。
 * 权限：查看 system:userGroup:list，管理 system:userGroup:manage。
 */
import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type {
  SysUserGroup,
  UserGroupFormRequest,
  UserGroupFilter,
} from '@/modules/system/types/userGroup'
import type { SysUser as UserEntity } from '@/modules/system/types/user'

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

/** POST /system/user-group/page?pageNum=&pageSize= + body 筛选 */
export async function pageUserGroups(
  page: PageQuery,
  filter: UserGroupFilter,
): Promise<PageResult<SysUserGroup>> {
  const raw = await request<BackendPageResult<SysUserGroup>>({
    method: 'POST',
    url: '/system/user-group/page',
    params: page,
    data: {
      groupCode: filter.groupCode,
      groupName: filter.groupName,
      status: filter.status,
    },
  })
  return adaptPage(raw)
}

/** GET /system/user-group/{id}（含成员回填） */
export async function getUserGroup(id: string): Promise<SysUserGroup> {
  return request<SysUserGroup>({ method: 'GET', url: `/system/user-group/${id}` })
}

/** POST /system/user-group → R<Long> */
export async function createUserGroup(data: UserGroupFormRequest): Promise<string> {
  return request<string>({ method: 'POST', url: '/system/user-group', data })
}

/** PUT /system/user-group → R<Void> */
export async function updateUserGroup(data: UserGroupFormRequest): Promise<void> {
  return request<void>({ method: 'PUT', url: '/system/user-group', data })
}

/** DELETE /system/user-group/{id} → R<Void>（逻辑删除，连同成员） */
export async function deleteUserGroup(id: string): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/system/user-group/${id}` })
}

/** PUT /system/user-group/{id}/disable 停用（保留配置与成员） */
export async function disableUserGroup(id: string): Promise<void> {
  return request<void>({ method: 'PUT', url: `/system/user-group/${id}/disable` })
}

/** PUT /system/user-group/{id}/enable 启用 */
export async function enableUserGroup(id: string): Promise<void> {
  return request<void>({ method: 'PUT', url: `/system/user-group/${id}/enable` })
}

/** GET /system/user-group/{id}/members → 成员 ID 列表 */
export async function getUserGroupMembers(id: string): Promise<string[]> {
  return request<string[]>({ method: 'GET', url: `/system/user-group/${id}/members` })
}

/** PUT /system/user-group/{id}/members 整量替换（空数组=清空） */
export async function updateUserGroupMembers(id: string, userIds: string[]): Promise<void> {
  return request<void>({ method: 'PUT', url: `/system/user-group/${id}/members`, data: userIds })
}

/** POST /system/user-group/{id}/members 追加 */
export async function addUserGroupMembers(id: string, userIds: string[]): Promise<void> {
  return request<void>({ method: 'POST', url: `/system/user-group/${id}/members`, data: userIds })
}

/** DELETE /system/user-group/{id}/members 移除 */
export async function removeUserGroupMembers(id: string, userIds: string[]): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/system/user-group/${id}/members`, data: userIds })
}

/** GET /system/user-group/candidates?pageNum=&pageSize=&keyword= 成员候选用户（仅启用+数据范围） */
export async function getUserGroupCandidates(
  page: PageQuery,
  keyword?: string,
): Promise<PageResult<UserEntity>> {
  const raw = await request<BackendPageResult<UserEntity>>({
    method: 'GET',
    url: '/system/user-group/candidates',
    params: { ...page, keyword },
  })
  return adaptPage(raw)
}

import { request } from '@/foundation/request'
import { listDeptTree } from '@/adapters/org-dept'
import type { SysDept } from '@/adapters/org-dept'

/**
 * I2 表单收口 API 模块：
 * 人员/部门候选、受控外部数据源查询、列表展示配置、生命周期（停用/启用）。
 * 全部走 foundation/request，禁直引 axios。
 */

// ==================== 人员/部门候选 ====================

export interface UserChoice {
  id: string
  label: string
}

/** 用户候选选项（/system/user/options，登录即可调用；最小展示字段，服务端租户过滤）。 */
interface UserOption {
  id: string | number
  username?: string
  realName?: string
  deptId?: string | number | null
}

async function userOptions(limit: number): Promise<UserChoice[]> {
  const list = await request<UserOption[]>({
    method: 'GET',
    url: '/system/user/options',
    params: { limit },
  })
  return (list ?? []).map((u) => ({
    id: String(u.id),
    label: u.realName || u.username || String(u.id),
  }))
}

export async function loadUserChoices(): Promise<UserChoice[]> {
  return userOptions(100)
}

/** 服务端组织目录快照原始形状（只含启用目录与有效关联，不含凭据/权限码）。 */
interface ScriptOrgContextResponse {
  users?: Array<{
    id: string | number
    name: string
    deptId?: string | number | null
    roleIds?: Array<string | number>
    postIds?: Array<string | number>
  }>
  depts?: Array<{ id: string | number; name: string; parentId?: string | number | null }>
  roles?: Array<{ id: string | number; code: string; name: string }>
  posts?: Array<{ id: string | number; code: string; name: string }>
}

/**
 * 表单脚本组织目录快照：服务端按当前租户返回启用用户/部门/角色/岗位与有效成员关系。
 * 不按管理端权限扩大读取范围；未装载时脚本组织函数明确报错。
 */
export async function loadScriptOrgContext(): Promise<
  import('../utils/script-hosts').ScriptOrgContext
> {
  const raw = await request<ScriptOrgContextResponse>({
    method: 'GET',
    url: '/system/org/script-context',
  })
  const idText = (value: string | number | null | undefined): string | null =>
    value === null || value === undefined || value === '' ? null : String(value)
  return {
    users: (raw.users ?? []).map((user) => ({
      id: String(user.id),
      name: user.name,
      deptId: idText(user.deptId),
      roleIds: (user.roleIds ?? []).map(String),
      postIds: (user.postIds ?? []).map(String),
    })),
    depts: (raw.depts ?? []).map((dept) => ({
      id: String(dept.id),
      name: dept.name,
      parentId: idText(dept.parentId),
    })),
    roles: (raw.roles ?? []).map((role) => ({
      id: String(role.id),
      code: role.code,
      name: role.name,
    })),
    posts: (raw.posts ?? []).map((post) => ({
      id: String(post.id),
      code: post.code,
      name: post.name,
    })),
  }
}

export interface DeptChoice {
  id: string
  label: string
  /** 部门名（无缩进）；旧调用方只用 label，新增字段为附加信息。 */
  name?: string
  parentId?: string | null
}

/** 部门树拍平为候选（保留树序；仅正常状态由服务端保证）。 */
export async function loadDeptChoices(): Promise<DeptChoice[]> {
  const tree = await listDeptTree()
  const out: DeptChoice[] = []
  const walk = (nodes: SysDept[], depth: number) => {
    for (const n of nodes) {
      out.push({
        id: String(n.id),
        label: `${'　'.repeat(depth)}${n.name}`,
        name: n.name,
        parentId: n.parentId != null ? String(n.parentId) : null,
      })
      if (Array.isArray(n.children)) walk(n.children, depth + 1)
    }
  }
  walk(Array.isArray(tree) ? tree : [], 0)
  return out
}

// ==================== 受控外部数据源查询（设计预览与运行读取同一入口） ====================

export interface ExtQueryRow {
  [column: string]: unknown
}

export interface ExtQueryResult {
  columns: string[]
  rows: ExtQueryRow[]
  rowCount: number
}

/** 按契约 queryKey + version 执行受控查询；SQL/密钥只存服务端。 */
export async function extQuery(queryKey: string, version?: number): Promise<ExtQueryResult> {
  return request<ExtQueryResult>({
    method: 'GET',
    url: `/form/ext/query/${encodeURIComponent(queryKey)}`,
    ...(version !== undefined ? { params: { version } } : {}),
  })
}

// ==================== 列表展示配置 ====================

export interface ListConfig {
  columns: { name: string; label?: string; width?: number }[]
  filters?: { name: string; op: string }[]
  defaultSort?: { name: string; desc?: boolean }
  actions?: string[]
}

/** 读取表单列表配置；未配置返回 null（消费方回退派生默认）。 */
export async function getListConfig(formId: string): Promise<ListConfig | null> {
  return request<ListConfig | null>({
    method: 'GET',
    url: `/form/def/${formId}/list-config`,
  })
}

/** 保存表单列表配置（管理员，form:design:save）。 */
export async function saveListConfig(formId: string, config: ListConfig): Promise<void> {
  await request<void>({
    method: 'PUT',
    url: `/form/def/${formId}/list-config`,
    data: { config: JSON.stringify(config) },
  })
}

// ==================== 生命周期：停用 / 启用 ====================

export async function disableFormDef(formId: string, reason?: string): Promise<void> {
  await request<void>({
    method: 'POST',
    url: `/form/def/${formId}/disable`,
    data: { reason },
  })
}

export async function enableFormDef(formId: string, reason?: string): Promise<void> {
  await request<void>({
    method: 'POST',
    url: `/form/def/${formId}/enable`,
    data: { reason },
  })
}

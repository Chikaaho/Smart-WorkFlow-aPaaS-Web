import { request } from '@/foundation/request'
import { pageUsers } from '@/modules/system/api/user'
import { listDeptTree } from '@/modules/system/api/dept'
import type { SysDept } from '@/modules/system/types/dept'

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

/** 当前租户内启用用户候选（首屏 100 条，服务端过滤）。 */
export async function loadUserChoices(): Promise<UserChoice[]> {
  const page = await pageUsers({ pageNum: 1, pageSize: 100 }, {})
  return (page.list ?? []).map((u) => ({
    id: String(u.id),
    label: u.realName || u.username,
  }))
}

export interface DeptChoice {
  id: string
  label: string
}

/** 部门树拍平为候选（保留树序；仅正常状态由服务端保证）。 */
export async function loadDeptChoices(): Promise<DeptChoice[]> {
  const tree = await listDeptTree()
  const out: DeptChoice[] = []
  const walk = (nodes: SysDept[], depth: number) => {
    for (const n of nodes) {
      out.push({ id: String(n.id), label: `${'　'.repeat(depth)}${n.name}` })
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
    data: { config },
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

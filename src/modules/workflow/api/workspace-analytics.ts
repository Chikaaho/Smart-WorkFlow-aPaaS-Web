/**
 * 工作台数据组件受控查询 API。
 *
 * 服务端按当前账号可见表单、字段查看权、租户与记录数据范围取交集；
 * 客户端只传稳定字段标识与受控配置，不传 SQL/URL。
 */
import { request } from '@/foundation/request'

export interface WorkspaceFormSource {
  formKey: string
  name: string
  formVersion: number
  /** 所属可见应用（服务端仅对当前账号可见应用下发名称） */
  appId?: string
  appName?: string
  /** 当前账号可见口径的记录数（选择器展示） */
  recordCount?: number
}

export interface WorkspaceFieldOption {
  label: string
  value: string
}

export interface WorkspaceField {
  name: string
  label: string
  type: string
  options?: WorkspaceFieldOption[]
}

export interface WorkspaceFieldsResp {
  formKey: string
  formVersion: number
  fields: WorkspaceField[]
}

export type WorkspaceFilterOp = 'EQ' | 'LIKE' | 'GE' | 'LE'

export interface WorkspaceFilter {
  field: string
  op: WorkspaceFilterOp
  value: string | number | boolean
}

export type WorkspaceAgg = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'

export interface WorkspaceMetric {
  field?: string | null
  agg: WorkspaceAgg
}

export interface WorkspaceAggregateReq {
  formKey: string
  groupBy?: string | null
  groupBy2?: string | null
  metrics: WorkspaceMetric[]
  filters?: WorkspaceFilter[]
  limit?: number
}

export interface WorkspaceAggregateGroup {
  key?: unknown
  key2?: unknown
  values: Array<number | string | null>
}

export interface WorkspaceAggregateResp {
  formKey: string
  formVersion: number
  groups: WorkspaceAggregateGroup[]
  totalRecords: number
}

export interface WorkspaceRowsReq {
  formKey: string
  columns?: string[]
  filters?: WorkspaceFilter[]
  sortField?: string
  sortOrder?: 'ASC' | 'DESC'
  pageNum?: number
  pageSize?: number
}

export interface WorkspaceRowsResp {
  records: Array<Record<string, unknown>>
  total: number
  pageNum: number
  pageSize: number
}

/** 当前账号可关联的已发布表单。 */
export async function listWorkspaceSources(): Promise<WorkspaceFormSource[]> {
  return request<WorkspaceFormSource[]>({
    method: 'GET',
    url: '/form/workspace/analytics/sources',
  })
}

/** 指定表单当前账号可见的标量字段。 */
export async function getWorkspaceFields(formKey: string): Promise<WorkspaceFieldsResp> {
  return request<WorkspaceFieldsResp>({
    method: 'GET',
    url: `/form/workspace/analytics/forms/${encodeURIComponent(formKey)}/fields`,
  })
}

/** 分组聚合。 */
export async function aggregateWorkspace(
  req: WorkspaceAggregateReq,
): Promise<WorkspaceAggregateResp> {
  return request<WorkspaceAggregateResp>({
    method: 'POST',
    url: '/form/workspace/analytics/aggregate',
    data: req,
  })
}

/** 数据列表。 */
export async function queryWorkspaceRows(req: WorkspaceRowsReq): Promise<WorkspaceRowsResp> {
  return request<WorkspaceRowsResp>({
    method: 'POST',
    url: '/form/workspace/analytics/rows',
    data: req,
  })
}

import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'

/**
 * I4 编排/运营/工作台增量 API（模板中心、监控干预、基础分析、批量审批、流程交接）。
 * 后端形状：records/total/pageNum/pageSize；统一 adaptPage 到 PageResult。
 */

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

// ═══════════════ 流程模板中心 ═══════════════

export interface BpmTemplate {
  id: number
  name: string
  category?: string
  description?: string
  formKey: string
  templateVersion: number
  status: 'ENABLED' | 'DISABLED'
  scopeType: 'GLOBAL' | 'DEPT'
  scopeDeptId?: number
  sourceDefId?: number
  sourceDefVersion?: number
  graphJson?: string
}

export interface TemplateSaveReq {
  name?: string
  category?: string
  description?: string
  formKey?: string
  graphJson?: string
  scopeType?: string
  scopeDeptId?: number
  copyName?: string
}

export async function pageTemplates(
  page: PageQuery,
  filters: { keyword?: string; category?: string; status?: string } = {},
): Promise<PageResult<BpmTemplate>> {
  const raw = await request<BackendPageResult<BpmTemplate>>({
    method: 'GET',
    url: '/workflow/templates',
    params: { ...page, ...filters },
  })
  return adaptPage(raw)
}

export async function createTemplate(req: TemplateSaveReq): Promise<BpmTemplate> {
  return request<BpmTemplate>({ method: 'POST', url: '/workflow/templates', data: req })
}

export async function updateTemplate(id: number, req: TemplateSaveReq): Promise<BpmTemplate> {
  return request<BpmTemplate>({ method: 'PUT', url: `/workflow/templates/${id}`, data: req })
}

export async function changeTemplateStatus(id: number, enabled: boolean): Promise<BpmTemplate> {
  return request<BpmTemplate>({
    method: 'PUT',
    url: `/workflow/templates/${id}/status/${enabled}`,
  })
}

/** 复制后编辑并发布：以模板为受控来源创建 DRAFT 定义，返回 defId 供设计器编辑。 */
export async function copyTemplateToDefinition(
  id: number,
  copyName?: string,
): Promise<{ id: number; processKey: string }> {
  return request<{ id: number; processKey: string }>({
    method: 'POST',
    url: `/workflow/templates/${id}/copy`,
    data: { copyName },
  })
}

export async function deleteTemplate(id: number): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/workflow/templates/${id}` })
}

// ═══════════════ 监控 / 干预 / 分析 ═══════════════

export interface MonitorInstance {
  instance: {
    id: number
    processInstanceId: string
    processDefKey: string
    initiatorId: number
    status: string
    businessKey: string
    formKey: string
    createTime: string
    updateTime: string
  }
  activeNodeIds: string[]
  suspended: boolean
}

export interface MonitorQueryParams {
  processDefKey?: string
  processInstanceId?: string
  initiatorId?: number
  status?: string
  nodeKey?: string
  assignee?: number
  timeFrom?: string
  timeTo?: string
}

export async function pageMonitorInstances(
  page: PageQuery,
  filters: MonitorQueryParams = {},
): Promise<PageResult<MonitorInstance>> {
  const raw = await request<BackendPageResult<MonitorInstance>>({
    method: 'GET',
    url: '/workflow/monitor/instances',
    params: { ...page, ...filters },
  })
  return adaptPage(raw)
}

export interface InterventionRecord {
  id: number
  processInstanceId: string
  action: string
  operatorId: number
  reason?: string
  beforeState?: string
  afterState?: string
  fromAssignee?: number
  toAssignee?: number
  affectedTasks?: number
  intervenedAt: string
}

export async function interveneInstance(
  processInstanceId: string,
  action: 'SUSPEND' | 'RESUME' | 'TERMINATE' | 'TRANSFER',
  reason?: string,
  toAssignee?: number,
): Promise<InterventionRecord> {
  return request<InterventionRecord>({
    method: 'POST',
    url: `/workflow/monitor/instances/${processInstanceId}/intervene`,
    data: { action, reason, toAssignee },
  })
}

export async function queryInterventions(processInstanceId: string): Promise<InterventionRecord[]> {
  return request<InterventionRecord[]>({
    method: 'GET',
    url: `/workflow/monitor/instances/${processInstanceId}/interventions`,
  })
}

export interface AnalyticsSummary {
  launched: number
  completed: number
  running: number
  rejected: number
  avgDurationMs: number
  p50DurationMs: number
  p90DurationMs: number
  durationSample: number
  handlerWorkload: Record<string, number>
  nodeStats: Record<string, { count: number; avgStayMs: number; p90StayMs: number }>
}

export async function queryAnalyticsSummary(
  filters: MonitorQueryParams = {},
): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>({
    method: 'GET',
    url: '/workflow/monitor/analytics/summary',
    params: filters,
  })
}

// ═══════════════ 批量审批 ═══════════════

export interface BatchItemInput {
  taskId: string
  action: 'APPROVE' | 'DISAPPROVE' | 'REJECT' | 'RETURN'
  comment?: string
  opinionFormId?: string
  opinionFormVersion?: string
  opinionData?: Record<string, unknown>
  returnTargetNodeId?: string
}

export interface BatchItemResult {
  taskId: string
  action?: string
  success: boolean
  errorCode?: number
  message?: string
}

export async function batchTaskAction(
  items: BatchItemInput[],
): Promise<{ results: BatchItemResult[]; success: number; failed: number; total: number }> {
  return request({
    method: 'POST',
    url: '/workflow/tasks/batch-action',
    data: { items },
  })
}

// ═══════════════ 流程交接 ═══════════════

export interface HandoverResult {
  id: number
  fromUserId: number
  toUserId: number
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  totalItems: number
  migratedItems: number
  failedItems: number
}

export interface HandoverItem {
  id: number
  handoverId: number
  taskId?: string
  processInstanceId?: string
  itemType: 'TASK' | 'PROXY_RULE'
  beforeAssignee?: number
  afterAssignee?: number
  result: 'MIGRATED' | 'FAILED' | 'SKIPPED' | 'SKIPPED_ALREADY_MIGRATED'
  failReason?: string
}

export async function submitHandover(req: {
  fromUserId: number
  toUserId: number
  scopeDefKeys?: string[]
  includeProxyRules?: boolean
}): Promise<HandoverResult> {
  return request<HandoverResult>({ method: 'POST', url: '/workflow/handover', data: req })
}

export async function queryHandoverItems(handoverId: number): Promise<HandoverItem[]> {
  return request<HandoverItem[]>({
    method: 'GET',
    url: `/workflow/handover/${handoverId}/items`,
  })
}

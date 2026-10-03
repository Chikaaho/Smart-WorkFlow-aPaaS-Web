import { request } from '@/foundation/request'

/**
 * P62 资源保障运维 API（资源策略 / 运行画像 / 积压汇总与明细 / 拒绝审计）。
 *
 * 全部走 foundation/request，禁直引 axios。
 * 查看权限 workflow:resource:view 仅本租户数据；策略修改/启停/跨租户运维需
 * 独立管理权限 workflow:resource:manage（服务端强制，前端仅做入口裁剪）。
 */

/** 策略状态。 */
export type ResourcePolicyStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED'

/** 资源策略行（版本化）。 */
export interface ResourcePolicy {
  id: number
  policyVersion: number
  status: ResourcePolicyStatus
  enabled: boolean
  stopAcceptance: boolean
  globalMaxOutstanding: number
  tenantMaxOutstanding: number
  prodReserved: number
  oaReserved: number
  sharedCapacity: number
  tenantRatePerSec: number
  tenantBurst: number
  realtimeGlobalConcurrency: number
  realtimeTenantConcurrency: number
  batchSliceItems: number
  batchPollClaimLimit: number
  remark: string | null
}

/** 策略创建请求（仅数值与备注；状态/版本由服务端管理）。 */
export interface ResourcePolicyCreateReq {
  globalMaxOutstanding: number
  tenantMaxOutstanding: number
  prodReserved: number
  oaReserved: number
  sharedCapacity: number
  tenantRatePerSec: number
  tenantBurst: number
  realtimeGlobalConcurrency: number
  realtimeTenantConcurrency: number
  batchSliceItems: number
  batchPollClaimLimit: number
  remark?: string
}

/** 运行画像（RG04）。 */
export interface ResourceRuntimeProfile {
  generatedAt: string
  policyEnabled: boolean
  activePolicy: ResourcePolicy | null
  enablementViolations: string[]
  pool: Record<string, unknown>
  asyncExecutor: Record<string, unknown>
  dispatcher: Record<string, unknown>
  consumers: Record<string, unknown>
  usageCounters: Record<string, number>
  factBySegment: Record<string, number>
  factByTenant: Record<string, number>
  realtimeGuard: Record<string, unknown>
  reconciliationNote: string
}

/** 积压分层汇总（RG05）。 */
export interface ResourceBacklogSummary {
  generatedAt: string
  windowNote: string
  completionPointNote: string
  totalCommandsOpen: number
  incompleteUnits: number
  commandsByStatus: { status: string; cnt: number }[]
  commandsByClass: { resource_class: string; cnt: number }[]
  engineTargets: Record<string, number>
  batchPendingItems: number
  usageCounters: Record<string, number>
  factBySegment: Record<string, number>
  countersConsistentWithFacts: boolean
}

/** 命令明细行。 */
export interface ResourceCommandRow {
  id: number
  command_key: string
  command_type: string
  channel: string
  status: string
  resource_class: string | null
  resource_units: number | null
  resource_segment: string | null
  policy_version: number | null
  retry_count: number | null
  tenant_id: number
  create_time: string | null
  claimed_at: string | null
  finished_at: string | null
  deadline_at: string | null
  overdue_at: string | null
  resource_released_at: string | null
  failure_reason: string | null
}

/** 命令分页。 */
export interface ResourceCommandPage {
  page: number
  size: number
  total: number
  rows: ResourceCommandRow[]
}

/** 拒绝审计行。 */
export interface ResourceRejectRow {
  id: number
  tenant_id: number
  policy_version: number | null
  resource_class: string | null
  reject_scope: string
  requested_units: number
  reason_code: string
  detail: string | null
  command_key: string | null
  create_time: string
}

/** 拒绝审计分页。 */
export interface ResourceRejectPage {
  page: number
  size: number
  total: number
  rows: ResourceRejectRow[]
}

/** 策略列表。 */
export function listResourcePolicies(): Promise<ResourcePolicy[]> {
  return request<ResourcePolicy[]>({ url: '/workflow/resource/policy', method: 'get' })
}

/** 创建新策略版本（DRAFT、默认关闭）。 */
export function createResourcePolicy(body: ResourcePolicyCreateReq): Promise<ResourcePolicy> {
  return request<ResourcePolicy>({ url: '/workflow/resource/policy', method: 'post', data: body })
}

/** 启用检查 + 启用。 */
export function enableResourcePolicy(id: number, remark?: string): Promise<ResourcePolicy> {
  return request<ResourcePolicy>({
    url: `/workflow/resource/policy/${id}/enable`,
    method: 'post',
    data: { remark: remark ?? '' },
  })
}

/** 停用。 */
export function disableResourcePolicy(id: number): Promise<ResourcePolicy> {
  return request<ResourcePolicy>({ url: `/workflow/resource/policy/${id}/disable`, method: 'post' })
}

/** 停新受理开关。 */
export function stopAcceptance(id: number, stop: boolean): Promise<ResourcePolicy> {
  return request<ResourcePolicy>({
    url: `/workflow/resource/policy/${id}/stop-acceptance`,
    method: 'post',
    data: { stop },
  })
}

/** 启用检查预检（不落库）。 */
export function checkResourcePolicy(id: number): Promise<string[]> {
  return request<string[]>({
    url: `/workflow/resource/policy/${id}/check`,
    method: 'post',
    data: {},
  })
}

/** 运行画像。 */
export function getResourceProfile(): Promise<ResourceRuntimeProfile> {
  return request<ResourceRuntimeProfile>({ url: '/workflow/resource/profile', method: 'get' })
}

/** 积压汇总。 */
export function getBacklogSummary(): Promise<ResourceBacklogSummary> {
  return request<ResourceBacklogSummary>({
    url: '/workflow/resource/backlog/summary',
    method: 'get',
  })
}

/** 命令明细分页。 */
export function getBacklogCommands(params: {
  page?: number
  size?: number
  tenantId?: number
  status?: string
  resourceClass?: string
  channel?: string
  policyVersion?: number
}): Promise<ResourceCommandPage> {
  return request<ResourceCommandPage>({
    url: '/workflow/resource/backlog/commands',
    method: 'get',
    params,
  })
}

/** 拒绝审计分页。 */
export function getResourceRejects(params: {
  page?: number
  size?: number
  tenantId?: number
}): Promise<ResourceRejectPage> {
  return request<ResourceRejectPage>({
    url: '/workflow/resource/rejects',
    method: 'get',
    params,
  })
}

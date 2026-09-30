import { request } from '@/foundation/request'
import type { PageResult } from '@/contracts/common'

/**
 * 事务动作 API 模块（P62 首事务阶段）。
 *
 * 全部走 foundation/request，禁直引 axios。
 * 面向设计者/管理员的配置入口与面向业务调用的执行/回查入口共用本模块。
 */

/** 动作类型（业务语义：预占 / 确认 / 释放 / 数量调整）。 */
export type TxnActionType = 'RESERVE' | 'CONFIRM' | 'RELEASE' | 'ADJUST'
/** 动作状态。 */
export type TxnActionStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED'
/** 调用结果状态。 */
export type TxnInvocationStatus = 'SUCCEEDED' | 'REJECTED' | 'CONFLICT' | 'FAILED'
/** 预占凭据状态。 */
export type TxnReservationStatus = 'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED'

/** 动作声明配置（发布冻结）。 */
export interface TxnActionConfig {
  balanceField?: string
  reservedField?: string
  keyFields?: string[]
  quantityScale?: number
  /** 预占时效（秒）。前端按等级选择，不直接暴露秒数输入。 */
  expiresInSeconds?: number
  nonNegativeAvailable?: boolean
}

/** 动作视图（管理列表行）。 */
export interface TxnActionView {
  id: string
  formId: string
  actionKey: string
  name: string
  actionType: TxnActionType
  status: TxnActionStatus
  currentVersion: number | null
  description: string | null
  configJson: string | null
  updateTime: string | null
}

/** 保存请求（创建/更新草稿）。 */
export interface TxnActionSaveReq {
  actionKey: string
  name: string
  actionType: TxnActionType
  description?: string | null
  config: TxnActionConfig
}

/** 发布校验错误项（结构化定位）。 */
export interface TxnPublishError {
  field: string
  message: string
  code: number
}

/** 调用请求。 */
export interface TxnInvokeReq {
  /** 稳定调用标识：同标识 + 同内容返回原结果；同标识 + 不同内容明确冲突。 */
  invocationKey?: string
  recordId?: string
  reservationId?: string
  quantity?: string
  expectedVersion?: number
  businessKeys?: Record<string, unknown>
}

/** 调用结果。 */
export interface TxnInvokeResult {
  invocationId: string
  status: TxnInvocationStatus
  actionVersion: number
  reservationId: string | null
  quantity: string | null
  balanceAfter: string | null
  reservedAfter: string | null
  errorCode: number | null
  errorMsg: string | null
  durationMs: number | null
  replay: boolean
}

/** 调用记录视图。 */
export interface TxnInvocationView {
  id: string
  actionId: string
  actionVersion: number
  invocationKey: string
  bizRecordId: string | null
  status: TxnInvocationStatus
  errorCode: number | null
  errorMsg: string | null
  resultJson: string | null
  durationMs: number | null
  callerId: number | null
  createTime: string
}

/** 预占凭据视图。 */
export interface TxnReservationView {
  id: string
  actionId: string
  actionVersion: number
  formId: string
  recordId: string
  bizKeysJson: string | null
  quantity: string
  status: TxnReservationStatus
  expiresAt: string
  reserveInvocationId: string | null
  settleInvocationId: string | null
  settledAt: string | null
  createTime: string
}

/** 台账视图。 */
export interface TxnLedgerView {
  id: string
  actionId: string
  actionVersion: number
  invocationId: string
  reservationId: string | null
  entryType: 'RESERVE' | 'CONFIRM' | 'RELEASE' | 'EXPIRE' | 'ADJUST'
  formId: string
  recordId: string
  quantity: string
  balanceAfter: string | null
  reservedAfter: string | null
  bizKeysJson: string | null
  createTime: string
}

/** C1 保护策略模型。 */
export interface C1PolicyModel {
  enabled: boolean
  protectedFields?: string[]
  balanceField?: string | null
  reservedField?: string | null
  nonNegativeAvailable?: boolean
}

/** C1 策略视图。 */
export interface C1PolicyView {
  id: string | null
  formId: string
  enabled: boolean
  policyJson: string | null
  appliedAt: string | null
  updateTime: string | null
}

interface BackendPageResult<T> {
  records: T[]
  total: number
  current?: number
  size?: number
  pageNum?: number
  pageSize?: number
}

function adaptPage<T>(raw: BackendPageResult<T>): PageResult<T> {
  return {
    list: raw.records ?? [],
    total: raw.total ?? 0,
    pageNum: raw.pageNum ?? raw.current ?? 1,
    pageSize: raw.pageSize ?? raw.size ?? 20,
  }
}

// ─── 管理 ────────────────────────────────────────────────

/** 动作列表（按表单）。 */
export function listTxnActions(formId: string): Promise<TxnActionView[]> {
  return request<TxnActionView[]>({ url: '/form/action/list', method: 'get', params: { formId } })
}

/** 单个动作。 */
export function getTxnAction(id: string): Promise<TxnActionView> {
  return request<TxnActionView>({ url: `/form/action/${id}`, method: 'get' })
}

/** 创建草稿。 */
export function createTxnAction(formId: string, body: TxnActionSaveReq): Promise<TxnActionView> {
  return request<TxnActionView>({
    url: '/form/action',
    method: 'post',
    params: { formId },
    data: body,
  })
}

/** 更新草稿/配置。 */
export function updateTxnAction(id: string, body: TxnActionSaveReq): Promise<TxnActionView> {
  return request<TxnActionView>({ url: `/form/action/${id}`, method: 'put', data: body })
}

/** 发布校验（返回结构化错误列表，空数组=通过）。 */
export function validateTxnAction(id: string): Promise<TxnPublishError[]> {
  return request<TxnPublishError[]>({ url: `/form/action/${id}/validate`, method: 'post' })
}

/** 发布（版本冻结）。 */
export function publishTxnAction(id: string): Promise<TxnActionView> {
  return request<TxnActionView>({ url: `/form/action/${id}/publish`, method: 'post' })
}

/** 停用（阻止新调用；既有预占仍可结算）。 */
export function disableTxnAction(id: string): Promise<TxnActionView> {
  return request<TxnActionView>({ url: `/form/action/${id}/disable`, method: 'post' })
}

/** 启用。 */
export function enableTxnAction(id: string): Promise<TxnActionView> {
  return request<TxnActionView>({ url: `/form/action/${id}/enable`, method: 'post' })
}

// ─── C1 保护 ─────────────────────────────────────────────

/** 读取表单 C1 保护策略。 */
export function getC1Policy(formId: string): Promise<C1PolicyView> {
  return request<C1PolicyView>({ url: '/form/action/c1-policy', method: 'get', params: { formId } })
}

/** 保存 C1 保护策略（启用时先校验既有数据满足约束）。 */
export function saveC1Policy(formId: string, policy: C1PolicyModel): Promise<C1PolicyView> {
  return request<C1PolicyView>({
    url: '/form/action/c1-policy',
    method: 'put',
    params: { formId },
    data: { policy },
  })
}

// ─── 调用与回查 ───────────────────────────────────────────

/** 调用动作。 */
export function invokeTxnAction(id: string, body: TxnInvokeReq): Promise<TxnInvokeResult> {
  return request<TxnInvokeResult>({ url: `/form/action/${id}/invoke`, method: 'post', data: body })
}

/** 调用记录详情（凭调用标识回查）。 */
export function getTxnInvocation(invocationId: string): Promise<TxnInvocationView> {
  return request<TxnInvocationView>({
    url: `/form/action/invocations/${invocationId}`,
    method: 'get',
  })
}

/** 调用记录分页。 */
export function pageTxnInvocations(
  actionId: string,
  params: {
    status?: string
    actionVersion?: number
    callerId?: number
    page?: number
    size?: number
  } = {},
): Promise<PageResult<TxnInvocationView>> {
  return request<BackendPageResult<TxnInvocationView>>({
    url: `/form/action/${actionId}/invocations`,
    method: 'get',
    params: { page: 1, size: 20, ...params },
  }).then(adaptPage)
}

/** 预占凭据详情。 */
export function getTxnReservation(reservationId: string): Promise<TxnReservationView> {
  return request<TxnReservationView>({
    url: `/form/action/reservations/${reservationId}`,
    method: 'get',
  })
}

/** 预占凭据分页。 */
export function pageTxnReservations(
  actionId: string,
  params: { status?: string; page?: number; size?: number } = {},
): Promise<PageResult<TxnReservationView>> {
  return request<BackendPageResult<TxnReservationView>>({
    url: `/form/action/${actionId}/reservations`,
    method: 'get',
    params: { page: 1, size: 20, ...params },
  }).then(adaptPage)
}

/** 台账分页。 */
export function pageTxnLedger(
  actionId: string,
  params: { actionVersion?: number; reservationId?: string; page?: number; size?: number } = {},
): Promise<PageResult<TxnLedgerView>> {
  return request<BackendPageResult<TxnLedgerView>>({
    url: `/form/action/${actionId}/ledger`,
    method: 'get',
    params: { page: 1, size: 20, ...params },
  }).then(adaptPage)
}

import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'

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

/** 通知发送记录（v0.0.2 P3；有权管理者可见）。 */
export interface NotifyRecord {
  id: number
  recipientId: number
  title: string
  content: string
  bizType: string
  bizId: string | null
  read: boolean
  channel: string | null
  deliveryStatus: string
  externalMessageId: string | null
  failureReason: string | null
  idempotencyKey: string | null
  createTime: string
}

/** 单条投递尝试流水。 */
export interface NotifyAttempt {
  id: number
  messageId: number
  attemptNo: number
  channel: string | null
  status: string
  failureReason: string | null
  externalMessageId: string | null
  createTime: string
}

/** 记录详情：消息 + 各次尝试（原始失败、各次尝试与最新结果）。 */
export interface NotifyRecordDetail {
  message: NotifyRecord
  attempts: NotifyAttempt[]
}

/** GET /notify/records — 发送记录分页（状态/接收人/关键字/时间窗筛选）。 */
export async function queryNotifyRecords(
  page: PageQuery,
  filters: {
    deliveryStatus?: string
    recipientId?: number
    keyword?: string
    timeFrom?: string
    timeTo?: string
  } = {},
): Promise<PageResult<NotifyRecord>> {
  const raw = await request<BackendPageResult<NotifyRecord>>({
    method: 'GET',
    url: '/notify/records',
    params: {
      ...page,
      deliveryStatus: filters.deliveryStatus,
      recipientId: filters.recipientId,
      keyword: filters.keyword,
      timeFrom: filters.timeFrom,
      timeTo: filters.timeTo,
    },
  })
  return adaptPage(raw)
}

/** GET /notify/records/{id} — 单条记录 + 关联尝试流水。 */
export async function queryNotifyRecordDetail(id: number): Promise<NotifyRecordDetail> {
  return request<NotifyRecordDetail>({ method: 'GET', url: `/notify/records/${id}` })
}

/** POST /notify/records/{id}/resend — 失败重发（并发只受理一次）。返回最新状态。 */
export async function resendNotifyRecord(id: number): Promise<string> {
  return request<string>({ method: 'POST', url: `/notify/records/${id}/resend` })
}

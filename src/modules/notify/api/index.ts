import { request } from '@/foundation/request'
import type {
  NotifyMessage,
  NotifyTemplate,
  NotifyTemplateSaveReq,
  TemplatePreviewReq,
  TemplatePreviewResult,
  NotifyBatchSendReq,
  NotifyBatchSendResp,
  NotifyRule,
  NotifyRuleSaveReq,
  NotifyChannelStatus,
  NotifySubscriptionItem,
} from '@/contracts/notify'

// ═══════════════════════════════════════
// 通知消息
// ═══════════════════════════════════════

export interface NotifyQueryParams {
  /** 已读状态过滤：true=仅已读，false=仅未读，undefined=不过滤 */
  read?: boolean
  /** 关键词过滤（匹配标题或内容） */
  keyword?: string
}

/** GET /notify/messages → NotifyMessage[]（支持 read/keyword 过滤） */
export async function queryNotifyMessages(params?: NotifyQueryParams): Promise<NotifyMessage[]> {
  const queryParams: Record<string, string> = {}
  if (params?.read !== undefined) {
    queryParams.read = String(params.read)
  }
  if (params?.keyword) {
    queryParams.keyword = params.keyword
  }
  return request<NotifyMessage[]>({
    method: 'GET',
    url: '/notify/messages',
    params: queryParams,
  })
}

/** POST /notify/messages/{id}/read → void */
export async function markAsRead(id: number): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/notify/messages/${id}/read`,
  })
}

/** DELETE /notify/messages/{id} → void */
export async function deleteMessage(id: number): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/notify/messages/${id}`,
  })
}

// ═══════════════════════════════════════
// 消息模板（P36 / M05-F02-01）
// ═══════════════════════════════════════

import type { PageQuery, PageResult } from '@/contracts/common'

/** GET /notify/templates → 分页列表（keyword 匹配代码/名称，enabled 过滤） */
export async function pageNotifyTemplates(
  page: PageQuery,
  keyword?: string,
  enabled?: boolean,
): Promise<PageResult<NotifyTemplate>> {
  const queryParams: Record<string, string> = {}
  if (keyword) queryParams.keyword = keyword
  if (enabled !== undefined) queryParams.enabled = String(enabled)
  const raw = await request<BackendTemplatePage>({
    method: 'GET',
    url: '/notify/templates',
    params: { pageNum: String(page.pageNum), pageSize: String(page.pageSize), ...queryParams },
  })
  return { list: raw.records, total: raw.total, pageNum: raw.pageNum, pageSize: raw.pageSize }
}

interface BackendTemplatePage {
  records: NotifyTemplate[]
  total: number
  pageNum: number
  pageSize: number
}

/** GET /notify/templates/{id} → 详情 */
export async function getNotifyTemplate(id: number): Promise<NotifyTemplate> {
  return request<NotifyTemplate>({ method: 'GET', url: `/notify/templates/${id}` })
}

/** POST /notify/templates → 新建，返回 id */
export async function createNotifyTemplate(req: NotifyTemplateSaveReq): Promise<number> {
  return request<number>({ method: 'POST', url: '/notify/templates', data: req })
}

/** PUT /notify/templates/{id} → 编辑（templateCode 不可变更） */
export async function updateNotifyTemplate(id: number, req: NotifyTemplateSaveReq): Promise<void> {
  return request<void>({ method: 'PUT', url: `/notify/templates/${id}`, data: req })
}

/** DELETE /notify/templates/{id} → 删除（逻辑删除，幂等） */
export async function deleteNotifyTemplate(id: number): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/notify/templates/${id}` })
}

/** PUT /notify/templates/{id}/toggle?enabled= → 启停切换 */
export async function toggleNotifyTemplate(id: number, enabled: boolean): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/notify/templates/${id}/toggle`,
    params: { enabled: String(enabled) },
  })
}

/** POST /notify/templates/preview → 按内容渲染预览（与真实发送同源） */
export async function previewTemplate(req: TemplatePreviewReq): Promise<TemplatePreviewResult> {
  return request<TemplatePreviewResult>({
    method: 'POST',
    url: '/notify/templates/preview',
    data: req,
  })
}

/** POST /notify/templates/send → 按模板发送站内通知，返回通知 id */
export async function sendByTemplate(
  templateCode: string,
  recipientId: number,
  variables: Record<string, string>,
): Promise<number> {
  return request<number>({
    method: 'POST',
    url: '/notify/templates/send',
    data: { templateCode, recipientId, variables },
  })
}

// ═══════════════════════════════════════
// 批量发送
// ═══════════════════════════════════════

/** POST /notify/messages/batch-send → 批量发送站内通知，返回去重后接收人数 */
export async function batchSendNotify(req: NotifyBatchSendReq): Promise<NotifyBatchSendResp> {
  return request<NotifyBatchSendResp>({
    method: 'POST',
    url: '/notify/messages/batch-send',
    data: req,
  })
}

/** POST /notify/messages/resolve-count → 解析批量发送接收人数（不实际发送） */
export async function resolveCountNotify(req: NotifyBatchSendReq): Promise<NotifyBatchSendResp> {
  return request<NotifyBatchSendResp>({
    method: 'POST',
    url: '/notify/messages/resolve-count',
    data: req,
  })
}

// ═══════════════════════════════════════
// I6：收件箱（服务端真分页 / 未读数 / 全部已读 / 受保护深链）
// ═══════════════════════════════════════

interface InboxBackendPage {
  records: NotifyMessage[]
  total: number
  pageNum: number
  pageSize: number
}

/** GET /notify/inbox → 服务端分页收件箱（稳定排序 create_time desc, id desc） */
export async function pageNotifyInbox(
  page: PageQuery,
  filters: { read?: boolean; eventType?: string; keyword?: string } = {},
): Promise<PageResult<NotifyMessage>> {
  const raw = await request<InboxBackendPage>({
    method: 'GET',
    url: '/notify/inbox',
    params: {
      ...page,
      read: filters.read === undefined ? undefined : String(filters.read),
      eventType: filters.eventType,
      keyword: filters.keyword,
    },
  })
  return { list: raw.records, total: raw.total, pageNum: raw.pageNum, pageSize: raw.pageSize }
}

/** GET /notify/inbox/unread-count → 当前用户未读数 */
export async function unreadNotifyCount(): Promise<number> {
  return request<number>({ method: 'GET', url: '/notify/inbox/unread-count' })
}

/** POST /notify/inbox/read-all → 全部已读；返回受影响行数（幂等） */
export async function readAllNotify(): Promise<number> {
  return request<number>({ method: 'POST', url: '/notify/inbox/read-all' })
}

/** POST /notify/inbox/{id}/link → 服务端深链鉴权，返回受控目标 { linkType, linkId } */
export async function openNotifyLink(id: number): Promise<{ linkType: string; linkId: string }> {
  return request<{ linkType: string; linkId: string }>({
    method: 'POST',
    url: `/notify/inbox/${id}/link`,
  })
}

// ═══════════════════════════════════════
// I6：通知规则（管理端）
// ═══════════════════════════════════════

/** GET /notify/rules → 分页规则列表 */
export async function pageNotifyRules(
  page: PageQuery,
  filters: { eventType?: string; enabled?: boolean; keyword?: string } = {},
): Promise<PageResult<NotifyRule>> {
  const raw = await request<BackendRulePage>({
    method: 'GET',
    url: '/notify/rules',
    params: {
      ...page,
      eventType: filters.eventType,
      enabled: filters.enabled === undefined ? undefined : String(filters.enabled),
      keyword: filters.keyword,
    },
  })
  return { list: raw.records, total: raw.total, pageNum: raw.pageNum, pageSize: raw.pageSize }
}

interface BackendRulePage {
  records: NotifyRule[]
  total: number
  pageNum: number
  pageSize: number
}

/** GET /notify/rules/{id} */ export async function getNotifyRule(id: number): Promise<NotifyRule> {
  return request<NotifyRule>({ method: 'GET', url: `/notify/rules/${id}` })
}
/** POST /notify/rules */ export async function createNotifyRule(
  req: NotifyRuleSaveReq,
): Promise<number> {
  return request<number>({ method: 'POST', url: '/notify/rules', data: req })
}
/** PUT /notify/rules/{id} */ export async function updateNotifyRule(
  id: number,
  req: NotifyRuleSaveReq,
): Promise<void> {
  return request<void>({ method: 'PUT', url: `/notify/rules/${id}`, data: req })
}
/** DELETE /notify/rules/{id} */ export async function deleteNotifyRule(id: number): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/notify/rules/${id}` })
}
/** POST /notify/rules/{id}/enabled/{enabled} */ export async function toggleNotifyRule(
  id: number,
  enabled: boolean,
): Promise<void> {
  return request<void>({ method: 'POST', url: `/notify/rules/${id}/enabled/${enabled}` })
}

// ═══════════════════════════════════════
// I6：渠道状态（管理端）与订阅偏好（用户端）
// ═══════════════════════════════════════

/** GET /notify/channels → 渠道状态列表（系统级装配 + 租户级启停） */
export async function listNotifyChannels(): Promise<NotifyChannelStatus[]> {
  return request<NotifyChannelStatus[]>({ method: 'GET', url: '/notify/channels' })
}

/** POST /notify/channels/{channel} → 租户级启停更新 */
export async function updateNotifyChannel(
  channel: string,
  body: { tenantEnabled: boolean; senderDisplay?: string; configSummary?: string },
): Promise<void> {
  return request<void>({ method: 'POST', url: `/notify/channels/${channel}`, data: body })
}

/** GET /notify/subscriptions → 当前用户订阅偏好 */
export async function getNotifySubscription(): Promise<NotifySubscriptionItem[]> {
  return request<NotifySubscriptionItem[]>({ method: 'GET', url: '/notify/subscriptions' })
}

/** POST /notify/subscriptions → 保存订阅偏好（必须送达项由服务端拒绝关闭） */
export async function saveNotifySubscription(items: NotifySubscriptionItem[]): Promise<void> {
  return request<void>({ method: 'POST', url: '/notify/subscriptions', data: { items } })
}

import { request } from '@/foundation/request'
import type {
  NotifyMessage,
  NotifyTemplate,
  NotifyTemplateSaveReq,
  TemplatePreviewReq,
  TemplatePreviewResult,
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
  return request<PageResult<NotifyTemplate>>({
    method: 'GET',
    url: '/notify/templates',
    params: { pageNum: String(page.pageNum), pageSize: String(page.pageSize), ...queryParams },
  })
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

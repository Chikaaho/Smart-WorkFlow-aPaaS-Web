import { request } from '@/foundation/request'
import type { NotifyMessage } from '@/contracts/notify'

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

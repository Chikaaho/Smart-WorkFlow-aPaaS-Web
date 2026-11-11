/**
 * 日志查询 API（1.0.0 F3，P40）：登录 / 操作 / 异常三类审计的分页查询。
 * 全部经 foundation/request 单一请求层；后端租户隔离由服务端强制。
 */
import { request } from '@/foundation/request'

export type AuditLogType = 'LOGIN' | 'OPERATION' | 'EXCEPTION'

export interface AuditLogItem {
  id: string
  createTime: string
  tenantId: number
  logType: AuditLogType
  username?: string
  userId?: number
  result: 'SUCCESS' | 'FAIL'
  failReason?: string
  module?: string
  action?: string
  target?: string
  ip?: string
  userAgent?: string
  exceptionType?: string
  summary?: string
  traceId?: string
}

export interface AuditLogFilter {
  logType?: AuditLogType
  result?: string
  module?: string
  username?: string
  ip?: string
  beginTime?: string
  endTime?: string
  tenantId?: number
}

export interface AuditLogPage {
  records: AuditLogItem[]
  total: number
  pageNum: number
  pageSize: number
}

export function pageAuditLogs(
  pageNum: number,
  pageSize: number,
  filter: AuditLogFilter,
): Promise<AuditLogPage> {
  return request({
    method: 'POST',
    url: '/system/audit-log/page',
    params: { pageNum, pageSize },
    data: filter,
  })
}

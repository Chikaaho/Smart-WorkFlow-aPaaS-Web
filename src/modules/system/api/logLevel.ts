import { request } from '@/foundation/request'

/** 日志等级条目（1.2.0 E2-1）：名称 + 配置等级（null=继承默认）+ 生效等级。 */
export interface LogLevelEntry {
  name: string
  configuredLevel: string | null
  effectiveLevel: string | null
}

/** GET /system/log-levels?keyword= → logger 列表（可按名称模糊过滤）。 */
export function listLogLevels(keyword?: string): Promise<LogLevelEntry[]> {
  return request<LogLevelEntry[]>({
    method: 'GET',
    url: '/system/log-levels',
    params: keyword ? { keyword } : undefined,
  })
}

/** PUT /system/log-levels/{loggerName}/level?level= → 调整（level 缺省 = 恢复默认）。 */
export function setLogLevel(loggerName: string, level: string | null): Promise<LogLevelEntry> {
  return request<LogLevelEntry>({
    method: 'PUT',
    url: `/system/log-levels/${encodeURIComponent(loggerName)}/level`,
    params: level ? { level } : undefined,
  })
}

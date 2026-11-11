/**
 * 人员批量导入导出 API（1.0.0 F1，P27）。
 * 模板/导出走 blob 下载；导入 multipart + 统一初始密码，整批原子。
 */
import { request } from '@/foundation/request'
import type { UserFilter } from '@/modules/system/types/user'

export interface UserImportRowError {
  rowNum: number
  message: string
}

export interface UserImportResult {
  totalRows: number
  successCount: number
  warnings: string[]
  errors: UserImportRowError[]
}

/** GET /system/user/import-template → xlsx（带模板签名，无密码列）；Blob 由调用方保存。 */
export async function downloadUserImportTemplate(): Promise<Blob> {
  return request<Blob>({
    method: 'GET',
    url: '/system/user/import-template',
    responseType: 'blob',
  })
}

/** POST /system/user/import：初始密码必填；tenantId 仅超管跨租户导入时指定。 */
export async function importUsers(
  file: File,
  initialPassword: string,
  tenantId?: number | string,
): Promise<UserImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  return request<UserImportResult>({
    method: 'POST',
    url: '/system/user/import',
    data: formData,
    params: { initialPassword, ...(tenantId != null ? { tenantId } : {}) },
  })
}

/** POST /system/user/export：按当前列表筛选导出（列同模板 + 可读列，不含密码）；Blob 由调用方保存。 */
export async function exportUsers(filter: Partial<UserFilter>): Promise<Blob> {
  return request<Blob>({
    method: 'POST',
    url: '/system/user/export',
    data: filter,
    responseType: 'blob',
  })
}

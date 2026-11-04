/**
 * 应用整包导入导出 API（0.2.2 F2，D022-10～15）。
 *
 * 后台：/form/app/manage/bundle —— 导出为 form:app:export，导入两步走与导入
 * 记录为 form:app:import。导出与报告下载走 responseType: 'blob'（业务错误仍为
 * application/json 的 R 包，由 foundation/request 统一解析为 ApiError）；
 * 导入两步为 multipart 上传，服务端无状态：preview 与 confirm 各自携带同一文件。
 * 全部走 foundation/request（业务层禁直引 axios）。
 */
import { request } from '@/foundation/request'
import type {
  BundleOpinionKeyDecision,
  FormAppImportRecord,
  FormBundleImportReport,
  FormBundlePreviewResult,
} from '@/contracts/app-bundle'

/** 导出应用整包（当前版本定义；不含业务数据、附件与密钥类信息）。 */
export async function exportAppBundle(appId: string): Promise<Blob> {
  return request<Blob>({
    method: 'GET',
    url: `/form/app/manage/bundle/${encodeURIComponent(appId)}/export`,
    responseType: 'blob',
  })
}

/** 导入第一步：预检（对象清单、意见表单冲突、外部引用匹配），不写库。 */
export async function previewBundleImport(file: File): Promise<FormBundlePreviewResult> {
  const formData = new FormData()
  formData.append('file', file)
  return request<FormBundlePreviewResult>({
    method: 'POST',
    url: '/form/app/manage/bundle/preview',
    data: formData,
  })
}

/**
 * 导入第二步：确认导入（重复上传同一包文件，服务端无状态；单事务写入，
 * 失败整体回滚且不落导入记录）。
 *
 * @param opinionKeys 意见表单冲突解决（仅冲突项需要；空数组可省略）
 */
export async function confirmBundleImport(
  file: File,
  opinionKeys?: BundleOpinionKeyDecision[],
): Promise<FormBundleImportReport> {
  const formData = new FormData()
  formData.append('file', file)
  if (opinionKeys && opinionKeys.length > 0) {
    formData.append('opinionKeys', JSON.stringify(opinionKeys))
  }
  return request<FormBundleImportReport>({
    method: 'POST',
    url: '/form/app/manage/bundle/confirm',
    data: formData,
  })
}

/** 导入记录列表（当前租户，含报告 JSON 摘要）。 */
export async function listBundleImportRecords(): Promise<FormAppImportRecord[]> {
  return request<FormAppImportRecord[]>({
    method: 'GET',
    url: '/form/app/manage/bundle/import-records',
  })
}

/** 下载导入记录的报告 JSON 原文。 */
export async function downloadBundleImportReport(recordId: string): Promise<Blob> {
  return request<Blob>({
    method: 'GET',
    url: `/form/app/manage/bundle/import-records/${encodeURIComponent(recordId)}/report`,
    responseType: 'blob',
  })
}

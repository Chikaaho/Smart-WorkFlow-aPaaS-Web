/**
 * 文件存储 API 层 —— 5 个端点。
 *
 * 全部经 foundation/request 单一请求层，禁直引 axios。
 * 后端统一响应 R<T> 由 request() 解包，本层直接拿到 data: T。
 * 下载端点返回二进制流（不经过 R<T>），使用 fetch() + Bearer token。
 */
import { request } from '@/foundation/request'
import { getAccessToken } from '@/foundation/auth/token'
import type { PageResult } from '@/contracts/common'
import type { StorageFile, StorageUploadResult } from '@/contracts/storage'

// ─── 后端分页原始形状 ───
// 已验证：后端 MP Page Jackson 序列化字段名为 pageNum/pageSize（与 workflow/system 模块一致）
interface BackendPage<T> {
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

function adaptPage<T>(raw: BackendPage<T>): PageResult<T> {
  return {
    list: raw.records,
    total: raw.total,
    pageNum: raw.pageNum,
    pageSize: raw.pageSize,
  }
}

// ═══════════════════════════════════════
// 上传文件
// ═══════════════════════════════════════

/** POST /storage/files/upload (multipart/form-data) → StorageUploadResult */
export async function uploadFile(file: File): Promise<StorageUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  return request<StorageUploadResult>({
    method: 'POST',
    url: '/storage/files/upload',
    data: formData,
  })
}

// ═══════════════════════════════════════
// 文件列表（分页）
// ═══════════════════════════════════════

/** GET /storage/files?page=&size= → PageResult<StorageFile> */
export async function listFiles(page: number, size: number): Promise<PageResult<StorageFile>> {
  const raw = await request<BackendPage<StorageFile>>({
    method: 'GET',
    url: '/storage/files',
    params: { page, size },
  })
  return adaptPage(raw)
}

// ═══════════════════════════════════════
// 文件详情
// ═══════════════════════════════════════

/** GET /storage/files/{storageKey} → StorageFile */
export async function getFileInfo(storageKey: string): Promise<StorageFile> {
  return request<StorageFile>({
    method: 'GET',
    url: `/storage/files/${storageKey}`,
  })
}

// ═══════════════════════════════════════
// 删除文件
// ═══════════════════════════════════════

/** DELETE /storage/files/{storageKey} → void */
export async function deleteFile(storageKey: string): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/storage/files/${storageKey}`,
  })
}

// ═══════════════════════════════════════
// 下载文件
// ═══════════════════════════════════════

/**
 * GET /storage/files/{storageKey}/download → Blob
 *
 * 使用 fetch() 而非 request()，因为下载端点返回二进制流
 * （ResponseEntity<InputStreamResource>），不经过 R<T> JSON 包裹。
 */
export async function downloadFile(storageKey: string): Promise<{ blob: Blob; fileName: string }> {
  const token = getAccessToken()
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '')
  const response = await fetch(
    `${apiBaseUrl}/storage/files/${encodeURIComponent(storageKey)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  )
  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`)
  }
  const blob = await response.blob()
  // 从 Content-Disposition 提取 filename（后端用 filename*=UTF-8'' 编码）
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match =
    disposition.match(/filename\*=(?:UTF-8''|utf-8'')(.+)/i) ??
    disposition.match(/filename="?(.+?)"?$/i)
  const fileName = match ? decodeURIComponent(match[1]) : storageKey
  return { blob, fileName }
}

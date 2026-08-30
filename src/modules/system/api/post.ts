/**
 * 岗位管理 API 层 —— 5 个 CRUD 函数。
 *
 * 全部经 foundation/request 单一请求层，禁直引 axios。
 * 后端统一响应 R<T> 由 request() 解包，本层直接拿到 data: T。
 */
import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type { SysPost, PostFilter } from '@/modules/system/types/post'

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

// ═══════════════════════════════════════

/** POST /system/post/page?pageNum=&pageSize= + body 筛选 */
export async function pagePosts(page: PageQuery, filter: PostFilter): Promise<PageResult<SysPost>> {
  const raw = await request<BackendPageResult<SysPost>>({
    method: 'POST',
    url: '/system/post/page',
    params: page,
    data: filter,
  })
  return adaptPage(raw)
}

/** GET /system/post/{id} */
export async function getPost(id: string): Promise<SysPost> {
  return request<SysPost>({ method: 'GET', url: `/system/post/${id}` })
}

/** POST /system/post → R<Long> */
export async function createPost(data: SysPost): Promise<string> {
  return request<string>({ method: 'POST', url: '/system/post', data })
}

/** PUT /system/post → R<Void> */
export async function updatePost(data: SysPost): Promise<void> {
  return request<void>({ method: 'PUT', url: '/system/post', data })
}

/** DELETE /system/post/{id} → R<Void> */
export async function deletePost(id: string): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/system/post/${id}` })
}

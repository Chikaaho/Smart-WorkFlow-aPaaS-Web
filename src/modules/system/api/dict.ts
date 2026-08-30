/**
 * 字典管理 API 层 —— 字典类型 5 个 + 字典项 5 个 CRUD 函数。
 *
 * 全部经 foundation/request 单一请求层，禁直引 axios（§2）。
 * 后端统一响应 R<T>{ code, message, data } 由 request() 解包，本层直接拿到 data: T。
 * 后端分页原始形状 records→前端 PageResult.list 在此适配。
 */
import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type {
  SysDictType,
  SysDictData,
  DictTypeFilter,
  DictDataFilter,
} from '@/modules/system/types/dict'

// ─── 后端分页原始形状（records 字段,与前端的 list 不同） ───

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
// 字典类型（5 个）
// ═══════════════════════════════════════

/** POST /system/dict/type/page?pageNum=&pageSize= + body 过滤 */
export async function pageDictTypes(
  page: PageQuery,
  filter: DictTypeFilter,
): Promise<PageResult<SysDictType>> {
  const raw = await request<BackendPageResult<SysDictType>>({
    method: 'POST',
    url: '/system/dict/type/page',
    params: page,
    data: filter,
  })
  return adaptPage(raw)
}

/** GET /system/dict/type/{id} */
export async function getDictType(id: string): Promise<SysDictType> {
  return request<SysDictType>({
    method: 'GET',
    url: `/system/dict/type/${id}`,
  })
}

/** POST /system/dict/type (body SysDictType) → R<Long> */
export async function createDictType(data: SysDictType): Promise<string> {
  return request<string>({
    method: 'POST',
    url: '/system/dict/type',
    data,
  })
}

/** PUT /system/dict/type (body SysDictType) → R<Void> */
export async function updateDictType(data: SysDictType): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: '/system/dict/type',
    data,
  })
}

/** DELETE /system/dict/type/{id} → R<Void> */
export async function deleteDictType(id: string): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/system/dict/type/${id}`,
  })
}

// ═══════════════════════════════════════
// 字典项（5 个）
// ═══════════════════════════════════════

/** POST /system/dict/data/page?pageNum=&pageSize= + body 过滤 */
export async function pageDictData(
  page: PageQuery,
  filter: DictDataFilter,
): Promise<PageResult<SysDictData>> {
  const raw = await request<BackendPageResult<SysDictData>>({
    method: 'POST',
    url: '/system/dict/data/page',
    params: page,
    data: filter,
  })
  return adaptPage(raw)
}

/** GET /system/dict/data/{id} */
export async function getDictData(id: string): Promise<SysDictData> {
  return request<SysDictData>({
    method: 'GET',
    url: `/system/dict/data/${id}`,
  })
}

/** POST /system/dict/data (body SysDictData) → R<Long> */
export async function createDictData(data: SysDictData): Promise<string> {
  return request<string>({
    method: 'POST',
    url: '/system/dict/data',
    data,
  })
}

/** PUT /system/dict/data (body SysDictData) → R<Void> */
export async function updateDictData(data: SysDictData): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: '/system/dict/data',
    data,
  })
}

/** DELETE /system/dict/data/{id} → R<Void> */
export async function deleteDictData(id: string): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/system/dict/data/${id}`,
  })
}

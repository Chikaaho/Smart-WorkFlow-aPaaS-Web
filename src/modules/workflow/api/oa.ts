import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type {
  CatalogItem,
  CatalogCategory,
  CategoryCounts,
  CategorySaveReq,
  WorkspaceLayout,
  WorkspaceLayoutResp,
} from '@/contracts/catalog'

export type { CatalogItem, CatalogCategory, CategoryCounts, WorkspaceLayout, WorkspaceLayoutResp }

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
// 流程中心事项目录（普通视角）
// ═══════════════════════════════════════

/** GET /workflow/catalog/items — 普通用户可发起事项（categoryId=0 表示未分类）。 */
export async function queryCatalogItems(
  page: PageQuery,
  filters: { keyword?: string; categoryId?: number } = {},
): Promise<PageResult<CatalogItem>> {
  const raw = await request<BackendPageResult<CatalogItem>>({
    method: 'GET',
    url: '/workflow/catalog/items',
    params: { ...page, keyword: filters.keyword, categoryId: filters.categoryId },
  })
  return adaptPage(raw)
}

/** GET /workflow/catalog/category-counts — 仅统计本人可见事项的分类聚合。 */
export async function queryCategoryCounts(): Promise<CategoryCounts> {
  return request<CategoryCounts>({ method: 'GET', url: '/workflow/catalog/category-counts' })
}

/** GET /workflow/catalog/items/{processKey} — 事项详情（服务端校验可见/发布/绑定）。 */
export async function queryCatalogItem(processKey: string): Promise<CatalogItem> {
  return request<CatalogItem>({
    method: 'GET',
    url: `/workflow/catalog/items/${processKey}`,
  })
}

// ═══════════════════════════════════════
// 分类与事项管理（后台管理视角，独立权限）
// ═══════════════════════════════════════

/** GET /workflow/categories — 分类列表（附事项归属计数）。 */
export async function listCategories(): Promise<CatalogCategory[]> {
  return request<CatalogCategory[]>({ method: 'GET', url: '/workflow/categories' })
}

/** POST /workflow/categories — 新建分类。 */
export async function createCategory(req: CategorySaveReq): Promise<CatalogCategory> {
  return request<CatalogCategory>({ method: 'POST', url: '/workflow/categories', data: req })
}

/** PUT /workflow/categories/{id} — 更新分类。 */
export async function updateCategory(id: number, req: CategorySaveReq): Promise<CatalogCategory> {
  return request<CatalogCategory>({
    method: 'PUT',
    url: `/workflow/categories/${id}`,
    data: req,
  })
}

/** DELETE /workflow/categories/{id} — 删除分类（有事项归属时服务端拒绝）。 */
export async function deleteCategory(id: number): Promise<void> {
  await request<void>({ method: 'DELETE', url: `/workflow/categories/${id}` })
}

/** GET /workflow/catalog/admin/items — 管理视角事项列表（含未发布）。 */
export async function queryAdminCatalogItems(
  page: PageQuery,
  filters: { keyword?: string; categoryId?: number } = {},
): Promise<PageResult<CatalogItem>> {
  const raw = await request<BackendPageResult<CatalogItem>>({
    method: 'GET',
    url: '/workflow/catalog/admin/items',
    params: { ...page, keyword: filters.keyword, categoryId: filters.categoryId },
  })
  return adaptPage(raw)
}

/** PUT /workflow/catalog/admin/items/{processKey}/category — 调整归属（null=未分类）。 */
export async function assignItemCategory(
  processKey: string,
  categoryId: number | null,
): Promise<void> {
  await request<void>({
    method: 'PUT',
    url: `/workflow/catalog/admin/items/${processKey}/category`,
    data: { categoryId },
  })
}

// ═══════════════════════════════════════
// 抄送我的 / 催办（个人办理）
// ═══════════════════════════════════════

/** 抄送我的列表项（只读）。 */
export interface MyCopyItem {
  id: number
  processInstanceId: string
  nodeKey: string
  taskId: string
  recipientId: string
  deliveryStatus: string
  createTime: string
  formKey: string | null
  processDefKey: string | null
  businessKey: string | null
  initiatorId: number | null
  instanceStatus: string | null
}

/** GET /workflow/my/copies — 仅本人收到的抄送（同事件去重，稳定分页）。 */
export async function queryMyCopies(
  page: PageQuery,
  filters: { keyword?: string; timeFrom?: string; timeTo?: string } = {},
): Promise<PageResult<MyCopyItem>> {
  const raw = await request<BackendPageResult<MyCopyItem>>({
    method: 'GET',
    url: '/workflow/my/copies',
    params: {
      ...page,
      keyword: filters.keyword,
      timeFrom: filters.timeFrom,
      timeTo: filters.timeTo,
    },
  })
  return adaptPage(raw)
}

/** 抄送详情（仅接收人本人；只读表单快照 + 审批进度/意见）。 */
export interface MyCopyDetail {
  copy: Record<string, unknown>
  instance: Record<string, unknown> | null
  formData: Record<string, unknown> | null
  progress: Array<Record<string, unknown>>
  history: Array<Record<string, unknown>>
}

/** GET /workflow/my/copies/{id} — 抄送详情（他人访问服务端拒绝）。 */
export async function queryMyCopyDetail(id: number): Promise<MyCopyDetail> {
  return request<MyCopyDetail>({ method: 'GET', url: `/workflow/my/copies/${id}` })
}

/** 催办响应。 */
export interface UrgeResp {
  result: 'ACCEPTED' | 'COOLDOWN' | 'REJECTED'
  detail: string
  recordId: number
}

/** POST /workflow/my/instances/{id}/urge — 发起人催办（10 分钟冷却，重复请求返回冷却信息）。 */
export async function urgeMyInstance(instanceId: number): Promise<UrgeResp> {
  return request<UrgeResp>({
    method: 'POST',
    url: `/workflow/my/instances/${instanceId}/urge`,
  })
}

// ═══════════════════════════════════════
// 工作台布局（P54，个人配置）
// ═══════════════════════════════════════

/** GET /system/workspace/layout — 当前用户布局（custom=false 表示默认布局）。 */
export async function getWorkspaceLayout(): Promise<WorkspaceLayoutResp> {
  return request<WorkspaceLayoutResp>({ method: 'GET', url: '/system/workspace/layout' })
}

/** PUT /system/workspace/layout — 保存布局（两用户配置独立）。 */
export async function saveWorkspaceLayout(layout: WorkspaceLayout): Promise<void> {
  await request<void>({ method: 'PUT', url: '/system/workspace/layout', data: layout })
}

/** DELETE /system/workspace/layout — 恢复默认布局。 */
export async function resetWorkspaceLayout(): Promise<void> {
  await request<void>({ method: 'DELETE', url: '/system/workspace/layout' })
}

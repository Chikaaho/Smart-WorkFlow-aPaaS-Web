/**
 * 部门管理 API 层 —— 4 个 CRUD 函数 + tree 端点。
 *
 * 部门不分页，用 GET /tree 返回全量列表（前端 flat→tree 转换）。
 * 不含 BackendPageResult / adaptPage / PageQuery / PageResult 导入。
 */
import { request } from '@/foundation/request'
import type { SysDept, DeptQuery } from '@/modules/system/types/dept'

// ═══════════════════════════════════════

/**
 * GET /system/dept/tree → flat 部门列表（可选查询条件，前端自行组装树）。
 *
 * - name：部门名称包含匹配（LIKE %name%）；trim 后空白等价未填写，不传 = 不筛选。
 * - status：0=正常、1=停用；不传 = 全部（无参数调用与旧行为完全一致）。
 * - 响应只含直接命中节点 + 定位所需祖先节点，无重复，sort 升序稳定排序。
 */
export async function listDeptTree(params?: DeptQuery): Promise<SysDept[]> {
  const query: Record<string, string | number> = {}
  const name = params?.name?.trim()
  if (name) query.name = name
  if (params?.status !== undefined) query.status = params.status
  return request<SysDept[]>({
    method: 'GET',
    url: '/system/dept/tree',
    ...(Object.keys(query).length > 0 ? { params: query } : {}),
  })
}

/** GET /system/dept/{id} */
export async function getDept(id: string): Promise<SysDept> {
  return request<SysDept>({ method: 'GET', url: `/system/dept/${id}` })
}

/** POST /system/dept → R<Long> */
export async function createDept(data: SysDept): Promise<string> {
  return request<string>({ method: 'POST', url: '/system/dept', data })
}

/** PUT /system/dept → R<Void> */
export async function updateDept(data: SysDept): Promise<void> {
  return request<void>({ method: 'PUT', url: '/system/dept', data })
}

/** DELETE /system/dept/{id} → R<Void> */
export async function deleteDept(id: string): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/system/dept/${id}` })
}

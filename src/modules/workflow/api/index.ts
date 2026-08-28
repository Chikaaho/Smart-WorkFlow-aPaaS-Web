import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type {
  TodoTask,
  TaskDetail,
  ProcessedTask,
  ProcessDef,
  ProcessInstance,
  InstanceDetail,
} from '@/contracts/bpm'

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
// 待办任务
// ═══════════════════════════════════════

/** GET /workflow/tasks/todo?pageNum=&pageSize= → PageResult<TodoTask> */
export async function queryTodoTasks(page: PageQuery): Promise<PageResult<TodoTask>> {
  const raw = await request<BackendPageResult<TodoTask>>({
    method: 'GET',
    url: '/workflow/tasks/todo',
    params: page,
  })
  return adaptPage(raw)
}

/** GET /workflow/tasks/{taskId} → TaskDetail */
export async function queryTaskDetail(taskId: string): Promise<TaskDetail> {
  return request<TaskDetail>({
    method: 'GET',
    url: `/workflow/tasks/${taskId}`,
  })
}

/** POST /workflow/tasks/{taskId}/complete → void */
export async function completeTask(taskId: string): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/workflow/tasks/${taskId}/complete`,
  })
}

/** POST /workflow/tasks/{taskId}/reject → void */
export async function rejectTask(taskId: string): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/workflow/tasks/${taskId}/reject`,
  })
}

// ═══════════════════════════════════════
// 已办任务
// ═══════════════════════════════════════

/** GET /workflow/tasks/processed?pageNum=&pageSize= → PageResult<ProcessedTask> */
export async function queryProcessedTasks(page: PageQuery): Promise<PageResult<ProcessedTask>> {
  const raw = await request<BackendPageResult<ProcessedTask>>({
    method: 'GET',
    url: '/workflow/tasks/processed',
    params: page,
  })
  return adaptPage(raw)
}

// ═══════════════════════════════════════
// 流程定义
// ═══════════════════════════════════════

/** 创建流程定义请求 */
export interface CreateProcessDefRequest {
  name: string
  formKey: string
}

/** 创建流程定义响应 */
export interface CreateProcessDefResponse {
  defId: number
  graph: unknown // ProcessGraph
}

/** POST /workflow/defs → CreateProcessDefResponse */
export async function createProcessDef(
  data: CreateProcessDefRequest,
): Promise<CreateProcessDefResponse> {
  return request<CreateProcessDefResponse>({
    method: 'POST',
    url: '/workflow/defs',
    data,
  })
}

/** GET /workflow/defs → PageResult<ProcessDef> */
export async function pageProcessDefs(page: PageQuery): Promise<PageResult<ProcessDef>> {
  const raw = await request<BackendPageResult<ProcessDef>>({
    method: 'GET',
    url: '/workflow/defs',
    params: page,
  })
  return adaptPage(raw)
}

/**
 * 获取流程定义已部署的原始 BPMN XML 流程图
 * @param id 流程定义 ID
 * @returns BPMN XML 字符串
 */
export async function getProcessDefGraph(id: number): Promise<string> {
  return request<string>({
    method: 'GET',
    url: `/workflow/defs/${id}/bpmn-xml`,
  })
}

/** DELETE /workflow/defs/{id} → void */
export async function deleteProcessDef(id: number): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/workflow/defs/${id}`,
  })
}

/** POST /workflow/defs/{id}/publish → ProcessDef */
export async function publishProcessDef(id: number): Promise<ProcessDef> {
  return request<ProcessDef>({
    method: 'POST',
    url: `/workflow/defs/${id}/publish`,
  })
}

/** PUT /workflow/defs/{id}/graph → void */
export async function saveProcessDefGraph(id: number, graph: unknown): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/workflow/defs/${id}/graph`,
    data: graph,
  })
}

// ═══════════════════════════════════════
// 流程实例监控
// ═══════════════════════════════════════

/** 流程实例列表过滤参数 */
export interface InstanceFilter {
  status?: string // RUNNING / APPROVED / REJECTED
  processDefKey?: string // 流程定义 key
  initiatorId?: number // 发起人 ID
}

/** GET /workflow/instances?pageNum=&pageSize=&status=&processDefKey=&initiatorId= → PageResult<ProcessInstance> */
export async function queryInstances(
  page: PageQuery,
  filter?: InstanceFilter,
): Promise<PageResult<ProcessInstance>> {
  const raw = await request<BackendPageResult<ProcessInstance>>({
    method: 'GET',
    url: '/workflow/instances',
    params: { ...page, ...filter },
  })
  return adaptPage(raw)
}

/** GET /workflow/instances/{processInstanceId} → InstanceDetail */
export async function getInstanceDetail(processInstanceId: string): Promise<InstanceDetail> {
  return request<InstanceDetail>({
    method: 'GET',
    url: `/workflow/instances/${processInstanceId}`,
  })
}

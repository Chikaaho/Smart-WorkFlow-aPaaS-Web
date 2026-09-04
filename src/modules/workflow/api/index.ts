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
import type { BpmNodeCapability, ApprovalActionRequest } from '@/contracts/bpm-node'
import { parseBpmNodeCapabilities } from '@/modules/workflow/utils/node-capabilities'

export const PROCESS_NODE_CAPABILITIES_URL = '/workflow/defs/node-capabilities'

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
export async function completeTask(
  taskId: string,
  data?: Partial<ApprovalActionRequest>,
): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/workflow/tasks/${taskId}/complete`,
    ...(data ? { data } : {}),
  })
}

/** POST /workflow/tasks/{taskId}/reject → void */
export async function rejectTask(
  taskId: string,
  data?: Partial<ApprovalActionRequest>,
): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/workflow/tasks/${taskId}/reject`,
    ...(data ? { data } : {}),
  })
}

/** POST /workflow/tasks/{taskId}/return → void */
export async function returnTask(taskId: string, data: ApprovalActionRequest): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/workflow/tasks/${taskId}/return`,
    data,
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

/**
 * GET /workflow/defs → PageResult<ProcessDef>
 * @param formKey 可选，按绑定表单 formKey 精确过滤（表单工作台"关联流程"区使用）。
 *                过滤由后端按持久化的 form_key 列执行，前端不做本地筛选。
 */
export async function pageProcessDefs(
  page: PageQuery,
  formKey?: string,
): Promise<PageResult<ProcessDef>> {
  const params: Record<string, unknown> = { ...page }
  if (formKey) params.formKey = formKey
  const raw = await request<BackendPageResult<ProcessDef>>({
    method: 'GET',
    url: '/workflow/defs',
    params,
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

/** GET /workflow/defs/{id} → ProcessGraph（流程图定义，含节点配置） */
export async function getProcessDefDefinition(id: number): Promise<ProcessGraphPayload> {
  return request<ProcessGraphPayload>({
    method: 'GET',
    url: `/workflow/defs/${id}`,
  })
}

/** 审批人候选项（脱敏：id/username/realName） */
export interface ApproverCandidate {
  id: number
  username: string
  realName: string | null
}

/** GET /workflow/defs/approver-candidates?keyword= → 审批人候选列表 */
export async function queryApproverCandidates(keyword = ''): Promise<ApproverCandidate[]> {
  return request<ApproverCandidate[]>({
    method: 'GET',
    url: '/workflow/defs/approver-candidates',
    params: { keyword },
  })
}

/**
 * GET /workflow/defs/node-capabilities → BpmNodeCapability[]
 *
 * request 负责 ApiResponse/ApiError 归一；此处只负责稳定契约解析，
 * 未知响应不会退回静态节点目录。
 */
export async function getProcessNodeCapabilities(): Promise<BpmNodeCapability[]> {
  const raw = await request<unknown>({
    method: 'GET',
    url: PROCESS_NODE_CAPABILITIES_URL,
  })
  return parseBpmNodeCapabilities(raw)
}

/** 流程图校验错误 */
export interface GraphValidationError {
  errorCode: number
  message: string
  nodeKey?: string | null
}

/** POST /workflow/defs/{id}/validate → GraphValidationError[] */
export async function validateProcessDefGraph(id: number): Promise<GraphValidationError[]> {
  return request<GraphValidationError[]>({
    method: 'POST',
    url: `/workflow/defs/${id}/validate`,
  })
}

/** 前端最小图 payload（与后端 ProcessGraph 对齐的子集） */
export interface ProcessGraphPayload {
  processKey: string
  name: string
  formKey: string
  version?: number
  elements?: Array<{
    id: string
    kind: string
    type?: string
    source?: string
    target?: string
    config?: Record<string, unknown>
    style?: Record<string, unknown>
  }>
  canvas?: Record<string, unknown>
}

// ═══════════════════════════════════════
// 流程实例监控
// ═══════════════════════════════════════

/** 流程实例列表过滤参数 */
export interface InstanceFilter {
  status?: string // RUNNING / APPROVED / REJECTED
  processDefKey?: string // 流程定义 key
  initiatorId?: number // 发起人 ID
  businessKey?: string // 业务键（表单记录 ID）
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

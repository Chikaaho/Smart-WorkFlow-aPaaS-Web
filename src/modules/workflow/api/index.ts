import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type {
  TodoTask,
  TaskDetail,
  ProcessedTask,
  ProcessDef,
  ProcessInstance,
  InstanceDetail,
  MyInstanceDetail,
  MyProcessedItem,
  BpmDraft,
  DraftCreateReq,
  DraftUpdateReq,
  CommandAcceptResp,
  WorkflowCommandStatus,
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

// ═══════════════════════════════════════
// 审批动作（异步命令通道）
// ═══════════════════════════════════════

/** 审批动作的 URL action 段（对齐后端 /workflow/commands/tasks/{taskId}/{action}） */
export type TaskActionSegment = 'complete' | 'reject' | 'return'

/**
 * POST /workflow/commands/tasks/{taskId}/{action} → CommandAcceptResp
 * 受理 ≠ 成功：COMPLETED/FAILED 终态须由 queryCommandStatus 轮询确认。
 */
export async function acceptTaskAction(
  taskId: string,
  action: TaskActionSegment,
  data?: Partial<ApprovalActionRequest>,
): Promise<CommandAcceptResp> {
  return request<CommandAcceptResp>({
    method: 'POST',
    url: `/workflow/commands/tasks/${taskId}/${action}`,
    ...(data ? { data } : {}),
  })
}

/** GET /workflow/commands/{commandId} → WorkflowCommandStatus */
export async function queryCommandStatus(commandId: string): Promise<WorkflowCommandStatus> {
  return request<WorkflowCommandStatus>({
    method: 'GET',
    url: `/workflow/commands/${commandId}`,
  })
}

export interface CommandPollOptions {
  intervalMs?: number // 默认 500ms
  maxAttempts?: number // 默认 10 次
}

/**
 * 受理后轮询命令状态到终态（COMPLETED/FAILED）。
 * 超过 maxAttempts 仍未终态时返回 null（调用方如实提示「处理中」，不伪装成功）。
 */
export async function pollCommandStatus(
  commandId: string,
  options?: CommandPollOptions,
): Promise<WorkflowCommandStatus | null> {
  const intervalMs = options?.intervalMs ?? 500
  const maxAttempts = options?.maxAttempts ?? 10
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    const status = await queryCommandStatus(commandId)
    if (status.status === 'COMPLETED' || status.status === 'FAILED') {
      return status
    }
  }
  return null
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

// ═══════════════════════════════════════
// OA 个人中心：我发起的 / 我的草稿 / 我的已办
// ═══════════════════════════════════════

/** 我发起的列表过滤参数 */
export interface MyInstanceFilter {
  status?: string // RUNNING / APPROVED / REJECTED
  keyword?: string // 流程名称/业务单号模糊匹配
}

/** GET /workflow/my/instances?pageNum=&pageSize=&status=&keyword= → PageResult<ProcessInstance> */
export async function myInstances(
  page: PageQuery,
  filter?: MyInstanceFilter,
): Promise<PageResult<ProcessInstance>> {
  const raw = await request<BackendPageResult<ProcessInstance>>({
    method: 'GET',
    url: '/workflow/my/instances',
    params: { ...page, ...filter },
  })
  return adaptPage(raw)
}

/** GET /workflow/my/instances/{id} → MyInstanceDetail */
export async function myInstanceDetail(id: number | string): Promise<MyInstanceDetail> {
  return request<MyInstanceDetail>({
    method: 'GET',
    url: `/workflow/my/instances/${id}`,
  })
}

/** 已发布表单定义候选（GET /form/def/published 行） */
export interface PublishedFormDef {
  formKey: string
  name: string
  formVersion: number
}

/**
 * GET /form/def/published → PublishedFormDef[]
 * 仅 PUBLISHED 表单，登录即可访问；「我的草稿」新建时选表单候选使用。
 * 封装放在 workflow 模块（request 直调），避免 modules 互引。
 */
export async function publishedFormDefs(): Promise<PublishedFormDef[]> {
  return request<PublishedFormDef[]>({
    method: 'GET',
    url: '/form/def/published',
  })
}

/** GET /workflow/drafts?pageNum=&pageSize= → PageResult<BpmDraft> */
export async function myDrafts(page: PageQuery): Promise<PageResult<BpmDraft>> {
  const raw = await request<BackendPageResult<BpmDraft>>({
    method: 'GET',
    url: '/workflow/drafts',
    params: page,
  })
  return adaptPage(raw)
}

/** POST /workflow/drafts → BpmDraft */
export async function createDraft(data: DraftCreateReq): Promise<BpmDraft> {
  return request<BpmDraft>({
    method: 'POST',
    url: '/workflow/drafts',
    data,
  })
}

/** GET /workflow/drafts/{id} → BpmDraft */
export async function getDraft(id: number | string): Promise<BpmDraft> {
  return request<BpmDraft>({
    method: 'GET',
    url: `/workflow/drafts/${id}`,
  })
}

/** PUT /workflow/drafts/{id} → BpmDraft */
export async function updateDraft(id: number | string, data: DraftUpdateReq): Promise<BpmDraft> {
  return request<BpmDraft>({
    method: 'PUT',
    url: `/workflow/drafts/${id}`,
    data,
  })
}

/** DELETE /workflow/drafts/{id} → void（幂等） */
export async function deleteDraft(id: number | string): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/workflow/drafts/${id}`,
  })
}

/** POST /workflow/drafts/{id}/submit → CommandAcceptResp（受理 ≠ 成功） */
export async function submitDraft(id: number | string): Promise<CommandAcceptResp> {
  return request<CommandAcceptResp>({
    method: 'POST',
    url: `/workflow/drafts/${id}/submit`,
  })
}

/** 我的已办列表过滤参数 */
export interface MyProcessedFilter {
  source?: string // ACTION / HISTORY_COMPAT
}

/** GET /workflow/my/processed?pageNum=&pageSize=&source= → PageResult<MyProcessedItem> */
export async function myProcessed(
  page: PageQuery,
  filter?: MyProcessedFilter,
): Promise<PageResult<MyProcessedItem>> {
  const raw = await request<BackendPageResult<MyProcessedItem>>({
    method: 'GET',
    url: '/workflow/my/processed',
    params: { ...page, ...filter },
  })
  return adaptPage(raw)
}

import { request } from '@/foundation/request'

/** 雪花 id 在 JSON 中是字符串，路由参数也可能是字符串；API 入参统一兼容 */
type EntityId = number | string
import type { PageQuery, PageResult } from '@/contracts/common'
import type {
  AgentGraphDef,
  AgentGraphSnapshot,
  AgentGraphCreateReq,
  AgentGraphExecuteReq,
  AgentGraphExecuteResp,
  AgentProvider,
  AgentProviderSaveReq,
  AgentModel,
  AgentModelConfigOption,
  AgentModelSaveReq,
  AgentModelTestConnectionResp,
  AgentToolOption,
  AgentToolInternalConfig,
  AgentToolInternalSaveReq,
  AgentToolExternalConfig,
  AgentToolExternalSaveReq,
  ProcessGraph,
  AgentGraphExecution,
  AgentGraphExecutionDetail,
  AgentGraphExecutionNode,
  AgentConversation,
  AgentConversationMessage,
  AgentGraphDebugSession,
  AgentGraphDebugNode,
  AgentGraphDebugCreateReq,
  KnowledgeBase,
  KnowledgeBaseCreateReq,
  KnowledgeDocument,
  KnowledgeHit,
  KnowledgeRetrievalReq,
} from '@/contracts/agent'

// ─── 后端分页原始形状（对齐 AgentGraphDefController.pageDefs 的 PageResult） ───
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

// ═══════════════════════════════════════════════════════════════
// 图定义（AgentGraphDefController，权限：查询 view / 写 manage）
// ═══════════════════════════════════════════════════════════════

/** POST /agent/graph-defs {name} → 新建图定义（服务端生成初始 START→END 图），返回 id */
export async function createGraphDef(name: string): Promise<number> {
  const req: AgentGraphCreateReq = { name }
  return request<number>({
    method: 'POST',
    url: '/agent/graph-defs',
    data: req,
  })
}

/** PUT /agent/graph-defs/{id}/graph → 保存草稿（全量覆盖 graph_json，不跑校验） */
export async function saveDraftGraph(id: EntityId, graph: ProcessGraph): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/agent/graph-defs/${id}/graph`,
    data: graph,
  })
}

/** POST /agent/graph-defs/{id}/publish → 发布（defVersion 递增 + PUBLISHED） */
export async function publishGraphDef(id: EntityId): Promise<AgentGraphDef> {
  return request<AgentGraphDef>({
    method: 'POST',
    url: `/agent/graph-defs/${id}/publish`,
  })
}

/** GET /agent/graph-defs/{id} → 图详情（设计器回显：解析后的 ProcessGraph） */
export async function getGraphDef(id: EntityId): Promise<ProcessGraph> {
  return request<ProcessGraph>({
    method: 'GET',
    url: `/agent/graph-defs/${id}`,
  })
}

/** GET /agent/graph-defs?pageNum=&pageSize= → PageResult<AgentGraphDef> */
export async function pageGraphDefs(page: PageQuery): Promise<PageResult<AgentGraphDef>> {
  const raw = await request<BackendPageResult<AgentGraphDef>>({
    method: 'GET',
    url: '/agent/graph-defs',
    params: page,
  })
  return adaptPage(raw)
}

/** GET /agent/graph-defs/{id}/versions → 历史发布版本（D022-06，新版本在前） */
export async function listGraphDefVersions(id: EntityId): Promise<AgentGraphSnapshot[]> {
  return request<AgentGraphSnapshot[]>({
    method: 'GET',
    url: `/agent/graph-defs/${id}/versions`,
  })
}

/** PUT /agent/graph-defs/{id}/settings → 更新图级设置（执行超时秒数） */
export async function updateGraphDefSettings(
  id: EntityId,
  executionTimeoutSeconds: number,
): Promise<AgentGraphDef> {
  return request<AgentGraphDef>({
    method: 'PUT',
    url: `/agent/graph-defs/${id}/settings`,
    data: { executionTimeoutSeconds },
  })
}

/** DELETE /agent/graph-defs/{id} → 删除（逻辑删除，幂等） */
export async function deleteGraphDef(id: EntityId): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/agent/graph-defs/${id}`,
  })
}

/** POST /agent/graph-defs/{id}/execute {input} → 执行已发布图（一次性返回最终结果） */
export async function executeGraph(id: EntityId, input: string): Promise<AgentGraphExecuteResp> {
  const req: AgentGraphExecuteReq = { input }
  return request<AgentGraphExecuteResp>({
    method: 'POST',
    url: `/agent/graph-defs/${id}/execute`,
    data: req,
  })
}

// ═══════════════════════════════════════════════════════════════
// 供应商管理（AgentProviderController，权限：查询 view / 写 manage，F1 D022-02）
// ═══════════════════════════════════════════════════════════════

/** GET /agent/providers?pageNum=&pageSize=&nameKeyword= → PageResult<AgentProvider>（密钥脱敏） */
export async function pageProviders(
  page: PageQuery,
  nameKeyword?: string,
): Promise<PageResult<AgentProvider>> {
  const raw = await request<BackendPageResult<AgentProvider>>({
    method: 'GET',
    url: '/agent/providers',
    params: {
      ...page,
      ...(nameKeyword && nameKeyword.trim() ? { nameKeyword: nameKeyword.trim() } : {}),
    },
  })
  return adaptPage(raw)
}

/** GET /agent/providers/enabled → List<AgentProvider>（模型编辑下拉用） */
export async function listEnabledProviders(): Promise<AgentProvider[]> {
  return request<AgentProvider[]>({
    method: 'GET',
    url: '/agent/providers/enabled',
  })
}

/** GET /agent/providers/{id} → 供应商详情（密钥脱敏） */
export async function getProvider(id: number): Promise<AgentProvider> {
  return request<AgentProvider>({
    method: 'GET',
    url: `/agent/providers/${id}`,
  })
}

/** POST /agent/providers {req} → 新建（apiKey 非空时后端加密落库），返回新 id */
export async function createProvider(req: AgentProviderSaveReq): Promise<number> {
  return request<number>({
    method: 'POST',
    url: '/agent/providers',
    data: req,
  })
}

/** PUT /agent/providers/{id} {req} → 编辑（apiKey 为空/未传时后端保留旧密钥） */
export async function updateProvider(id: number, req: AgentProviderSaveReq): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/agent/providers/${id}`,
    data: req,
  })
}

/** DELETE /agent/providers/{id} → 删除（逻辑删除，幂等） */
export async function deleteProvider(id: number): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/agent/providers/${id}`,
  })
}

// ═══════════════════════════════════════════════════════════════
// 模型管理（AgentModelController，权限：列表/详情 view、写 manage、测试 test）
// ═══════════════════════════════════════════════════════════════

/** GET /agent/models?pageNum=&pageSize=&providerId=&nameKeyword= → PageResult<AgentModel> */
export async function pageModels(
  page: PageQuery,
  providerId?: number,
  nameKeyword?: string,
): Promise<PageResult<AgentModel>> {
  const raw = await request<BackendPageResult<AgentModel>>({
    method: 'GET',
    url: '/agent/models',
    params: {
      ...page,
      ...(providerId ? { providerId } : {}),
      ...(nameKeyword && nameKeyword.trim() ? { nameKeyword: nameKeyword.trim() } : {}),
    },
  })
  return adaptPage(raw)
}

/** GET /agent/models/{id} → 模型详情 */
export async function getModel(id: number): Promise<AgentModel> {
  return request<AgentModel>({
    method: 'GET',
    url: `/agent/models/${id}`,
  })
}

/** POST /agent/models {req} → 新建，返回新 id */
export async function createModel(req: AgentModelSaveReq): Promise<number> {
  return request<number>({
    method: 'POST',
    url: '/agent/models',
    data: req,
  })
}

/** PUT /agent/models/{id} {req} → 编辑 */
export async function updateModel(id: number, req: AgentModelSaveReq): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/agent/models/${id}`,
    data: req,
  })
}

/** DELETE /agent/models/{id} → 删除（幂等） */
export async function deleteModel(id: number): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/agent/models/${id}`,
  })
}

/** POST /agent/models/{id}/test-connection → 连通性测试（真实最小调用，code≠0 表示不可测） */
export async function testModelConnection(id: number): Promise<AgentModelTestConnectionResp> {
  return request<AgentModelTestConnectionResp>({
    method: 'POST',
    url: `/agent/models/${id}/test-connection`,
  })
}

// ═══════════════════════════════════════════════════════════════
// 只读下拉辅助（LLM/TOOL 节点属性面板数据源，非分页展示场景，一次性拉全量）
// ═══════════════════════════════════════════════════════════════

/** GET /agent/models/enabled?capability=CHAT → 模型选项（仅启用项，F1 两级模型端点） */
export async function listModelOptions(capability = 'CHAT'): Promise<AgentModelConfigOption[]> {
  const list = await request<
    {
      id: number
      name: string
      modelName: string
      providerId: number | null
      providerName: string | null
      providerApiFormat: string | null
      enabled: boolean
    }[]
  >({
    method: 'GET',
    url: '/agent/models/enabled',
    params: capability ? { capability } : {},
  })
  return list.map((m) => ({
    id: m.id,
    name: m.name,
    modelName: m.modelName,
    providerId: m.providerId ?? undefined,
    providerName: m.providerName ?? undefined,
    providerApiFormat: m.providerApiFormat ?? undefined,
    enabled: m.enabled,
  }))
}

/** GET /agent/tool/internal + /agent/tool/external → 工具选项（合并，value=toolName 精确值，仅启用工具） */
export async function listToolOptions(): Promise<AgentToolOption[]> {
  const [internalRaw, externalRaw] = await Promise.all([
    request<BackendPageResult<{ name: string; description?: string }>>({
      method: 'GET',
      url: '/agent/tool/internal',
      params: { pageNum: 1, pageSize: 1000, enabled: true },
    }),
    request<BackendPageResult<{ name: string; description?: string }>>({
      method: 'GET',
      url: '/agent/tool/external',
      params: { pageNum: 1, pageSize: 1000, enabled: true },
    }),
  ])
  return [
    ...internalRaw.records.map((t) => ({
      toolName: t.name,
      description: t.description,
      source: 'internal' as const,
    })),
    ...externalRaw.records.map((t) => ({
      toolName: t.name,
      description: t.description,
      source: 'external' as const,
    })),
  ]
}

// ═══════════════════════════════════════════════════════════════
// M07-F03-02: 工具管理 CRUD（AgentToolConfigController，权限：查询 view / 写 manage）
// ═══════════════════════════════════════════════════════════════

// ─── 内部工具 ───

/** GET /agent/tool/internal?pageNum=&pageSize=&nameKeyword=&enabled= → PageResult<AgentToolInternalConfig> */
export async function pageInternalTools(
  page: PageQuery,
  nameKeyword?: string,
  enabled?: boolean | null,
): Promise<PageResult<AgentToolInternalConfig>> {
  const raw = await request<BackendPageResult<AgentToolInternalConfig>>({
    method: 'GET',
    url: '/agent/tool/internal',
    params: {
      ...page,
      ...(nameKeyword && nameKeyword.trim() ? { nameKeyword: nameKeyword.trim() } : {}),
      ...(enabled !== null && enabled !== undefined ? { enabled } : {}),
    },
  })
  return adaptPage(raw)
}

/** GET /agent/tool/internal/{id} → AgentToolInternalConfig */
export async function getInternalTool(id: number): Promise<AgentToolInternalConfig> {
  return request<AgentToolInternalConfig>({
    method: 'GET',
    url: `/agent/tool/internal/${id}`,
  })
}

/** POST /agent/tool/internal → 创建，返回新 id */
export async function createInternalTool(req: AgentToolInternalSaveReq): Promise<number> {
  return request<number>({
    method: 'POST',
    url: '/agent/tool/internal',
    data: req,
  })
}

/** PUT /agent/tool/internal/{id} → 编辑 */
export async function updateInternalTool(id: number, req: AgentToolInternalSaveReq): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/agent/tool/internal/${id}`,
    data: req,
  })
}

/** DELETE /agent/tool/internal/{id} → 删除（逻辑删除，幂等） */
export async function deleteInternalTool(id: number): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/agent/tool/internal/${id}`,
  })
}

/** PUT /agent/tool/internal/{id}/toggle?enabled= → 启用/禁用 */
export async function toggleInternalTool(id: number, enabled: boolean): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/agent/tool/internal/${id}/toggle`,
    params: { enabled },
  })
}

// ─── 外部 HTTP 工具 ───

/** GET /agent/tool/external?pageNum=&pageSize=&nameKeyword=&enabled= → PageResult<AgentToolExternalConfig> */
export async function pageExternalTools(
  page: PageQuery,
  nameKeyword?: string,
  enabled?: boolean | null,
): Promise<PageResult<AgentToolExternalConfig>> {
  const raw = await request<BackendPageResult<AgentToolExternalConfig>>({
    method: 'GET',
    url: '/agent/tool/external',
    params: {
      ...page,
      ...(nameKeyword && nameKeyword.trim() ? { nameKeyword: nameKeyword.trim() } : {}),
      ...(enabled !== null && enabled !== undefined ? { enabled } : {}),
    },
  })
  return adaptPage(raw)
}

/** GET /agent/tool/external/{id} → AgentToolExternalConfig */
export async function getExternalTool(id: number): Promise<AgentToolExternalConfig> {
  return request<AgentToolExternalConfig>({
    method: 'GET',
    url: `/agent/tool/external/${id}`,
  })
}

/** POST /agent/tool/external → 创建，返回新 id */
export async function createExternalTool(req: AgentToolExternalSaveReq): Promise<number> {
  return request<number>({
    method: 'POST',
    url: '/agent/tool/external',
    data: req,
  })
}

/** PUT /agent/tool/external/{id} → 编辑 */
export async function updateExternalTool(id: number, req: AgentToolExternalSaveReq): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/agent/tool/external/${id}`,
    data: req,
  })
}

/** DELETE /agent/tool/external/{id} → 删除（逻辑删除，幂等） */
export async function deleteExternalTool(id: number): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/agent/tool/external/${id}`,
  })
}

/** PUT /agent/tool/external/{id}/toggle?enabled= → 启用/禁用 */
export async function toggleExternalTool(id: number, enabled: boolean): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/agent/tool/external/${id}/toggle`,
    params: { enabled },
  })
}

// ═══════════════════════════════════════════════════════════════
// 图执行历史（AgentGraphExecutionController）
// ═══════════════════════════════════════════════════════════════

/** GET /agent/graph-executions?pageNum=&pageSize=&graphDefId= → PageResult<AgentGraphExecutionDTO> */
export async function pageGraphExecutions(params: {
  pageNum: number
  pageSize: number
  graphDefId?: number
}): Promise<PageResult<AgentGraphExecution>> {
  const raw = await request<BackendPageResult<AgentGraphExecution>>({
    method: 'GET',
    url: '/agent/graph-executions',
    params,
  })
  return adaptPage(raw)
}

/** GET /agent/graph-executions/{executionId} → AgentGraphExecutionDetailDTO (404 若不存在) */
export async function getExecutionDetail(
  executionId: EntityId,
): Promise<AgentGraphExecutionDetail> {
  return request<AgentGraphExecutionDetail>({
    method: 'GET',
    url: `/agent/graph-executions/${executionId}`,
  })
}

/** GET /agent/graph-executions/{executionId}/nodes? → List<AgentGraphExecutionNodeDTO> (按 nodeSeq 排序) */
export async function listExecutionNodes(
  executionId: EntityId,
): Promise<AgentGraphExecutionNode[]> {
  return request<AgentGraphExecutionNode[]>({
    method: 'GET',
    url: `/agent/graph-executions/${executionId}/nodes`,
  })
}

// ─── 扩展 API：为执行列表补充 defVersion 查询 ───

interface GraphDefVersionInfo {
  id: number
  name: string
  defVersion: number
}

/** GET /agent/graph-defs/{id} → { id, name, defVersion }（轻量级，不带 graph_json） */
export async function getGraphDefVersionOnly(id: EntityId): Promise<GraphDefVersionInfo> {
  const raw = await request<GraphDefVersionInfo>({
    method: 'GET',
    url: `/agent/graph-defs/${id}`,
  })
  return raw
}

/** 扩展类型：带 defVersion 的执行记录 */
type AgentGraphExecutionWithVersion = AgentGraphExecution & { defVersion: number }

/** 分页查询图执行历史并自动关联 defVersion（内部使用，供列表页调用） */
async function pageGraphExecutionsInternal(params: {
  pageNum: number
  pageSize: number
  graphDefId?: number
}): Promise<PageResult<AgentGraphExecutionWithVersion>> {
  // 1. 先拉取执行列表
  const result = await pageGraphExecutions(params)

  // 2. 收集所有唯一的 graphDefId
  const graphDefIds = Array.from(new Set(result.list.map((e) => e.graphDefId)))

  // 3. 并发拉取每个图的最新版本号与名称
  const versionMap = new Map<number, number>()
  const nameMap = new Map<number, string>()
  if (graphDefIds.length > 0) {
    const versions = await Promise.all(
      graphDefIds.map(async (id) => {
        try {
          const info = await getGraphDefVersionOnly(id)
          return { id, defVersion: info.defVersion, name: info.name }
        } catch {
          return { id, defVersion: 1, name: '' } // 兜底版本号
        }
      }),
    )
    versions.forEach(({ id, defVersion, name }) => {
      versionMap.set(id, defVersion)
      if (name) nameMap.set(id, name)
    })
  }

  // 4. 版本号优先取执行记录自身绑定的快照版本（D022-06）；缺失时才回退图当前版本
  const enrichedList: AgentGraphExecutionWithVersion[] = result.list.map((item) => ({
    ...item,
    graphName: item.graphName || nameMap.get(item.graphDefId) || '',
    defVersion: item.graphDefVersion ?? versionMap.get(item.graphDefId) ?? 1,
  }))

  return {
    list: enrichedList,
    total: result.total,
    pageNum: result.pageNum,
    pageSize: result.pageSize,
  }
}

/** 导出扩展版：与基础 API 保持一致的对外接口 */
export { pageGraphExecutionsInternal as pageGraphExecutionsWithVersion }

// ═══════════════════════════════════════════════════════════════
// M07-F04-02: 会话历史（AgentConversationController）
// ═══════════════════════════════════════════════════════════════

/** GET /agent/conversations?agentModelConfigId= → List<AgentConversationDTO> */
export async function listConversations(agentModelConfigId?: number): Promise<AgentConversation[]> {
  return request<AgentConversation[]>({
    method: 'GET',
    url: '/agent/conversations',
    params: {
      ...(agentModelConfigId && { agentModelConfigId }),
    },
  })
}

/** GET /agent/conversations/{sessionId}/messages → List<AgentConversationMessageDTO> */
export async function listConversationMessages(
  sessionId: EntityId,
): Promise<AgentConversationMessage[]> {
  return request<AgentConversationMessage[]>({
    method: 'GET',
    url: `/agent/conversations/${sessionId}/messages`,
  })
}

// ═══════════════════════════════════════════════════════════════
// M07-F02-04: 图单步调试（AgentGraphDebugSessionController）
// ═══════════════════════════════════════════════════════════════

/** POST /agent/graph-debug-sessions {graphDefId,input} → AgentGraphDebugSession */
export async function createDebugSession(
  req: AgentGraphDebugCreateReq,
): Promise<AgentGraphDebugSession> {
  return request<AgentGraphDebugSession>({
    method: 'POST',
    url: '/agent/graph-debug-sessions',
    data: req,
  })
}

/** GET /agent/graph-debug-sessions/{id} → AgentGraphDebugSession */
export async function getDebugSession(sessionId: EntityId): Promise<AgentGraphDebugSession> {
  return request<AgentGraphDebugSession>({
    method: 'GET',
    url: `/agent/graph-debug-sessions/${sessionId}`,
  })
}

/** POST /agent/graph-debug-sessions/{id}/step?expectedVersion= → AgentGraphDebugSession */
export async function stepDebugSession(
  sessionId: EntityId,
  expectedVersion?: number,
): Promise<AgentGraphDebugSession> {
  return request<AgentGraphDebugSession>({
    method: 'POST',
    url: `/agent/graph-debug-sessions/${sessionId}/step`,
    params: expectedVersion !== undefined ? { expectedVersion } : undefined,
  })
}

/** POST /agent/graph-debug-sessions/{id}/continue → AgentGraphDebugSession */
export async function continueDebugSession(sessionId: EntityId): Promise<AgentGraphDebugSession> {
  return request<AgentGraphDebugSession>({
    method: 'POST',
    url: `/agent/graph-debug-sessions/${sessionId}/continue`,
  })
}

/** POST /agent/graph-debug-sessions/{id}/stop → AgentGraphDebugSession */
export async function stopDebugSession(sessionId: EntityId): Promise<AgentGraphDebugSession> {
  return request<AgentGraphDebugSession>({
    method: 'POST',
    url: `/agent/graph-debug-sessions/${sessionId}/stop`,
  })
}

/** PUT /agent/graph-debug-sessions/{id}/breakpoints {breakpoints} → AgentGraphDebugSession */
export async function updateDebugBreakpoints(
  sessionId: EntityId,
  breakpoints: string[],
): Promise<AgentGraphDebugSession> {
  return request<AgentGraphDebugSession>({
    method: 'PUT',
    url: `/agent/graph-debug-sessions/${sessionId}/breakpoints`,
    data: { breakpoints },
  })
}

/** GET /agent/graph-debug-sessions/{id}/nodes → AgentGraphDebugNode[] */
export async function listDebugNodes(sessionId: EntityId): Promise<AgentGraphDebugNode[]> {
  return request<AgentGraphDebugNode[]>({
    method: 'GET',
    url: `/agent/graph-debug-sessions/${sessionId}/nodes`,
  })
}

/** GET /agent/graph-debug-sessions → PageResult<AgentGraphDebugSession> */
export async function pageDebugSessions(params: {
  pageNum: number
  pageSize: number
  graphDefId?: number
}): Promise<PageResult<AgentGraphDebugSession>> {
  const raw = await request<BackendPageResult<AgentGraphDebugSession>>({
    method: 'GET',
    url: '/agent/graph-debug-sessions',
    params,
  })
  return adaptPage(raw)
}

// ═══════════════════════════════════════════════════════════════
// F1 阶段 3：知识库 / RAG（KnowledgeBaseController）
// ═══════════════════════════════════════════════════════════════

/** GET /agent/knowledge-bases → PageResult<KnowledgeBase> */
export async function pageKnowledgeBases(params: {
  pageNum: number
  pageSize: number
  nameKeyword?: string
}): Promise<PageResult<KnowledgeBase>> {
  const raw = await request<BackendPageResult<KnowledgeBase>>({
    method: 'GET',
    url: '/agent/knowledge-bases',
    params,
  })
  return adaptPage(raw)
}

/** GET /agent/knowledge-bases/{id} → KnowledgeBase */
export async function getKnowledgeBase(id: EntityId): Promise<KnowledgeBase> {
  return request<KnowledgeBase>({
    method: 'GET',
    url: `/agent/knowledge-bases/${id}`,
  })
}

/** POST /agent/knowledge-bases → KnowledgeBase */
export async function createKnowledgeBase(req: KnowledgeBaseCreateReq): Promise<KnowledgeBase> {
  return request<KnowledgeBase>({
    method: 'POST',
    url: '/agent/knowledge-bases',
    data: req,
  })
}

/** DELETE /agent/knowledge-bases/{id}（分片与向量一并删除） */
export async function deleteKnowledgeBase(id: EntityId): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/agent/knowledge-bases/${id}`,
  })
}

/** GET /agent/knowledge-bases/{id}/documents → KnowledgeDocument[] */
export async function listKnowledgeDocuments(id: EntityId): Promise<KnowledgeDocument[]> {
  return request<KnowledgeDocument[]>({
    method: 'GET',
    url: `/agent/knowledge-bases/${id}/documents`,
  })
}

/** POST /agent/knowledge-bases/{id}/documents (multipart) → KnowledgeDocument */
export async function uploadKnowledgeDocument(
  id: EntityId,
  file: File,
): Promise<KnowledgeDocument> {
  const formData = new FormData()
  formData.append('file', file)
  return request<KnowledgeDocument>({
    method: 'POST',
    url: `/agent/knowledge-bases/${id}/documents`,
    data: formData,
  })
}

/** DELETE /agent/knowledge-bases/{id}/documents/{documentId} */
export async function deleteKnowledgeDocument(id: EntityId, documentId: EntityId): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/agent/knowledge-bases/${id}/documents/${documentId}`,
  })
}

/** POST /agent/knowledge-bases/{id}/retrieve → KnowledgeHit[] */
export async function retrieveKnowledge(
  id: EntityId,
  req: KnowledgeRetrievalReq,
): Promise<KnowledgeHit[]> {
  return request<KnowledgeHit[]>({
    method: 'POST',
    url: `/agent/knowledge-bases/${id}/retrieve`,
    data: req,
  })
}

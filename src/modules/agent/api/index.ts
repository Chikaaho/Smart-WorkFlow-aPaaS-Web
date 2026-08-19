import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import type {
  AgentGraphDef,
  AgentGraphCreateReq,
  AgentGraphExecuteReq,
  AgentGraphExecuteResp,
  AgentModelConfig,
  AgentModelConfigOption,
  AgentModelSaveReq,
  AgentModelTestConnectionResp,
  AgentToolOption,
  ProcessGraph,
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
export async function saveDraftGraph(id: number, graph: ProcessGraph): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/agent/graph-defs/${id}/graph`,
    data: graph,
  })
}

/** POST /agent/graph-defs/{id}/publish → 发布（defVersion 递增 + PUBLISHED） */
export async function publishGraphDef(id: number): Promise<AgentGraphDef> {
  return request<AgentGraphDef>({
    method: 'POST',
    url: `/agent/graph-defs/${id}/publish`,
  })
}

/** GET /agent/graph-defs/{id} → 图详情（设计器回显：解析后的 ProcessGraph） */
export async function getGraphDef(id: number): Promise<ProcessGraph> {
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

/** DELETE /agent/graph-defs/{id} → 删除（逻辑删除，幂等） */
export async function deleteGraphDef(id: number): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/agent/graph-defs/${id}`,
  })
}

/** POST /agent/graph-defs/{id}/execute {input} → 执行已发布图（一次性返回最终结果） */
export async function executeGraph(id: number, input: string): Promise<AgentGraphExecuteResp> {
  const req: AgentGraphExecuteReq = { input }
  return request<AgentGraphExecuteResp>({
    method: 'POST',
    url: `/agent/graph-defs/${id}/execute`,
    data: req,
  })
}

// ═══════════════════════════════════════════════════════════════
// 大模型管理（AgentModelConfigController，权限：列表/详情 view、写 manage、测试 test）
// ═══════════════════════════════════════════════════════════════

/** GET /agent/models?pageNum=&pageSize=&nameKeyword= → PageResult<AgentModelConfig> */
export async function pageModels(
  page: PageQuery,
  nameKeyword?: string,
): Promise<PageResult<AgentModelConfig>> {
  const raw = await request<BackendPageResult<AgentModelConfig>>({
    method: 'GET',
    url: '/agent/models',
    params: {
      ...page,
      ...(nameKeyword && nameKeyword.trim() ? { nameKeyword: nameKeyword.trim() } : {}),
    },
  })
  return adaptPage(raw)
}

/** GET /agent/models/{id} → 模型配置详情（含 apiKeyMasked 脱敏展示值） */
export async function getModel(id: number): Promise<AgentModelConfig> {
  return request<AgentModelConfig>({
    method: 'GET',
    url: `/agent/models/${id}`,
  })
}

/** POST /agent/models {req} → 新建（apiKey 非空时后端加密落库），返回新 id */
export async function createModel(req: AgentModelSaveReq): Promise<number> {
  return request<number>({
    method: 'POST',
    url: '/agent/models',
    data: req,
  })
}

/** PUT /agent/models/{id} {req} → 编辑（apiKey 为空/未传时后端保留旧密钥） */
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

/** POST /agent/models/{id}/test-connection → 连通性测试（业务码 code≠0 表示不可测，不视为网络失败） */
export async function testModelConnection(id: number): Promise<AgentModelTestConnectionResp> {
  return request<AgentModelTestConnectionResp>({
    method: 'POST',
    url: `/agent/models/${id}/test-connection`,
  })
}

// ═══════════════════════════════════════════════════════════════
// 只读下拉辅助（LLM/TOOL 节点属性面板数据源，非分页展示场景，一次性拉全量）
// ═══════════════════════════════════════════════════════════════

/** GET /agent/models?pageNum=&pageSize=1000 → 模型配置选项（仅取启用项） */
export async function listModelOptions(): Promise<AgentModelConfigOption[]> {
  const raw = await request<BackendPageResult<AgentModelConfigOption>>({
    method: 'GET',
    url: '/agent/models',
    params: { pageNum: 1, pageSize: 1000 },
  })
  return raw.records
    .filter((m) => m.enabled)
    .map((m) => ({
      id: m.id,
      name: m.name,
      modelName: m.modelName,
      protocolType: m.protocolType,
      enabled: m.enabled,
    }))
}

/** GET /agent/tool/internal + /agent/tool/external → 工具选项（合并，value=toolName 精确值） */
export async function listToolOptions(): Promise<AgentToolOption[]> {
  const [internalRaw, externalRaw] = await Promise.all([
    request<BackendPageResult<{ name: string; description?: string }>>({
      method: 'GET',
      url: '/agent/tool/internal',
      params: { pageNum: 1, pageSize: 1000 },
    }),
    request<BackendPageResult<{ name: string; description?: string }>>({
      method: 'GET',
      url: '/agent/tool/external',
      params: { pageNum: 1, pageSize: 1000 },
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

// ═══════════════════════════════════════════════════════════════
// agent 模块契约：字段与后端 DTO 严格对齐（M07-F02 Step9 现场核对）
//
// 对照后端（Smart-WorkFlow sw-basic-agent）：
//   AgentGraphDef       ← AgentGraphDefDTO（列表/发布响应，不含 graph_json 大字段）
//   GraphElement        ← dto/graph/GraphElement（config/style 为后端不透明 Map，
//                        前端只写、后端原样透传；坐标存 style.x/style.y 是前端裁定，
//                        不是后端契约，见 modules/agent/utils/graphAdapter.ts 顶部注释；
//                        LLM/TOOL 节点 config 键 agentModelConfigId/toolName/inputVar/
//                        outputVar 见 graphAdapter.ts 常量，留空 = 默认变量 input）
//   ProcessGraph        ← dto/graph/ProcessGraph
//   AgentGraphExecute*  ← AgentGraphExecuteReq/RespDTO（success=false 表示运行时失败）
//   AgentModelConfigDTO ← GET /agent/models 分页响应（LLM 节点下拉数据源）
//   AgentTool*ConfigDTO ← GET /agent/tool/{internal,external} 分页响应（TOOL 节点下拉）
// ═══════════════════════════════════════════════════════════════

/** 图定义（列表/发布响应 DTO，不含 graph_json 大字段）。 */
export interface AgentGraphDef {
  id: number
  /** 图业务 key（发布后冻结） */
  graphKey: string
  /** 图名称 */
  name: string
  /** 定义版本号（每次发布递增） */
  defVersion: number
  /** 状态：DRAFT / PUBLISHED */
  status: 'DRAFT' | 'PUBLISHED' | string
  /** 图级执行超时（秒，阶段 2） */
  executionTimeoutSeconds?: number
  createTime: string
  updateTime: string
}

/** 图发布版本快照（D022-06，不含 graph_json）。 */
export interface AgentGraphSnapshot {
  /** 发布版本号 */
  defVersion: number
  /** 发布时图业务 key */
  graphKey: string
  /** 发布时图名称 */
  name: string
  /** 发布时间 */
  createTime: string
}

/** 图元素 —— 节点或边（对齐后端 GraphElement）。 */
export interface GraphElement {
  /** 元素唯一标识（设计器分配） */
  id: string
  /** 元素种类："node" | "edge" */
  kind: 'node' | 'edge'
  /** 节点类型（START/END/LLM/TOOL/CONDITION/…），边为 null */
  type?: string
  /** 边起点节点 id（仅边使用） */
  source?: string
  /** 边终点节点 id（仅边使用） */
  target?: string
  /** 不透明配置（后端不解释，原样透传） */
  config?: Record<string, unknown>
  /** 不透明样式（画布样式，原样透传；坐标 x/y 存此处，前端裁定） */
  style?: Record<string, unknown>
}

/** 图定义模型（对齐后端 ProcessGraph，即 graph_json 的序列化格式）。 */
export interface ProcessGraph {
  graphKey: string
  name: string
  version: number
  elements: GraphElement[]
  /** 画布元数据（不透明，原样透传） */
  canvas: Record<string, unknown>
}

/** 创建图定义请求（仅名称；graphKey 与初始 START→END 图由服务端生成）。 */
export interface AgentGraphCreateReq {
  name: string
}

/** 图执行请求（Step8：单一 input 文本作为初始累积文本）。 */
export interface AgentGraphExecuteReq {
  input: string
}

/** 图执行响应（Step8：运行时失败以 success=false + errorMessage 表达，不上抛）；Step12追加 executionId。 */
export interface AgentGraphExecuteResp {
  success: boolean
  /** 最终输出文本（END 节点处的累积文本，成功时非空） */
  output?: string
  /** 失败原因摘要（不含明文 API Key） */
  errorMessage?: string
  /** 执行耗时（毫秒） */
  latencyMs: number
  /** 执行历史记录 id（Step12，成功/失败均返回，可用于直达详情页） */
  executionId?: number
}

/** 模型配置下拉选项（对齐 AgentModelConfigDTO 的只读展示字段）。 */
export interface AgentModelConfigOption {
  id: number
  name: string
  modelName: string
  /** 所属供应商 id/名称（阶段 2 LLM 节点两级选择） */
  providerId?: number | string
  providerName?: string
  /** 所属供应商 API 格式（F1 两级模型，替代旧 protocolType） */
  providerApiFormat?: string
  enabled: boolean
}

/**
 * 供应商契约（对齐后端 AgentProviderDTO，F1 D022-02 两级模型）。
 * 安全约束：只含 apiKeyMasked（后端脱敏串，未配置时为 null），
 * 不含密文也不含明文 Key——明文生命周期仅在当次提交请求内。
 */
export interface AgentProvider {
  id: number
  name: string
  /** API 格式三值契约：OPENAI_CHAT / OPENAI_RESPONSES / ANTHROPIC（后端白名单校验） */
  apiFormat: 'OPENAI_CHAT' | 'OPENAI_RESPONSES' | 'ANTHROPIC' | string
  baseUrl: string
  /** 后端脱敏展示值（只显示后端返回的脱敏串，前端不回显/缓存明文） */
  apiKeyMasked: string | null
  enabled: boolean
  remark: string | null
  createTime: string
  updateTime: string
}

/** 供应商新增/编辑请求（对齐后端 AgentProviderSaveReqDTO）。apiKey 明文仅存在于当次提交。 */
export interface AgentProviderSaveReq {
  name: string
  apiFormat: string
  baseUrl: string
  /** 明文仅存在于当次提交；空=保持旧密钥（编辑）/不配置（新增） */
  apiKey?: string
  enabled?: boolean
  remark?: string
}

/**
 * 模型契约（对齐后端 AgentModelDTO，挂在供应商下；密钥只在供应商侧）。
 */
export interface AgentModel {
  id: number
  providerId: number
  providerName: string | null
  providerApiFormat: string | null
  /** 供应商是否启用（阶段 2：供应商停用的模型在列表标注不可用，LLM 节点不可选） */
  providerEnabled?: boolean | null
  name: string
  modelName: string
  /** 能力标注：CHAT / EMBEDDING（含式匹配，后端 capability 过滤） */
  capabilities: string
  temperature: number | null
  maxTokens: number | null
  topP: number | null
  timeoutSeconds: number
  retryCount: number
  enabled: boolean
  /** 多Key轮询候选分组标识，null=独立配置不参与轮询 */
  groupKey: string | null
  /** 组内优先级，数值越小优先级越高 */
  sort: number
  /** 限流临时锁定至该时间点（系统运行态，只读，前端禁止写入） */
  lockedUntil: string | null
  /** 触发限流后的锁定冷却时长（秒） */
  quotaCooldownSeconds: number
  remark: string | null
  createTime: string
  updateTime: string
}

/** 模型新增/编辑请求（对齐后端 AgentModelSaveReqDTO；密钥在供应商侧，本请求不含 Key）。 */
export interface AgentModelSaveReq {
  providerId: number
  name: string
  modelName: string
  capabilities?: string
  temperature?: number | null
  maxTokens?: number | null
  topP?: number | null
  timeoutSeconds?: number
  retryCount?: number
  enabled?: boolean
  remark?: string
  /** 多Key轮询候选分组标识，null=独立配置不参与轮询 */
  groupKey?: string | null
  /** 组内优先级，数值越小优先级越高（DB 默认 0） */
  sort?: number
  /** 触发限流后的锁定冷却时长（秒，DB 默认 60） */
  quotaCooldownSeconds?: number
}

/** 连通性测试响应（对齐后端 AgentModelTestConnectionRespDTO）。 */
export interface AgentModelTestConnectionResp {
  /** 服务端可达（含 4xx 鉴权/路径问题）为 true，网络不可达为 false */
  success: boolean
  /** 结果说明（不含 API Key 明文） */
  message: string
  /** 探测耗时（毫秒） */
  latencyMs: number
}

/** 工具下拉选项（internal/external 合并展示，value 必须是后端 name 精确值）。 */
export interface AgentToolOption {
  /** 后端工具名（internal/external 两表 name 精确值，Step8 解释器按此精确匹配） */
  toolName: string
  description?: string
  /** 来源标注：internal / external */
  source: 'internal' | 'external'
}

// ═══════════════════════════════════════════════════════════════
// M07-F03-02: 工具管理相关契约（对齐 AgentToolInternalConfigDTO / AgentToolExternalConfigDTO）
// ═══════════════════════════════════════════════════════════════

/** 内部工具白名单配置（对齐后端 AgentToolInternalConfigDTO）。 */
export interface AgentToolInternalConfig {
  id: number
  /** 工具名（英文下划线），传给 LLM */
  name: string
  /** 工具描述，传给 LLM */
  description: string
  /** JSON Schema 字符串，描述入参结构（可为 null） */
  inputSchema: string | null
  /** Spring bean 名称（白名单值） */
  beanName: string
  /** 方法名（白名单值，约定签名 String execute(String params)） */
  methodName: string
  /** 启用状态 */
  enabled: boolean
  /** 备注 */
  remark: string | null
  createTime: string
  updateTime: string
}

/** 内部工具新增/编辑请求（对齐后端 AgentToolInternalConfigDTO，共用）。 */
export interface AgentToolInternalSaveReq {
  name: string
  description: string
  inputSchema?: string | null
  beanName: string
  methodName: string
  enabled?: boolean
  remark?: string | null
}

/** 外部 HTTP 工具白名单配置（对齐后端 AgentToolExternalConfigDTO）。 */
export interface AgentToolExternalConfig {
  id: number
  /** 工具名（英文下划线），传给 LLM */
  name: string
  /** 工具描述，传给 LLM */
  description: string
  /** JSON Schema 字符串，描述入参结构（可为 null） */
  inputSchema: string | null
  /** 白名单 URL（完整 URL，含路径） */
  url: string
  /** HTTP 方法：GET/POST/PUT（默认 POST） */
  httpMethod: string
  /** 副作用分类：QUERY=查询无外部写副作用，WRITE=有外部写副作用；null=未分类。 */
  effectScope: 'QUERY' | 'WRITE' | null
  /** 请求超时（秒），默认 30 */
  timeoutSeconds: number
  /** 启用状态 */
  enabled: boolean
  /** 备注 */
  remark: string | null
  createTime: string
  updateTime: string
}

/** 外部 HTTP 工具新增/编辑请求（对齐后端 AgentToolExternalConfigDTO，共用）。 */
export interface AgentToolExternalSaveReq {
  name: string
  description: string
  inputSchema?: string | null
  url: string
  httpMethod: string
  effectScope?: 'QUERY' | 'WRITE' | null
  timeoutSeconds?: number
  enabled?: boolean
  remark?: string | null
}

// ═══════════════════════════════════════════════════════════════
// 图执行历史相关契约（对齐 AgentGraphExecutionDTO、AgentGraphExecutionDetailDTO、AgentGraphExecutionNodeDTO）
// ═══════════════════════════════════════════════════════════════

/** 图执行记录（列表/摘要信息，对应 AgentGraphExecutionDTO） */
export interface AgentGraphExecution {
  /** 执行 ID（服务端生成） */
  id: number
  /** 所属图定义 ID */
  graphDefId: number
  /** 图业务 key（冗余字段，便于前端展示） */
  graphKey: string
  /** 图名称（冗余字段，便于前端展示） */
  graphName: string
  /** 执行时图定义版本快照（后端直返字段） */
  graphDefVersion: number
  /** 所属图定义的版本号（列表展示补充字段，由 pageGraphExecutionsWithVersion 关联查询） */
  defVersion: number
  /** 输入内容（初始累积文本，列表端点暂不返回） */
  input: string
  /** 执行状态：RUNNING / SUCCESS / FAILED */
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | string
  /** 输出结果摘要（成功时为最终输出，失败时为错误摘要；长文本后端可能截断） */
  outputSummary: string
  /** 错误分类标识（失败时，如 MODEL_CALL_FAILED、STEP_TIMEOUT 等） */
  errorCategory?: string
  /** 失败原因摘要（不含明文 API Key，列表展示有用） */
  errorMessage?: string
  /** 是否成功（便捷字段，等价于 status='SUCCESS'） */
  success: boolean
  /** 执行耗时（毫秒） */
  latencyMs: number
  /** M07-F04-02: 本次图执行全部 LLM 节点输入 Token 汇总（未知时为 null） */
  inputTokens?: number | null
  /** M07-F04-02: 本次图执行全部 LLM 节点输出 Token 汇总（未知时为 null） */
  outputTokens?: number | null
  /** 创建时间 */
  createTime: string
}

/** 图执行详情（完整信息，对应 AgentGraphExecutionDetailDTO） */
export interface AgentGraphExecutionDetail {
  /** 执行 ID（服务端生成） */
  id: number
  /** 所属图定义 ID */
  graphDefId: number
  /** 图业务 key */
  graphKey: string
  /** 图名称 */
  graphName: string
  /** 所属图定义的版本号（扩展字段） */
  defVersion: number
  /** 执行时绑定的发布快照版本（D022-06） */
  graphDefVersion?: number
  /** 输入内容（初始累积文本，完整文本） */
  input: string
  /** 执行状态：RUNNING / SUCCESS / FAILED */
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | string
  /** 完整输出内容（END 节点处的累积文本或错误详情） */
  output: string
  /** 是否成功 */
  success: boolean
  /** 执行耗时（毫秒） */
  latencyMs: number
  /** 详细错误信息（失败时含具体步骤和原因，不含明文 API Key） */
  errorMessage?: string
  /** 错误分类标识（失败时） */
  errorCategory?: string
  /** 根节点追踪 ID（用于链路追踪） */
  traceId?: string
  /** M07-F04-02: 本次图执行全部 LLM 节点输入 Token 汇总（未知时为 null） */
  inputTokens?: number | null
  /** M07-F04-02: 本次图执行全部 LLM 节点输出 Token 汇总（未知时为 null） */
  outputTokens?: number | null
  /** 创建时间 */
  createTime: string
  /** 更新时间 */
  updateTime?: string
  /** 各节点执行详情列表（按 nodeSeq 排序） */
  nodeDetails: AgentGraphExecutionNode[]
}

/** 图执行节点详情（对应 AgentGraphExecutionNodeDTO） */
export interface AgentGraphExecutionNode {
  /** 节点序列号（全局唯一，用于表示执行顺序） */
  nodeSeq: number
  /** 并行分支标识 ("0"/"0-1"/...)" */
  branchId?: string
  /** 节点 ID（设计器分配的节点唯一标识） */
  nodeId: string
  /** 节点类型（START/END/LLM/TOOL/CONDITION/…） */
  nodeType: string
  /** 节点名称（用户自定义） */
  nodeName: string
  /** 执行状态：PENDING / RUNNING / SUCCESS / FAILED */
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | string
  /** 输入变量值（该节点接收的输入） */
  input?: string
  /** 输出结果（该节点的输出文本） */
  output?: string
  /** 是否成功 */
  success: boolean
  /** 节点级耗时（毫秒） */
  nodeLatencyMs: number
  /** M07-F04-02: 该节点 LLM 调用的输入 Token（非 LLM 节点或供应商未返回时为 null） */
  inputTokens?: number | null
  /** M07-F04-02: 该节点 LLM 调用的输出 Token（非 LLM 节点或供应商未返回时为 null） */
  outputTokens?: number | null
  /** 阶段 2：该节点内工具调用轨迹（JSON 数组字符串：tool/arguments/result） */
  toolCalls?: string | null
  /** 开始时间 */
  startTime?: string
  /** 结束时间 */
  endTime?: string
  /** 详细错误信息（失败时） */
  errorMessage?: string
  /** 构建时间（用于确定父子关系，相同 buildTime 的节点属于同一时刻并行分支） */
  buildTime: string
}

// ═══════════════════════════════════════════════════════════════
// M07-F04-02: 会话历史相关契约（对齐 AgentConversationDTO、AgentConversationMessageDTO）
// ═══════════════════════════════════════════════════════════════

/** 会话列表项（对应 AgentConversationDTO） */
export interface AgentConversation {
  /** 会话 id */
  id: number
  /** 大模型接入配置 id */
  agentModelConfigId: number
  /** 会话标题（自动生成留后续迭代，当前为 null） */
  title?: string
  /** 会话状态（ACTIVE） */
  status: string
  /** 创建时间 */
  createTime: string
}

/** 会话消息项（对应 AgentConversationMessageDTO） */
export interface AgentConversationMessage {
  /** 消息 id */
  id: number
  /** 消息角色：USER / ASSISTANT */
  role: 'USER' | 'ASSISTANT' | string
  /** 消息内容 */
  content: string
  /** 会话内顺序号（0-based） */
  msgOrder: number
  /** M07-F04-02: 供应商返回的输入 Token 数（未知时为 null，不为 0） */
  inputTokens?: number | null
  /** M07-F04-02: 供应商返回的输出 Token 数（未知时为 null，不为 0） */
  outputTokens?: number | null
  /** 创建时间 */
  createTime: string
}

// === Agent Graph Debug Session (M07-F02-04 step debugging) ===
export interface AgentGraphDebugSession {
  id: number
  graphDefId: number
  graphDefVersion: number
  status: 'PAUSED' | 'COMPLETED' | 'FAILED' | 'STOPPED' | 'EXPIRED' | string
  input: string
  breakpoints: string[]
  variables: Record<string, string>
  traceCount: number
  nextNodeId: string | null
  nextBranchId: string | null
  resultText?: string | null
  errorCategory?: string | null
  errorMessage?: string | null
  latencyMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  expiresAt: string
  createTime: string
  updateTime: string
  version: number
}

export interface AgentGraphDebugNode {
  id: number
  debugSessionId: number
  nodeSeq: number
  branchId: string
  nodeId: string
  nodeType: string
  nodeLatencyMs: number
  variableSnapshot: string | null // JSON string Map<string,string>
  inputTokens?: number | null
  outputTokens?: number | null
}
export interface AgentGraphDebugCreateReq {
  graphDefId: number
  input: string
}
export interface AgentGraphBreakpointsReq {
  breakpoints: string[]
}

// ═══════════════════════════════════════════════════════════════
// F1 阶段 3：知识库 / RAG
// ═══════════════════════════════════════════════════════════════

/** 知识库（绑定一个 EMBEDDING 模型与切分参数） */
export interface KnowledgeBase {
  id: number | string
  name: string
  description?: string | null
  embeddingModelId: number | string
  chunkSize: number
  chunkOverlap: number
  createTime?: string
}

export interface KnowledgeBaseCreateReq {
  name: string
  description?: string
  embeddingModelId: number | string
  chunkSize: number
  chunkOverlap: number
}

/** 知识库文档（处理状态与分片数） */
export interface KnowledgeDocument {
  id: number | string
  kbId: number | string
  name: string
  fileName?: string | null
  fileType?: string | null
  fileSize?: number | null
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | string
  errorMessage?: string | null
  chunkCount: number
  createTime?: string
}

/** 检索命中分片 */
export interface KnowledgeHit {
  chunkId: number
  documentId: number
  documentName?: string | null
  chunkIndex: number
  content: string
  similarity: number
}

export interface KnowledgeRetrievalReq {
  query: string
  topK?: number
  similarityThreshold?: number
}

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
  createTime: string
  updateTime: string
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

/** 图执行响应（Step8：运行时失败以 success=false + errorMessage 表达，不上抛）。 */
export interface AgentGraphExecuteResp {
  success: boolean
  /** 最终输出文本（END 节点处的累积文本，成功时非空） */
  output?: string
  /** 失败原因摘要（不含明文 API Key） */
  errorMessage?: string
  /** 执行耗时（毫秒） */
  latencyMs: number
}

/** 模型配置下拉选项（对齐 AgentModelConfigDTO 的只读展示字段）。 */
export interface AgentModelConfigOption {
  id: number
  name: string
  modelName: string
  protocolType: string
  enabled: boolean
}

/**
 * 大模型接入配置完整契约（对齐后端 AgentModelConfigDTO，M07-Step1/Step5 字段全量）。
 * 安全约束：只含 apiKeyMasked（后端脱敏串，未配置时为 null），
 * 不含 apiKeyCipher（密文）也不含明文 Key——明文生命周期仅在当次提交请求内。
 */
export interface AgentModelConfig {
  id: number
  name: string
  /** varchar 契约，前端不自创枚举（openai / ollama / other 由后端白名单校验） */
  protocolType: 'openai' | 'ollama' | 'other' | string
  baseUrl: string
  modelName: string
  /** 后端脱敏展示值（只显示后端返回的脱敏串，前端不回显/缓存明文） */
  apiKeyMasked: string | null
  temperature: number | null
  maxTokens: number | null
  topP: number | null
  timeoutSeconds: number
  retryCount: number
  enabled: boolean
  remark: string | null
  /** 多Key轮询候选分组标识，null=独立配置不参与轮询 */
  groupKey: string | null
  /** 组内优先级，数值越小优先级越高 */
  sort: number
  /** 限流临时锁定至该时间点（系统运行态，只读，前端禁止写入） */
  lockedUntil: string | null
  /** 触发限流后的锁定冷却时长（秒） */
  quotaCooldownSeconds: number
  createTime: string
  updateTime: string
}

/**
 * 大模型接入配置新增/编辑请求（对齐后端 AgentModelSaveReqDTO）。
 * apiKey 为明文，仅存在于当次提交：非空时后端加密落库；
 * 为空/未传时 create 场景存 null、update 场景保留旧密钥。
 */
export interface AgentModelSaveReq {
  name: string
  protocolType: string
  baseUrl: string
  modelName: string
  /** 明文仅存在于当次提交；空=保持旧密钥（编辑）/不配置（新增） */
  apiKey?: string
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

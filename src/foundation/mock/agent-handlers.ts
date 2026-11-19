/**
 * Agent mock：模型/供应商、工具、图谱定义/执行/调试会话、对话。
 * 从 handlers.ts 按域拆出（行为零变化，域内保持原相对顺序）。
 */
import type {
  AgentModel,
  AgentModelSaveReq,
  AgentProvider,
  AgentProviderSaveReq,
} from '@/contracts/agent'
import { buildMockPermissions } from './mock-shared'
import {
  MOCK_AGENT_GRAPH_EXECUTIONS,
  MOCK_AGENT_MODELS,
  MOCK_AGENT_PROVIDERS,
  MOCK_CONVERSATIONS,
  MOCK_CONVERSATION_MESSAGES,
  MOCK_CURRENT_SESSION,
  MOCK_DEBUG_NODES,
  MOCK_DEBUG_SESSIONS,
  MOCK_EXTERNAL_TOOLS,
  MOCK_GRAPH_DEFS,
  MOCK_INTERNAL_TOOLS,
} from './seeds'
import type {
  MockDebugSession,
  MockGraphDefEntry,
  MockToolExternalEntry,
  MockToolInternalEntry,
} from './seeds'
import type { MockRegistration } from './mock-shared'

export // ─── 模型 handler 内部辅助（与真实后端语义对齐） ─────────────────

/**
 * 生成脱敏展示串（对齐后端 AesGcmCipher.mask：前 2 + **** + 后 2）。
 * mock 内部同样不存明文：仅当次提交入参短暂存在，落库/响应只产出脱敏值。
 */
function maskApiKey(raw: string): string {
  const key = raw.trim()
  if (key.length <= 4) return '****'
  return `${key.slice(0, 2)}****${key.slice(-2)}`
}

export function findModel(id: number): AgentModel | undefined {
  return MOCK_AGENT_MODELS.find((m) => m.id === id)
}

export function findProvider(id: number): AgentProvider | undefined {
  return MOCK_AGENT_PROVIDERS.find((p) => p.id === id)
}

export function nextProviderId(): number {
  return MOCK_AGENT_PROVIDERS.reduce((max, p) => Math.max(max, p.id), 0) + 1
}

export /** 模型出参统一补供应商名称/格式（后端 toDTO 同语义） */
function modelWithProvider(m: AgentModel): AgentModel {
  const provider = findProvider(m.providerId)
  return {
    ...m,
    providerName: provider?.name ?? null,
    providerApiFormat: provider?.apiFormat ?? null,
  }
}

export /** 取 MOCK_AGENT_MODELS 中已出现的最大 id，用于创建时分配新 id。 */
function nextModelId(): number {
  return MOCK_AGENT_MODELS.reduce((max, m) => Math.max(max, m.id), 0) + 1
}

export // ─── 图执行 Mock 辅助（极简解释执行：仅支持 START→LLM→END 单链） ──

interface ExecuteGraphResult {
  success: boolean
  output?: string
  errorMessage?: string
  latencyMs: number
}

export /**
 * 极简图执行器：只处理 START → LLM → END 单链（不实现 LOOP/FORK/JOIN/CONDITION）。
 * 对 LLM 节点解释 systemPrompt / userPromptTemplate 语义：
 *   - userPromptTemplate 空/缺失 → 默认回退：使用 inputVar（默认 "input"）值作为用户消息
 *   - userPromptTemplate 存在 → 一次性插值 {{var}}，变量未定义 → 返回失败
 *   - 使用函数式 replace 避免 $ 特殊字符被二次解释
 * Mock 不调真实 LLM，直接返回插值后的文本作为输出。
 */
function executeGraphMock(graphDef: MockGraphDefEntry, input: string): ExecuteGraphResult {
  const elements = graphDef.graphJson.elements
  const nodes = elements.filter((e) => e.kind === 'node')
  const edges = elements.filter((e) => e.kind === 'edge')

  const startNode = nodes.find((n) => n.type === 'START')
  if (!startNode) return { success: false, errorMessage: '无 START 节点', latencyMs: 5 }

  let currentId: string | undefined = startNode.id
  const variables: Record<string, string> = { input }
  let finalOutput = input
  let latencyMs = 0

  while (currentId) {
    const node = nodes.find((n) => n.id === currentId)
    if (!node) {
      return {
        success: false,
        errorMessage: `节点 ${currentId} 不存在`,
        latencyMs: latencyMs + 5,
      }
    }

    if (node.type === 'LLM') {
      const cfg = node.config ?? {}
      const userPromptTemplate =
        typeof cfg.userPromptTemplate === 'string' ? cfg.userPromptTemplate : null

      let userText: string
      if (!userPromptTemplate || !userPromptTemplate.trim()) {
        // 默认回退：使用 inputVar 值（默认 "input"）
        const inputVar =
          typeof cfg.inputVar === 'string' && cfg.inputVar.trim() ? cfg.inputVar : 'input'
        userText = variables[inputVar] ?? ''
      } else {
        // 插值：变量未定义 → 立即失败
        const placeholderRe = /\{\{([A-Za-z_][A-Za-z0-9_]*)}}/g
        let failed = false
        let errorMessage = ''
        userText = userPromptTemplate.replace(placeholderRe, (_match, varName: string) => {
          if (!(varName in variables)) {
            failed = true
            errorMessage = `引用了未定义的变量: ${varName}（节点 ${node.id}）`
            return _match
          }
          return variables[varName]
        })
        if (failed) {
          return { success: false, errorMessage, latencyMs: latencyMs + 5 }
        }
      }

      finalOutput = userText
      const outputVar =
        typeof cfg.outputVar === 'string' && cfg.outputVar.trim() ? cfg.outputVar : 'input'
      variables[outputVar] = finalOutput
      latencyMs += 100
    } else if (node.type === 'END') {
      const cfg = node.config ?? {}
      const inputVar =
        typeof cfg.inputVar === 'string' && cfg.inputVar.trim() ? cfg.inputVar : 'input'
      finalOutput = variables[inputVar] ?? ''
      break
    } else if (node.type === 'START') {
      // 继续到下一节点
    } else {
      return {
        success: false,
        errorMessage: `Mock 不支持节点类型: ${node.type}`,
        latencyMs: latencyMs + 5,
      }
    }

    const nextEdge = edges.find((e) => e.source === currentId)
    currentId = nextEdge?.target
  }

  return { success: true, output: finalOutput, latencyMs }
}

export const agentMockRegistrations: MockRegistration[] = [
  // GET /api/agent/providers?pageNum=&pageSize=&nameKeyword= — 分页（密钥脱敏）
  {
    method: 'GET',
    pattern: '/api/agent/providers',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const keyword = String(query.nameKeyword ?? '').trim()
      const filtered = keyword
        ? MOCK_AGENT_PROVIDERS.filter((p) => p.name.includes(keyword))
        : MOCK_AGENT_PROVIDERS
      const total = filtered.length
      const start = (pageNum - 1) * pageSize
      return {
        code: 0,
        message: 'ok',
        data: { records: filtered.slice(start, start + pageSize), total, pageNum, pageSize },
      }
    },
  },
  // GET /api/agent/providers/enabled — 启用中的供应商（模型编辑下拉）
  {
    method: 'GET',
    pattern: '/api/agent/providers/enabled',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: MOCK_AGENT_PROVIDERS.filter((p) => p.enabled),
    }),
  },
  // GET /api/agent/providers/:id — 详情（不存在返回 404 业务码）
  {
    method: 'GET',
    pattern: '/api/agent/providers/:id',
    handler: (params) => {
      const provider = findProvider(Number((params as Record<string, string>).id))
      if (!provider) return { code: 404, message: '供应商不存在', data: null }
      return { code: 0, message: 'ok', data: { ...provider } }
    },
  },
  // POST /api/agent/providers — 创建（apiKey 非空才生成脱敏值；空=未配置密钥）
  {
    method: 'POST',
    pattern: '/api/agent/providers',
    handler: (_params, _query, body) => {
      const req = (body ?? {}) as Partial<AgentProviderSaveReq>
      const format = String(req.apiFormat ?? '')
      if (!['OPENAI_CHAT', 'OPENAI_RESPONSES', 'ANTHROPIC'].includes(format)) {
        return { code: 400, message: '不支持的 API 格式: ' + format, data: null }
      }
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const id = nextProviderId()
      const newProvider: AgentProvider = {
        id,
        name: String(req.name ?? ''),
        apiFormat: format,
        baseUrl: String(req.baseUrl ?? ''),
        apiKeyMasked: req.apiKey && req.apiKey.trim() ? maskApiKey(req.apiKey) : null,
        enabled: req.enabled ?? true,
        remark: req.remark !== undefined && req.remark !== null ? String(req.remark) : null,
        createTime: now,
        updateTime: now,
      }
      MOCK_AGENT_PROVIDERS.push(newProvider)
      return { code: 0, message: 'ok', data: id }
    },
  },
  // PUT /api/agent/providers/:id — 更新（apiKey 空=保留旧密钥；mock 密文侧只保留脱敏值）
  {
    method: 'PUT',
    pattern: '/api/agent/providers/:id',
    handler: (params, _query, body) => {
      const id = Number((params as Record<string, string>).id)
      const provider = findProvider(id)
      if (!provider) return { code: 404, message: '供应商不存在', data: null }
      const req = (body ?? {}) as Partial<AgentProviderSaveReq>
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const apiKeyRaw = req.apiKey
      const hasNewKey = apiKeyRaw !== undefined && apiKeyRaw !== null && apiKeyRaw.trim() !== ''
      const apiKeyMasked = hasNewKey ? maskApiKey(apiKeyRaw) : provider.apiKeyMasked
      const idx = MOCK_AGENT_PROVIDERS.findIndex((p) => p.id === id)
      MOCK_AGENT_PROVIDERS[idx] = {
        ...provider,
        name: req.name !== undefined ? String(req.name) : provider.name,
        apiFormat: req.apiFormat !== undefined ? String(req.apiFormat) : provider.apiFormat,
        baseUrl: req.baseUrl !== undefined ? String(req.baseUrl) : provider.baseUrl,
        apiKeyMasked,
        enabled: req.enabled !== undefined ? Boolean(req.enabled) : provider.enabled,
        remark:
          req.remark !== undefined
            ? req.remark === null
              ? null
              : String(req.remark)
            : provider.remark,
        updateTime: now,
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  // DELETE /api/agent/providers/:id — 删除（幂等）
  {
    method: 'DELETE',
    pattern: '/api/agent/providers/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_AGENT_PROVIDERS.findIndex((p) => p.id === id)
      if (idx !== -1) MOCK_AGENT_PROVIDERS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // GET /api/agent/models?pageNum=&pageSize=&providerId=&nameKeyword= — 分页
  {
    method: 'GET',
    pattern: '/api/agent/models',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const keyword = String(query.nameKeyword ?? '').trim()
      const providerId = query.providerId ? Number(query.providerId) : null
      let filtered = [...MOCK_AGENT_MODELS]
      if (keyword) filtered = filtered.filter((m) => m.name.includes(keyword))
      if (providerId) filtered = filtered.filter((m) => m.providerId === providerId)
      const total = filtered.length
      const start = (pageNum - 1) * pageSize
      const records = filtered.slice(start, start + pageSize).map(modelWithProvider)
      return {
        code: 0,
        message: 'ok',
        data: { records, total, pageNum, pageSize },
      }
    },
  },
  // GET /api/agent/models/enabled?capability= — 启用中的模型（设计器 LLM 节点下拉）
  {
    method: 'GET',
    pattern: '/api/agent/models/enabled',
    handler: (_params, query) => {
      const capability = String(query.capability ?? '').trim()
      const list = MOCK_AGENT_MODELS.filter(
        (m) => m.enabled && (!capability || m.capabilities.includes(capability)),
      ).map(modelWithProvider)
      return { code: 0, message: 'ok', data: list }
    },
  },
  // GET /api/agent/models/:id — 详情
  {
    method: 'GET',
    pattern: '/api/agent/models/:id',
    handler: (params) => {
      const model = findModel(Number((params as Record<string, string>).id))
      if (!model) return { code: 404, message: '模型不存在', data: null }
      return { code: 0, message: 'ok', data: modelWithProvider(model) }
    },
  },
  // POST /api/agent/models — 创建（密钥在供应商侧，本请求不含 Key）
  {
    method: 'POST',
    pattern: '/api/agent/models',
    handler: (_params, _query, body) => {
      const req = (body ?? {}) as Partial<AgentModelSaveReq>
      const provider = req.providerId ? findProvider(Number(req.providerId)) : undefined
      if (!provider) return { code: 404, message: '供应商不存在', data: null }
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const id = nextModelId()
      const newModel: AgentModel = {
        id,
        providerId: provider.id,
        providerName: provider.name,
        providerApiFormat: provider.apiFormat,
        name: String(req.name ?? ''),
        modelName: String(req.modelName ?? ''),
        capabilities: req.capabilities ? String(req.capabilities) : 'CHAT',
        temperature:
          req.temperature === undefined || req.temperature === null
            ? null
            : Number(req.temperature),
        maxTokens:
          req.maxTokens === undefined || req.maxTokens === null ? null : Number(req.maxTokens),
        topP: req.topP === undefined || req.topP === null ? null : Number(req.topP),
        timeoutSeconds:
          req.timeoutSeconds === undefined || req.timeoutSeconds === null
            ? 30
            : Number(req.timeoutSeconds),
        retryCount:
          req.retryCount === undefined || req.retryCount === null ? 0 : Number(req.retryCount),
        enabled: req.enabled ?? true,
        remark: req.remark !== undefined && req.remark !== null ? String(req.remark) : null,
        groupKey:
          req.groupKey !== undefined && req.groupKey !== null && String(req.groupKey).trim() !== ''
            ? String(req.groupKey)
            : null,
        sort: req.sort === undefined || req.sort === null ? 0 : Number(req.sort),
        lockedUntil: null,
        quotaCooldownSeconds:
          req.quotaCooldownSeconds === undefined || req.quotaCooldownSeconds === null
            ? 60
            : Number(req.quotaCooldownSeconds),
        createTime: now,
        updateTime: now,
      }
      MOCK_AGENT_MODELS.push(newModel)
      return { code: 0, message: 'ok', data: id }
    },
  },
  // PUT /api/agent/models/:id — 更新（lockedUntil 运行态不可写，保持原值）
  {
    method: 'PUT',
    pattern: '/api/agent/models/:id',
    handler: (params, _query, body) => {
      const id = Number((params as Record<string, string>).id)
      const model = findModel(id)
      if (!model) return { code: 404, message: '模型不存在', data: null }
      const req = (body ?? {}) as Partial<AgentModelSaveReq>
      if (req.providerId !== undefined) {
        const provider = findProvider(Number(req.providerId))
        if (!provider) return { code: 404, message: '供应商不存在', data: null }
      }
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const idx = MOCK_AGENT_MODELS.findIndex((m) => m.id === id)
      const merged: AgentModel = {
        ...model,
        providerId: req.providerId !== undefined ? Number(req.providerId) : model.providerId,
        name: req.name !== undefined ? String(req.name) : model.name,
        modelName: req.modelName !== undefined ? String(req.modelName) : model.modelName,
        capabilities:
          req.capabilities !== undefined ? String(req.capabilities) : model.capabilities,
        temperature:
          req.temperature === undefined
            ? model.temperature
            : req.temperature === null
              ? null
              : Number(req.temperature),
        maxTokens:
          req.maxTokens === undefined
            ? model.maxTokens
            : req.maxTokens === null
              ? null
              : Number(req.maxTokens),
        topP: req.topP === undefined ? model.topP : req.topP === null ? null : Number(req.topP),
        timeoutSeconds:
          req.timeoutSeconds === undefined || req.timeoutSeconds === null
            ? model.timeoutSeconds
            : Number(req.timeoutSeconds),
        retryCount:
          req.retryCount === undefined || req.retryCount === null
            ? model.retryCount
            : Number(req.retryCount),
        enabled: req.enabled !== undefined ? Boolean(req.enabled) : model.enabled,
        remark:
          req.remark !== undefined
            ? req.remark === null
              ? null
              : String(req.remark)
            : model.remark,
        groupKey:
          req.groupKey === undefined
            ? model.groupKey
            : req.groupKey === null || String(req.groupKey).trim() === ''
              ? null
              : String(req.groupKey),
        sort: req.sort === undefined || req.sort === null ? model.sort : Number(req.sort),
        quotaCooldownSeconds:
          req.quotaCooldownSeconds === undefined || req.quotaCooldownSeconds === null
            ? model.quotaCooldownSeconds
            : Number(req.quotaCooldownSeconds),
        updateTime: now,
      }
      MOCK_AGENT_MODELS[idx] = modelWithProvider(merged)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // DELETE /api/agent/models/:id — 删除（幂等）
  {
    method: 'DELETE',
    pattern: '/api/agent/models/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_AGENT_MODELS.findIndex((m) => m.id === id)
      if (idx !== -1) MOCK_AGENT_MODELS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // POST /api/agent/models/:id/test-connection — 连通性测试
  // 语义对齐后端 F1 AgentModelManageServiceImpl.testConnection：真实最小调用
  // （chat "ping" + maxOutputTokens=1），成功才 success=true；mock 恒成功。
  // 不读取 enabled/lockedUntil；「配置不存在」以业务码 404 表达。
  {
    method: 'POST',
    pattern: '/api/agent/models/:id/test-connection',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const model = findModel(id)
      if (!model) return { code: 404, message: '模型不存在，无法发起连通性测试', data: null }
      return {
        code: 0,
        message: 'ok',
        data: {
          success: true,
          message: '模型调用成功',
          latencyMs: 120 + (id % 5) * 30,
        },
      }
    },
  },
  // GET /api/agent/graph-executions?pageNum=&pageSize=&graphDefId= — 分页列表（D164 标准8/9：401/403 + 逻辑删除过滤）
  {
    method: 'GET',
    pattern: '/api/agent/graph-executions',
    handler: (_params, query) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const legacyPerms = buildMockPermissions()
      if (!MOCK_CURRENT_SESSION.superAdmin && !legacyPerms.includes('agent:model:view'))
        return { code: 403, message: '无权限访问执行历史', data: null }
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      // 逻辑删除过滤：mock 种子中 deleted=1 的记录对用户不可见（与后端 @TableLogic 一致）
      let records = [...MOCK_AGENT_GRAPH_EXECUTIONS].filter(
        (e) => (e as unknown as Record<string, unknown>).deleted !== 1,
      )
      if (query.graphDefId) {
        const gdid = Number(query.graphDefId)
        records = records.filter((e) => e.graphDefId === gdid)
      }
      const total = records.length
      const start = (pageNum - 1) * pageSize
      const paginated = records.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records: paginated, total, pageNum, pageSize } }
    },
  },
  // GET /api/agent/graph-executions/:id — 详情（不存在/逻辑删除 → 404；401/403）
  {
    method: 'GET',
    pattern: '/api/agent/graph-executions/:id',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const legacyPerms2 = buildMockPermissions()
      if (!MOCK_CURRENT_SESSION.superAdmin && !legacyPerms2.includes('agent:model:view'))
        return { code: 403, message: '无权限访问执行历史', data: null }
      const id = Number((params as Record<string, string>).id)
      const exec = MOCK_AGENT_GRAPH_EXECUTIONS.find((e) => e.id === id)
      if (!exec || (exec as unknown as Record<string, unknown>).deleted === 1)
        return { code: 404, message: '执行记录不存在或跨租户', data: null }
      return {
        code: 0,
        message: 'ok',
        data: { ...exec, nodeDetails: [...(exec.nodeDetails ?? [])] },
      }
    },
  },
  // GET /api/agent/graph-executions/:id/nodes — 节点轨迹（按 nodeSeq 升序；401/403；逻辑删除 404）
  {
    method: 'GET',
    pattern: '/api/agent/graph-executions/:id/nodes',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const legacyPerms3 = buildMockPermissions()
      if (!MOCK_CURRENT_SESSION.superAdmin && !legacyPerms3.includes('agent:model:view'))
        return { code: 403, message: '无权限访问执行历史', data: null }
      const id = Number((params as Record<string, string>).id)
      const exec = MOCK_AGENT_GRAPH_EXECUTIONS.find((e) => e.id === id)
      if (!exec || (exec as unknown as Record<string, unknown>).deleted === 1)
        return { code: 404, message: '执行记录不存在', data: null }
      const nodes = exec.nodeDetails ?? []
      const sorted = [...nodes].sort((a, b) => (a.nodeSeq ?? 0) - (b.nodeSeq ?? 0))
      return { code: 0, message: 'ok', data: sorted }
    },
  },
  // GET /api/agent/conversations?agentModelConfigId= — 会话列表（当前用户；D164 标准9：401/403 语义）
  {
    method: 'GET',
    pattern: '/api/agent/conversations',
    handler: (_params, query) => {
      // 401: 未登录（mock 会话为空视为未认证），403: 无 agent 查看权限（与真实后端 Agent 权限一致）
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const perms: string[] =
        ((MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).permissions as string[]) ?? []
      const isSuperAdmin = (MOCK_CURRENT_SESSION as unknown as Record<string, unknown>)
        .superAdmin as boolean
      if (
        !isSuperAdmin &&
        !perms.includes('agent:model:view') &&
        !perms.includes('agent:conversation:view')
      ) {
        // 兼容既有权限码：agent:model:view（图执行历史沿用）与 agent:conversation:view（会话历史）
        // 若均无则 403
        const legacyPerms = buildMockPermissions()
        if (!legacyPerms.includes('agent:model:view'))
          return { code: 403, message: '无权限访问会话历史', data: null }
      }
      let records = [...MOCK_CONVERSATIONS]
      if (query.agentModelConfigId) {
        const cid = Number(query.agentModelConfigId)
        records = records.filter((c) => c.agentModelConfigId === cid)
      }
      return { code: 0, message: 'ok', data: records }
    },
  },
  // GET /api/agent/conversations/:id/messages — 会话消息（msg_order 升序；不存在 → 404；D164 标准9：401/403）
  {
    method: 'GET',
    pattern: '/api/agent/conversations/:id/messages',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const isSuperAdmin2 = (MOCK_CURRENT_SESSION as unknown as Record<string, unknown>)
        .superAdmin as boolean
      if (!isSuperAdmin2) {
        const legacyPerms = buildMockPermissions()
        if (!legacyPerms.includes('agent:model:view'))
          return { code: 403, message: '无权限访问会话历史', data: null }
      }
      const id = Number((params as Record<string, string>).id)
      const messages = MOCK_CONVERSATION_MESSAGES[id]
      if (!messages) return { code: 404, message: '会话不存在', data: null }
      return { code: 0, message: 'ok', data: [...messages] }
    },
  },
  // GET /api/agent/knowledge-bases — 知识库分页（设计器 KNOWLEDGE 面板下拉；mock 演示空列表）
  {
    method: 'GET',
    pattern: '/api/agent/knowledge-bases',
    handler: (_params, query) => ({
      code: 0,
      message: 'ok',
      data: {
        records: [],
        total: 0,
        pageNum: Number(query.pageNum ?? 1),
        pageSize: Number(query.pageSize ?? 100),
      },
    }),
  },
  // GET /api/agent/graph-defs/:id — 图详情（设计器回显：返回 ProcessGraph + 元数据）
  // 找不到 → code=404。响应同时包含 id/name/defVersion（供图执行历史关联版本号使用）。
  {
    method: 'GET',
    pattern: '/api/agent/graph-defs/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const def = MOCK_GRAPH_DEFS.find((d) => d.id === id)
      if (!def) return { code: 404, message: '图定义不存在', data: null }
      // 返回 ProcessGraph 结构 + 元数据（id/name/defVersion）
      return {
        code: 0,
        message: 'ok',
        data: {
          ...def.graphJson,
          id: def.id,
          defVersion: def.defVersion,
          status: def.status,
        },
      }
    },
  },
  // PUT /api/agent/graph-defs/:id/graph — 保存草稿（全量覆盖 elements）
  // 内存中更新 MOCK_GRAPH_DEFS，不持久化。
  {
    method: 'PUT',
    pattern: '/api/agent/graph-defs/:id/graph',
    handler: (params, _query, body) => {
      const id = Number((params as Record<string, string>).id)
      const def = MOCK_GRAPH_DEFS.find((d) => d.id === id)
      if (!def) return { code: 404, message: '图定义不存在', data: null }
      const req = body as { elements?: unknown[] } | null
      if (req?.elements) {
        def.graphJson.elements = req.elements as typeof def.graphJson.elements
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  // POST /api/agent/graph-defs/:id/execute — 执行已发布图
  // 极简解释执行（START→LLM→END），演示 prompt 配置语义：
  //   - 无 userPromptTemplate → 默认回退 input 穿透
  //   - 有 userPromptTemplate → 一次性插值 {{var}}，变量未定义 → success=false
  // 响应字段严格对齐 AgentGraphExecuteResp 契约（success/output/errorMessage/latencyMs/executionId）
  {
    method: 'POST',
    pattern: '/api/agent/graph-defs/:id/execute',
    handler: (params, _query, body) => {
      const id = Number((params as Record<string, string>).id)
      const def = MOCK_GRAPH_DEFS.find((d) => d.id === id)
      if (!def) return { code: 404, message: '图定义不存在', data: null }
      const req = body as { input?: string } | null
      const input = req?.input ?? ''
      const result = executeGraphMock(def, input)
      return {
        code: 0,
        message: 'ok',
        data: {
          ...result,
          executionId: Date.now(),
        },
      }
    },
  },
  // POST /api/agent/graph-debug-sessions — 创建调试会话
  // 入参 {graphDefId,input}; 要求已登录 + manage 权限；仅 PUBLISHED 可调试
  {
    method: 'POST',
    pattern: '/api/agent/graph-debug-sessions',
    handler: (_params, _query, body) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const canManage =
        MOCK_CURRENT_SESSION.superAdmin ||
        buildMockPermissions().includes('agent:model:manage') ||
        buildMockPermissions().includes('agent:graph:manage')
      // 兼容既有 manage 码：若无独立 debug manage 码则沿用 model manage
      const legacyManage = buildMockPermissions().includes('agent:model:manage')
      if (!MOCK_CURRENT_SESSION.superAdmin && !canManage && !legacyManage)
        return { code: 403, message: '无权限创建调试会话', data: null }
      const req = (body ?? {}) as { graphDefId?: number; input?: string }
      const graphDefId = Number(req.graphDefId)
      const input = String(req.input ?? '')
      const def = MOCK_GRAPH_DEFS.find((d) => d.id === graphDefId)
      if (!def) return { code: 404, message: '图定义不存在', data: null }
      if (def.status !== 'PUBLISHED') return { code: 400, message: '仅已发布图可调试', data: null }
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      const nextId =
        MOCK_DEBUG_SESSIONS.length > 0 ? Math.max(...MOCK_DEBUG_SESSIONS.map((s) => s.id)) + 1 : 1
      const elements = def.graphJson.elements
      const nodes = elements.filter((e) => e.kind === 'node')
      // 首个可执行节点为 START 之后按 elements 中 nodes 出现顺序的第一个非 START 节点
      const nodeOrder = nodes.map((n) => n.id)
      const startIdx = nodeOrder.findIndex((nid) => {
        const n = nodes.find((x) => x.id === nid)
        return n?.type === 'START'
      })
      // nextNodeId 指向 START 之后的第一个节点；若仅有 START→END 则为 END
      const nextNodeId =
        startIdx >= 0 && startIdx + 1 < nodeOrder.length ? nodeOrder[startIdx + 1] : null
      const session: MockDebugSession = {
        id: nextId,
        graphDefId,
        graphDefVersion: def.defVersion,
        status: 'PAUSED',
        input,
        breakpoints: [],
        variables: { input },
        traceCount: 0,
        nextNodeId,
        nextBranchId: nextNodeId ? '0' : null,
        resultText: null,
        errorCategory: null,
        errorMessage: null,
        latencyMs: null,
        inputTokens: null,
        outputTokens: null,
        expiresAt,
        createTime: now,
        updateTime: now,
        version: 0,
      }
      MOCK_DEBUG_SESSIONS.push(session)
      MOCK_DEBUG_NODES[nextId] = []
      return { code: 0, message: 'ok', data: { ...session } }
    },
  },
  // GET /api/agent/graph-debug-sessions — 分页（401/403；过期自动标 EXPIRED）
  {
    method: 'GET',
    pattern: '/api/agent/graph-debug-sessions',
    handler: (_params, query) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const perms = buildMockPermissions()
      if (
        !MOCK_CURRENT_SESSION.superAdmin &&
        !perms.includes('agent:model:view') &&
        !perms.includes('agent:graph:view')
      )
        return { code: 403, message: '无权限访问调试会话', data: null }
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      // 过期检查：PAUSED 且 now > expiresAt → EXPIRED
      const nowMs = Date.now()
      for (const s of MOCK_DEBUG_SESSIONS) {
        if (s.status === 'PAUSED' && nowMs > new Date(s.expiresAt).getTime()) {
          s.status = 'EXPIRED'
          s.nextNodeId = null
          s.nextBranchId = null
        }
      }
      let records = [...MOCK_DEBUG_SESSIONS]
      if (query.graphDefId) {
        const gdid = Number(query.graphDefId)
        records = records.filter((s) => s.graphDefId === gdid)
      }
      const total = records.length
      const start = (pageNum - 1) * pageSize
      const page = records.slice(start, start + pageSize).map((s) => ({ ...s }))
      return { code: 0, message: 'ok', data: { records: page, total, pageNum, pageSize } }
    },
  },
  // GET /api/agent/graph-debug-sessions/:id — 详情（401/403/404；过期检查）
  {
    method: 'GET',
    pattern: '/api/agent/graph-debug-sessions/:id',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const perms = buildMockPermissions()
      if (
        !MOCK_CURRENT_SESSION.superAdmin &&
        !perms.includes('agent:model:view') &&
        !perms.includes('agent:graph:view')
      )
        return { code: 403, message: '无权限访问调试会话', data: null }
      const id = Number((params as Record<string, string>).id)
      const sess = MOCK_DEBUG_SESSIONS.find((s) => s.id === id)
      if (!sess) return { code: 404, message: '调试会话不存在', data: null }
      if (sess.status === 'PAUSED' && Date.now() > new Date(sess.expiresAt).getTime()) {
        sess.status = 'EXPIRED'
        sess.nextNodeId = null
        sess.nextBranchId = null
      }
      return { code: 0, message: 'ok', data: { ...sess } }
    },
  },
  // GET /api/agent/graph-debug-sessions/:id/nodes — 节点轨迹（401/403/404；按 nodeSeq 升序）
  {
    method: 'GET',
    pattern: '/api/agent/graph-debug-sessions/:id/nodes',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const perms = buildMockPermissions()
      if (
        !MOCK_CURRENT_SESSION.superAdmin &&
        !perms.includes('agent:model:view') &&
        !perms.includes('agent:graph:view')
      )
        return { code: 403, message: '无权限访问调试会话', data: null }
      const id = Number((params as Record<string, string>).id)
      const sess = MOCK_DEBUG_SESSIONS.find((s) => s.id === id)
      if (!sess) return { code: 404, message: '调试会话不存在', data: null }
      const nodes = MOCK_DEBUG_NODES[id] ?? []
      const sorted = [...nodes].sort((a, b) => (a.nodeSeq ?? 0) - (b.nodeSeq ?? 0))
      return { code: 0, message: 'ok', data: sorted }
    },
  },
  // POST /api/agent/graph-debug-sessions/:id/step — 单步（401/403/404；非 PAUSED 400；并发冲突 409）
  {
    method: 'POST',
    pattern: '/api/agent/graph-debug-sessions/:id/step',
    handler: (params, query) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const perms = buildMockPermissions()
      const canManage =
        MOCK_CURRENT_SESSION.superAdmin ||
        perms.includes('agent:model:manage') ||
        perms.includes('agent:graph:manage') ||
        perms.includes('agent:model:view')
      if (!MOCK_CURRENT_SESSION.superAdmin && !canManage) {
        // 写操作沿用 manage，无则退化为 view 也放行（mock 演示）
        const hasAny = perms.includes('agent:model:view') || perms.includes('agent:graph:view')
        if (!hasAny) return { code: 403, message: '无权限执行调试会话', data: null }
      }
      const id = Number((params as Record<string, string>).id)
      const sess = MOCK_DEBUG_SESSIONS.find((s) => s.id === id)
      if (!sess) return { code: 404, message: '调试会话不存在', data: null }
      if (sess.status !== 'PAUSED') return { code: 400, message: '会话已终结', data: null }
      if (Date.now() > new Date(sess.expiresAt).getTime()) {
        sess.status = 'EXPIRED'
        sess.nextNodeId = null
        sess.nextBranchId = null
        return { code: 400, message: '会话已过期', data: null }
      }
      if (query.expectedVersion !== undefined && Number(query.expectedVersion) !== sess.version) {
        return { code: 409, message: '并发冲突', data: null }
      }
      const def = MOCK_GRAPH_DEFS.find((d) => d.id === sess.graphDefId)
      const elements = def ? def.graphJson.elements : []
      const nodes = elements.filter((e) => e.kind === 'node')
      const nodeOrder = nodes.map((n) => n.id)
      // 计算当前 nextNodeId 在 nodeOrder 中的索引
      const curIdx = sess.nextNodeId ? nodeOrder.indexOf(sess.nextNodeId) : -1
      if (curIdx < 0) {
        sess.status = 'COMPLETED'
        sess.nextNodeId = null
        sess.nextBranchId = null
        sess.resultText = sess.variables.input ?? ''
        return { code: 0, message: 'ok', data: { ...sess } }
      }
      const node = nodes.find((n) => n.id === sess.nextNodeId)
      const nodeType = node?.type ?? 'UNKNOWN'
      // 模拟变量演进：LLM 节点输出 result
      if (nodeType === 'LLM') {
        const out = `${sess.variables.input ?? ''} -> [${sess.nextNodeId} output]`
        const outVar =
          typeof node?.config?.outputVar === 'string' && String(node?.config?.outputVar).trim()
            ? String(node?.config?.outputVar)
            : 'result'
        sess.variables[outVar] = out
        sess.inputTokens = (sess.inputTokens ?? 0) + 10
        sess.outputTokens = (sess.outputTokens ?? 0) + 20
      } else if (nodeType === 'END') {
        // 到达 END：完成
        const cfg = (node?.config ?? {}) as Record<string, unknown>
        const inVar =
          typeof cfg.inputVar === 'string' && String(cfg.inputVar).trim()
            ? String(cfg.inputVar)
            : 'input'
        sess.resultText = sess.variables[inVar] ?? sess.variables.input ?? ''
      }
      // 追加 trace
      const arr = MOCK_DEBUG_NODES[id] ?? []
      const nextSeq = arr.length + 1
      arr.push({
        id: Date.now() + nextSeq,
        debugSessionId: id,
        nodeSeq: nextSeq,
        branchId: sess.nextBranchId ?? '0',
        nodeId: sess.nextNodeId!,
        nodeType,
        nodeLatencyMs: nodeType === 'LLM' ? 80 : 5,
        variableSnapshot: JSON.stringify({ ...sess.variables }),
        inputTokens: nodeType === 'LLM' ? 10 : null,
        outputTokens: nodeType === 'LLM' ? 20 : null,
      })
      MOCK_DEBUG_NODES[id] = arr
      sess.traceCount = arr.length
      sess.version += 1
      sess.updateTime = new Date().toISOString().replace('T', ' ').slice(0, 19)
      // 推进 nextNodeId
      const nextIdx = curIdx + 1
      if (nextIdx < nodeOrder.length) {
        const nextNode = nodes.find((n) => n.id === nodeOrder[nextIdx])
        // 若下一节点为 END 且已执行完 LLM，标记完成（下一步 end 执行后 COMPLETED）
        if (nodeType === 'END') {
          sess.status = 'COMPLETED'
          sess.nextNodeId = null
          sess.nextBranchId = null
          if (!sess.latencyMs) sess.latencyMs = 95
        } else {
          sess.nextNodeId = nodeOrder[nextIdx]
          sess.nextBranchId = '0'
          // 若新 next 为 END 且当前已推到边界外，下次 step 将收尾
          if (nextNode?.type === 'END') {
            // Mock: 已推入下一 END，分支保持（下次 step 收尾）
            void nextNode
          }
        }
      } else {
        // 最后一个节点刚执行完
        if (nodeType === 'END' || nodeType === 'LLM') {
          if (sess.status === 'PAUSED') {
            sess.status = 'COMPLETED'
            sess.nextNodeId = null
            sess.nextBranchId = null
            if (!sess.latencyMs) sess.latencyMs = 95
            if (!sess.resultText)
              sess.resultText = sess.variables.result ?? sess.variables.input ?? ''
          }
        } else {
          sess.nextNodeId = null
          sess.nextBranchId = null
        }
      }
      // 若刚执行的是 LLM 且下一节点是 END，仍保持 PAUSED 等待下一次 step 触发 END
      // 若刚执行的是 END，直接 COMPLETED（已在上面处理）
      return { code: 0, message: 'ok', data: { ...sess } }
    },
  },
  // POST /api/agent/graph-debug-sessions/:id/continue — 继续至断点或结束
  {
    method: 'POST',
    pattern: '/api/agent/graph-debug-sessions/:id/continue',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const perms = buildMockPermissions()
      if (
        !MOCK_CURRENT_SESSION.superAdmin &&
        !perms.includes('agent:model:view') &&
        !perms.includes('agent:graph:view') &&
        !perms.includes('agent:model:manage')
      )
        return { code: 403, message: '无权限执行调试会话', data: null }
      const id = Number((params as Record<string, string>).id)
      const sess = MOCK_DEBUG_SESSIONS.find((s) => s.id === id)
      if (!sess) return { code: 404, message: '调试会话不存在', data: null }
      if (sess.status !== 'PAUSED') return { code: 400, message: '会话已终结', data: null }
      if (Date.now() > new Date(sess.expiresAt).getTime()) {
        sess.status = 'EXPIRED'
        sess.nextNodeId = null
        sess.nextBranchId = null
        return { code: 400, message: '会话已过期', data: null }
      }
      const def = MOCK_GRAPH_DEFS.find((d) => d.id === sess.graphDefId)
      const elements = def ? def.graphJson.elements : []
      const nodes = elements.filter((e) => e.kind === 'node')
      const nodeOrder = nodes.map((n) => n.id)
      const breakpoints = new Set(sess.breakpoints ?? [])
      // 循环执行直到断点或终端
      let guard = 20
      while (sess.status === 'PAUSED' && sess.nextNodeId && guard-- > 0) {
        // 断点检查：若 nextNodeId命中断点且已有至少一条 trace（避免起点即停），则暂停
        const alreadyTraced = (MOCK_DEBUG_NODES[id]?.length ?? 0) > 0
        if (alreadyTraced && breakpoints.has(sess.nextNodeId)) break
        const curIdx = nodeOrder.indexOf(sess.nextNodeId)
        if (curIdx < 0) {
          sess.status = 'COMPLETED'
          sess.nextNodeId = null
          sess.nextBranchId = null
          break
        }
        const node = nodes.find((n) => n.id === sess.nextNodeId)
        const nodeType = node?.type ?? 'UNKNOWN'
        if (nodeType === 'LLM') {
          const out = `${sess.variables.input ?? ''} -> [${sess.nextNodeId} output]`
          const outVar =
            typeof node?.config?.outputVar === 'string' && String(node?.config?.outputVar).trim()
              ? String(node?.config?.outputVar)
              : 'result'
          sess.variables[outVar] = out
          sess.inputTokens = (sess.inputTokens ?? 0) + 10
          sess.outputTokens = (sess.outputTokens ?? 0) + 20
        } else if (nodeType === 'END') {
          const cfg = (node?.config ?? {}) as Record<string, unknown>
          const inVar =
            typeof cfg.inputVar === 'string' && String(cfg.inputVar).trim()
              ? String(cfg.inputVar)
              : 'input'
          sess.resultText = sess.variables[inVar] ?? sess.variables.input ?? ''
        }
        const arr = MOCK_DEBUG_NODES[id] ?? []
        const nextSeq = arr.length + 1
        arr.push({
          id: Date.now() + nextSeq,
          debugSessionId: id,
          nodeSeq: nextSeq,
          branchId: sess.nextBranchId ?? '0',
          nodeId: sess.nextNodeId!,
          nodeType,
          nodeLatencyMs: nodeType === 'LLM' ? 80 : 5,
          variableSnapshot: JSON.stringify({ ...sess.variables }),
          inputTokens: nodeType === 'LLM' ? 10 : null,
          outputTokens: nodeType === 'LLM' ? 20 : null,
        })
        MOCK_DEBUG_NODES[id] = arr
        sess.traceCount = arr.length
        sess.version += 1
        sess.updateTime = new Date().toISOString().replace('T', ' ').slice(0, 19)
        const nextIdx = curIdx + 1
        if (nodeType === 'END') {
          sess.status = 'COMPLETED'
          sess.nextNodeId = null
          sess.nextBranchId = null
          if (!sess.latencyMs) sess.latencyMs = 95
          break
        }
        if (nextIdx < nodeOrder.length) {
          const nextId2 = nodeOrder[nextIdx]
          // 到达断点则停在该节点前
          if (breakpoints.has(nextId2)) {
            sess.nextNodeId = nextId2
            sess.nextBranchId = '0'
            break
          }
          sess.nextNodeId = nextId2
          sess.nextBranchId = '0'
        } else {
          sess.status = 'COMPLETED'
          sess.nextNodeId = null
          sess.nextBranchId = null
          if (!sess.resultText)
            sess.resultText = sess.variables.result ?? sess.variables.input ?? ''
          if (!sess.latencyMs) sess.latencyMs = 95
          break
        }
      }
      return { code: 0, message: 'ok', data: { ...sess } }
    },
  },
  // POST /api/agent/graph-debug-sessions/:id/stop — 停止（仅 PAUSED→STOPPED）
  {
    method: 'POST',
    pattern: '/api/agent/graph-debug-sessions/:id/stop',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const perms = buildMockPermissions()
      if (
        !MOCK_CURRENT_SESSION.superAdmin &&
        !perms.includes('agent:model:view') &&
        !perms.includes('agent:graph:view') &&
        !perms.includes('agent:model:manage')
      )
        return { code: 403, message: '无权限执行调试会话', data: null }
      const id = Number((params as Record<string, string>).id)
      const sess = MOCK_DEBUG_SESSIONS.find((s) => s.id === id)
      if (!sess) return { code: 404, message: '调试会话不存在', data: null }
      if (sess.status !== 'PAUSED') return { code: 400, message: '会话已终结', data: null }
      sess.status = 'STOPPED'
      sess.nextNodeId = null
      sess.nextBranchId = null
      sess.updateTime = new Date().toISOString().replace('T', ' ').slice(0, 19)
      sess.version += 1
      return { code: 0, message: 'ok', data: { ...sess } }
    },
  },
  // PUT /api/agent/graph-debug-sessions/:id/breakpoints — 更新断点（仅 PAUSED；校验 nodeId 存在）
  {
    method: 'PUT',
    pattern: '/api/agent/graph-debug-sessions/:id/breakpoints',
    handler: (params, _query, body) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const perms = buildMockPermissions()
      if (
        !MOCK_CURRENT_SESSION.superAdmin &&
        !perms.includes('agent:model:view') &&
        !perms.includes('agent:graph:view') &&
        !perms.includes('agent:model:manage')
      )
        return { code: 403, message: '无权限执行调试会话', data: null }
      const id = Number((params as Record<string, string>).id)
      const sess = MOCK_DEBUG_SESSIONS.find((s) => s.id === id)
      if (!sess) return { code: 404, message: '调试会话不存在', data: null }
      if (sess.status !== 'PAUSED') return { code: 400, message: '会话已终结', data: null }
      const req = (body ?? {}) as { breakpoints?: unknown }
      const bps = Array.isArray(req.breakpoints) ? req.breakpoints.map(String) : []
      const def = MOCK_GRAPH_DEFS.find((d) => d.id === sess.graphDefId)
      if (def) {
        const nodeIds = new Set(
          def.graphJson.elements.filter((e) => e.kind === 'node').map((e) => e.id),
        )
        for (const bp of bps) {
          if (!nodeIds.has(bp)) return { code: 400, message: `断点节点不存在: ${bp}`, data: null }
        }
      }
      sess.breakpoints = [...new Set(bps)]
      sess.updateTime = new Date().toISOString().replace('T', ' ').slice(0, 19)
      sess.version += 1
      return { code: 0, message: 'ok', data: { ...sess } }
    },
  },
  // GET /api/agent/tool/internal?pageNum=&pageSize=&nameKeyword=&enabled=
  {
    method: 'GET',
    pattern: '/api/agent/tool/internal',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const keyword = String(query.nameKeyword ?? '').trim()
      const enabledRaw = query.enabled
      let list = [...MOCK_INTERNAL_TOOLS]
      if (keyword)
        list = list.filter((t) => t.name.includes(keyword) || t.description.includes(keyword))
      if (enabledRaw !== undefined && enabledRaw !== '' && enabledRaw !== null) {
        list = list.filter((t) => t.enabled === (enabledRaw === 'true'))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  // GET /api/agent/tool/internal/:id
  {
    method: 'GET',
    pattern: '/api/agent/tool/internal/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const tool = MOCK_INTERNAL_TOOLS.find((t) => t.id === id)
      if (!tool) return { code: 404, message: '内部工具不存在', data: null }
      return { code: 0, message: 'ok', data: { ...tool } }
    },
  },
  // POST /api/agent/tool/internal
  {
    method: 'POST',
    pattern: '/api/agent/tool/internal',
    handler: (_params, _query, body) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes('agent:tool:manage'))
        return { code: 403, message: '无权限创建内部工具', data: null }
      const req = (body ?? {}) as Record<string, unknown>
      if (!req.name || !String(req.name).trim())
        return { code: 400, message: '工具名不能为空', data: null }
      if (MOCK_INTERNAL_TOOLS.some((t) => t.name === String(req.name))) {
        return { code: 400, message: '工具名已存在', data: null }
      }
      if (!req.beanName || !String(req.beanName).trim())
        return { code: 400, message: 'Bean 名称不能为空', data: null }
      if (!req.methodName || !String(req.methodName).trim())
        return { code: 400, message: '方法名不能为空', data: null }
      if (req.inputSchema != null && String(req.inputSchema).trim()) {
        try {
          JSON.parse(String(req.inputSchema))
        } catch {
          return { code: 400, message: '入参 Schema 不是合法的 JSON', data: null }
        }
      }
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const id =
        MOCK_INTERNAL_TOOLS.length > 0 ? Math.max(...MOCK_INTERNAL_TOOLS.map((t) => t.id)) + 1 : 1
      const tool: MockToolInternalEntry = {
        id,
        name: String(req.name),
        description: String(req.description ?? ''),
        inputSchema: req.inputSchema != null ? String(req.inputSchema) : null,
        beanName: String(req.beanName ?? ''),
        methodName: String(req.methodName ?? ''),
        enabled: req.enabled !== undefined ? Boolean(req.enabled) : true,
        remark: req.remark != null ? String(req.remark) : null,
        createTime: now,
        updateTime: now,
      }
      MOCK_INTERNAL_TOOLS.push(tool)
      return { code: 0, message: 'ok', data: id }
    },
  },
  // PUT /api/agent/tool/internal/:id
  {
    method: 'PUT',
    pattern: '/api/agent/tool/internal/:id',
    handler: (params, _query, body) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes('agent:tool:manage'))
        return { code: 403, message: '无权限编辑内部工具', data: null }
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_INTERNAL_TOOLS.findIndex((t) => t.id === id)
      if (idx === -1) return { code: 404, message: '内部工具不存在', data: null }
      const req = (body ?? {}) as Record<string, unknown>
      if (req.name && String(req.name) !== MOCK_INTERNAL_TOOLS[idx].name) {
        if (MOCK_INTERNAL_TOOLS.some((t) => t.name === String(req.name))) {
          return { code: 400, message: '工具名已存在', data: null }
        }
      }
      if (req.beanName !== undefined && !String(req.beanName).trim())
        return { code: 400, message: 'Bean 名称不能为空', data: null }
      if (req.methodName !== undefined && !String(req.methodName).trim())
        return { code: 400, message: '方法名不能为空', data: null }
      if (
        req.inputSchema !== undefined &&
        req.inputSchema != null &&
        String(req.inputSchema).trim()
      ) {
        try {
          JSON.parse(String(req.inputSchema))
        } catch {
          return { code: 400, message: '入参 Schema 不是合法的 JSON', data: null }
        }
      }
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const existing = MOCK_INTERNAL_TOOLS[idx]
      MOCK_INTERNAL_TOOLS[idx] = {
        ...existing,
        name: req.name !== undefined ? String(req.name) : existing.name,
        description: req.description !== undefined ? String(req.description) : existing.description,
        inputSchema:
          req.inputSchema !== undefined
            ? req.inputSchema != null
              ? String(req.inputSchema)
              : null
            : existing.inputSchema,
        beanName: req.beanName !== undefined ? String(req.beanName) : existing.beanName,
        methodName: req.methodName !== undefined ? String(req.methodName) : existing.methodName,
        enabled: req.enabled !== undefined ? Boolean(req.enabled) : existing.enabled,
        remark:
          req.remark !== undefined
            ? req.remark != null
              ? String(req.remark)
              : null
            : existing.remark,
        updateTime: now,
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  // DELETE /api/agent/tool/internal/:id
  {
    method: 'DELETE',
    pattern: '/api/agent/tool/internal/:id',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes('agent:tool:manage'))
        return { code: 403, message: '无权限删除内部工具', data: null }
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_INTERNAL_TOOLS.findIndex((t) => t.id === id)
      if (idx === -1) return { code: 404, message: '内部工具不存在', data: null }
      MOCK_INTERNAL_TOOLS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // PUT /api/agent/tool/internal/:id/toggle?enabled=
  {
    method: 'PUT',
    pattern: '/api/agent/tool/internal/:id/toggle',
    handler: (params, query) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes('agent:tool:manage'))
        return { code: 403, message: '无权限启停内部工具', data: null }
      const id = Number((params as Record<string, string>).id)
      const tool = MOCK_INTERNAL_TOOLS.find((t) => t.id === id)
      if (!tool) return { code: 404, message: '内部工具不存在', data: null }
      tool.enabled = query.enabled === 'true'
      tool.updateTime = new Date().toISOString().replace('T', ' ').slice(0, 19)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // GET /api/agent/tool/external?pageNum=&pageSize=&nameKeyword=&enabled=
  {
    method: 'GET',
    pattern: '/api/agent/tool/external',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const keyword = String(query.nameKeyword ?? '').trim()
      const enabledRaw = query.enabled
      let list = [...MOCK_EXTERNAL_TOOLS]
      if (keyword)
        list = list.filter((t) => t.name.includes(keyword) || t.description.includes(keyword))
      if (enabledRaw !== undefined && enabledRaw !== '' && enabledRaw !== null) {
        list = list.filter((t) => t.enabled === (enabledRaw === 'true'))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  // GET /api/agent/tool/external/:id
  {
    method: 'GET',
    pattern: '/api/agent/tool/external/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const tool = MOCK_EXTERNAL_TOOLS.find((t) => t.id === id)
      if (!tool) return { code: 404, message: '外部工具不存在', data: null }
      return { code: 0, message: 'ok', data: { ...tool } }
    },
  },
  // POST /api/agent/tool/external
  {
    method: 'POST',
    pattern: '/api/agent/tool/external',
    handler: (_params, _query, body) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes('agent:tool:manage'))
        return { code: 403, message: '无权限创建外部工具', data: null }
      const req = (body ?? {}) as Record<string, unknown>
      if (!req.name || !String(req.name).trim())
        return { code: 400, message: '工具名不能为空', data: null }
      if (MOCK_EXTERNAL_TOOLS.some((t) => t.name === String(req.name))) {
        return { code: 400, message: '工具名已存在', data: null }
      }
      if (!req.url || !String(req.url).trim())
        return { code: 400, message: 'URL不能为空', data: null }
      try {
        const u = new URL(String(req.url))
        if (u.protocol !== 'http:' && u.protocol !== 'https:')
          return { code: 400, message: 'URL 必须为 http(s):// 开头', data: null }
      } catch {
        return { code: 400, message: 'URL 格式不正确', data: null }
      }
      const method = String(req.httpMethod ?? 'POST')
      if (!['GET', 'POST', 'PUT'].includes(method))
        return { code: 400, message: 'HTTP 方法必须为 GET/POST/PUT', data: null }
      const timeout = Number(req.timeoutSeconds ?? 30)
      if (!Number.isFinite(timeout) || timeout < 1)
        return { code: 400, message: '超时时间需为正整数（秒）', data: null }
      if (req.inputSchema != null && String(req.inputSchema).trim()) {
        try {
          JSON.parse(String(req.inputSchema))
        } catch {
          return { code: 400, message: '入参 Schema 不是合法的 JSON', data: null }
        }
      }
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const id =
        MOCK_EXTERNAL_TOOLS.length > 0 ? Math.max(...MOCK_EXTERNAL_TOOLS.map((t) => t.id)) + 1 : 1
      const tool: MockToolExternalEntry = {
        id,
        name: String(req.name),
        description: String(req.description ?? ''),
        inputSchema: req.inputSchema != null ? String(req.inputSchema) : null,
        url: String(req.url),
        httpMethod: method,
        timeoutSeconds: Number(req.timeoutSeconds ?? 30),
        enabled: req.enabled !== undefined ? Boolean(req.enabled) : true,
        remark: req.remark != null ? String(req.remark) : null,
        createTime: now,
        updateTime: now,
      }
      MOCK_EXTERNAL_TOOLS.push(tool)
      return { code: 0, message: 'ok', data: id }
    },
  },
  // PUT /api/agent/tool/external/:id
  {
    method: 'PUT',
    pattern: '/api/agent/tool/external/:id',
    handler: (params, _query, body) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes('agent:tool:manage'))
        return { code: 403, message: '无权限编辑外部工具', data: null }
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_EXTERNAL_TOOLS.findIndex((t) => t.id === id)
      if (idx === -1) return { code: 404, message: '外部工具不存在', data: null }
      const req = (body ?? {}) as Record<string, unknown>
      if (req.name && String(req.name) !== MOCK_EXTERNAL_TOOLS[idx].name) {
        if (MOCK_EXTERNAL_TOOLS.some((t) => t.name === String(req.name))) {
          return { code: 400, message: '工具名已存在', data: null }
        }
      }
      if (req.url !== undefined && req.url != null && String(req.url).trim()) {
        try {
          const u = new URL(String(req.url))
          if (u.protocol !== 'http:' && u.protocol !== 'https:')
            return { code: 400, message: 'URL 必须为 http(s):// 开头', data: null }
        } catch {
          return { code: 400, message: 'URL 格式不正确', data: null }
        }
      }
      if (req.httpMethod !== undefined) {
        const m = String(req.httpMethod)
        if (!['GET', 'POST', 'PUT'].includes(m))
          return { code: 400, message: 'HTTP 方法必须为 GET/POST/PUT', data: null }
      }
      if (req.timeoutSeconds !== undefined) {
        const t = Number(req.timeoutSeconds)
        if (!Number.isFinite(t) || t < 1)
          return { code: 400, message: '超时时间需为正整数（秒）', data: null }
      }
      if (
        req.inputSchema !== undefined &&
        req.inputSchema != null &&
        String(req.inputSchema).trim()
      ) {
        try {
          JSON.parse(String(req.inputSchema))
        } catch {
          return { code: 400, message: '入参 Schema 不是合法的 JSON', data: null }
        }
      }
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const existing = MOCK_EXTERNAL_TOOLS[idx]
      MOCK_EXTERNAL_TOOLS[idx] = {
        ...existing,
        name: req.name !== undefined ? String(req.name) : existing.name,
        description: req.description !== undefined ? String(req.description) : existing.description,
        inputSchema:
          req.inputSchema !== undefined
            ? req.inputSchema != null
              ? String(req.inputSchema)
              : null
            : existing.inputSchema,
        url: req.url !== undefined ? String(req.url) : existing.url,
        httpMethod: req.httpMethod !== undefined ? String(req.httpMethod) : existing.httpMethod,
        timeoutSeconds:
          req.timeoutSeconds !== undefined ? Number(req.timeoutSeconds) : existing.timeoutSeconds,
        enabled: req.enabled !== undefined ? Boolean(req.enabled) : existing.enabled,
        remark:
          req.remark !== undefined
            ? req.remark != null
              ? String(req.remark)
              : null
            : existing.remark,
        updateTime: now,
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  // DELETE /api/agent/tool/external/:id
  {
    method: 'DELETE',
    pattern: '/api/agent/tool/external/:id',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes('agent:tool:manage'))
        return { code: 403, message: '无权限删除外部工具', data: null }
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_EXTERNAL_TOOLS.findIndex((t) => t.id === id)
      if (idx === -1) return { code: 404, message: '外部工具不存在', data: null }
      MOCK_EXTERNAL_TOOLS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // PUT /api/agent/tool/external/:id/toggle?enabled=
  {
    method: 'PUT',
    pattern: '/api/agent/tool/external/:id/toggle',
    handler: (params, query) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes('agent:tool:manage'))
        return { code: 403, message: '无权限启停外部工具', data: null }
      const id = Number((params as Record<string, string>).id)
      const tool = MOCK_EXTERNAL_TOOLS.find((t) => t.id === id)
      if (!tool) return { code: 404, message: '外部工具不存在', data: null }
      tool.enabled = query.enabled === 'true'
      tool.updateTime = new Date().toISOString().replace('T', ' ').slice(0, 19)
      return { code: 0, message: 'ok', data: null }
    },
  },
]

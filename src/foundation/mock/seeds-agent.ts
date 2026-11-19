/**
 * Agent 种子：供应商/模型、图谱定义与执行、会话与消息、调试会话、内部/外部工具。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */
import type { AgentModel, AgentProvider } from '@/contracts/agent'

export const MOCK_AGENT_PROVIDERS: AgentProvider[] = [
  {
    id: 101,
    name: 'OpenAI 官方',
    apiFormat: 'OPENAI_CHAT',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyMasked: 'sk****abcd',
    enabled: true,
    remark: 'Chat Completions 格式',
    createTime: '2026-07-10 10:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
  {
    id: 102,
    name: 'Ollama 本地',
    apiFormat: 'OPENAI_CHAT',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKeyMasked: null,
    enabled: true,
    remark: '本地部署，无需鉴权',
    createTime: '2026-07-11 09:00:00',
    updateTime: '2026-07-11 09:00:00',
  },
  {
    id: 103,
    name: 'Command Code 网关',
    apiFormat: 'OPENAI_RESPONSES',
    baseUrl: 'https://gateway.example.com/v1',
    apiKeyMasked: 'sk****dcba',
    enabled: true,
    remark: 'Responses 格式',
    createTime: '2026-07-12 14:00:00',
    updateTime: '2026-07-13 11:30:00',
  },
  {
    id: 104,
    name: 'Anthropic 官方',
    apiFormat: 'ANTHROPIC',
    baseUrl: 'https://api.anthropic.com',
    apiKeyMasked: 'sk****anth',
    enabled: false,
    remark: '备用通道，当前停用',
    createTime: '2026-07-12 14:00:00',
    updateTime: '2026-07-13 11:30:00',
  },
]

export const MOCK_AGENT_MODELS: AgentModel[] = [
  {
    id: 1,
    providerId: 101,
    providerName: 'OpenAI 官方',
    providerApiFormat: 'OPENAI_CHAT',
    name: 'OpenAI GPT-4o 主模型',
    modelName: 'gpt-4o',
    capabilities: 'CHAT',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeoutSeconds: 60,
    retryCount: 2,
    enabled: true,
    remark: '生产主模型',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-10 10:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
  {
    id: 2,
    providerId: 102,
    providerName: 'Ollama 本地',
    providerApiFormat: 'OPENAI_CHAT',
    name: 'Ollama 本地 Llama3',
    modelName: 'llama3',
    capabilities: 'CHAT',
    temperature: 0.5,
    maxTokens: 2048,
    topP: 0.9,
    timeoutSeconds: 30,
    retryCount: 0,
    enabled: true,
    remark: '本地部署',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-11 09:00:00',
    updateTime: '2026-07-11 09:00:00',
  },
  {
    id: 3,
    providerId: 103,
    providerName: 'Command Code 网关',
    providerApiFormat: 'OPENAI_RESPONSES',
    name: 'Responses 格式示例模型',
    modelName: 'gpt-4o-mini',
    capabilities: 'CHAT',
    temperature: 0.3,
    maxTokens: 8192,
    topP: 0.95,
    timeoutSeconds: 120,
    retryCount: 3,
    enabled: true,
    remark: 'Responses 通道',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-12 14:00:00',
    updateTime: '2026-07-13 11:30:00',
  },
  {
    id: 4,
    providerId: 101,
    providerName: 'OpenAI 官方',
    providerApiFormat: 'OPENAI_CHAT',
    name: '多Key轮询-主Key',
    modelName: 'gpt-4o',
    capabilities: 'CHAT',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeoutSeconds: 60,
    retryCount: 2,
    enabled: true,
    remark: '轮询分组 primary，sort 最小优先',
    groupKey: 'gpt4o-pool',
    sort: 1,
    // 未来时间：演示「限流临时锁定中」运行态（只读展示）
    lockedUntil: '2030-01-01T00:00:00',
    quotaCooldownSeconds: 300,
    createTime: '2026-07-14 10:00:00',
    updateTime: '2026-07-15 08:00:00',
  },
  {
    id: 5,
    providerId: 101,
    providerName: 'OpenAI 官方',
    providerApiFormat: 'OPENAI_CHAT',
    name: '多Key轮询-备Key',
    modelName: 'gpt-4o',
    capabilities: 'CHAT',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeoutSeconds: 60,
    retryCount: 2,
    enabled: true,
    remark: '轮询分组 primary，sort 大者兜底',
    groupKey: 'gpt4o-pool',
    sort: 2,
    // 过去时间：演示「已解锁」运行态（只读展示）
    lockedUntil: '2026-01-01T00:00:00',
    quotaCooldownSeconds: 300,
    createTime: '2026-07-14 10:00:00',
    updateTime: '2026-07-15 08:00:00',
  },
  {
    id: 6,
    providerId: 104,
    providerName: 'Anthropic 官方',
    providerApiFormat: 'ANTHROPIC',
    name: 'Claude 备用模型',
    modelName: 'claude-sonnet',
    capabilities: 'CHAT',
    temperature: 1,
    maxTokens: 4096,
    topP: null,
    timeoutSeconds: 90,
    retryCount: 1,
    enabled: false,
    remark: '待灰度验证',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-16 15:00:00',
    updateTime: '2026-07-16 15:00:00',
  },
]

export interface MockGraphDefEntry {
  id: number
  name: string
  graphKey: string
  description?: string
  defVersion: number
  status: 'DRAFT' | 'PUBLISHED'
  graphJson: {
    graphKey: string
    name: string
    version: number
    canvas: Record<string, unknown>
    elements: Array<{
      id: string
      kind: 'node' | 'edge'
      type?: string
      source?: string
      target?: string
      config?: Record<string, unknown>
      style?: Record<string, unknown>
    }>
  }
}

export const MOCK_GRAPH_DEFS: MockGraphDefEntry[] = [
  {
    // 历史图：无 prompt 配置（验证默认回退：input 直接穿透）
    id: 1001,
    name: '简单意图识别',
    graphKey: 'simple-intent',
    defVersion: 1,
    status: 'PUBLISHED',
    graphJson: {
      graphKey: 'simple-intent',
      name: '简单意图识别',
      version: 1,
      canvas: {},
      elements: [
        { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: { agentModelConfigId: 1 }, // 无 systemPrompt / userPromptTemplate
          style: { x: 200, y: 0 },
        },
        { id: 'end_1', kind: 'node', type: 'END', style: { x: 400, y: 0 } },
        { id: 'e1', kind: 'edge', type: undefined, source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', type: undefined, source: 'llm_1', target: 'end_1' },
      ],
    },
  },
  {
    // 带 systemPrompt 的图
    id: 1002,
    name: '角色设定示例',
    graphKey: 'role-system-prompt',
    defVersion: 1,
    status: 'PUBLISHED',
    graphJson: {
      graphKey: 'role-system-prompt',
      name: '角色设定示例',
      version: 1,
      canvas: {},
      elements: [
        { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: {
            agentModelConfigId: 1,
            systemPrompt: '你是一名专业的中文翻译助手。',
          },
          style: { x: 200, y: 0 },
        },
        { id: 'end_1', kind: 'node', type: 'END', style: { x: 400, y: 0 } },
        { id: 'e1', kind: 'edge', type: undefined, source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', type: undefined, source: 'llm_1', target: 'end_1' },
      ],
    },
  },
  {
    // 带 userPromptTemplate 的图（成功插值：所有变量 {{input}} + {{tone}} 均可解析）
    id: 1003,
    name: '多变量模板示例',
    graphKey: 'multi-var-template',
    defVersion: 1,
    status: 'PUBLISHED',
    graphJson: {
      graphKey: 'multi-var-template',
      name: '多变量模板示例',
      version: 1,
      canvas: {},
      elements: [
        { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: {
            agentModelConfigId: 1,
            systemPrompt: '你是一名文案生成专家。',
            userPromptTemplate: '请根据以下关键词生成一段文案：{{input}}。语气：{{tone}}。',
            outputVar: 'result',
          },
          style: { x: 200, y: 0 },
        },
        {
          id: 'end_1',
          kind: 'node',
          type: 'END',
          config: { inputVar: 'result' },
          style: { x: 400, y: 0 },
        },
        { id: 'e1', kind: 'edge', type: undefined, source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', type: undefined, source: 'llm_1', target: 'end_1' },
      ],
    },
  },
  {
    // 引用未定义变量的图（执行失败：{{undefinedVar}} 无法解析）
    id: 1004,
    name: '未定义变量示例',
    graphKey: 'undefined-var',
    defVersion: 1,
    status: 'PUBLISHED',
    graphJson: {
      graphKey: 'undefined-var',
      name: '未定义变量示例',
      version: 1,
      canvas: {},
      elements: [
        { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: {
            agentModelConfigId: 1,
            userPromptTemplate: '请翻译：{{undefinedVar}}',
          },
          style: { x: 200, y: 0 },
        },
        { id: 'end_1', kind: 'node', type: 'END', style: { x: 400, y: 0 } },
        { id: 'e1', kind: 'edge', type: undefined, source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', type: undefined, source: 'llm_1', target: 'end_1' },
      ],
    },
  },
]

export const MOCK_AGENT_GRAPH_EXECUTIONS: Array<{
  id: number
  graphDefId: number
  graphKey: string
  graphName: string
  defVersion: number
  status: string // 'SUCCESS' | 'FAILED' | 'RUNNING'
  success: boolean
  latencyMs: number
  traceId: string
  createTime: string
  updateTime?: string
  input: string
  output: string
  errorMessage?: string
  errorCategory?: string
  nodeDetails: Array<{
    nodeSeq: number
    branchId: string
    nodeId: string
    nodeType: string // 'START' | 'LLM' | 'END' | 'FORK' | 'JOIN' | 'LOOP' | 'CONDITION'
    nodeName: string
    status: string
    success: boolean
    nodeLatencyMs?: number
    buildTime?: string
    input?: string
    output?: string
    errorMessage?: string
  }>
}> = [
  {
    id: 1,
    graphDefId: 1,
    graphKey: 'CUSTOMER_ROUTING_V2',
    graphName: '客服分流图 V2',
    defVersion: 3,
    status: 'SUCCESS',
    success: true,
    latencyMs: 2350,
    traceId: 'trace-cust-001',
    createTime: '2026-08-20 10:00:00',
    updateTime: '2026-08-20 10:00:05',
    input: JSON.stringify({ query: '我想查询订单状态' }),
    output: JSON.stringify({ response: '您的订单 #12345 已发货...' }),
    nodeDetails: [
      {
        nodeSeq: 1,
        branchId: '0',
        nodeId: 'start_1',
        nodeType: 'START',
        nodeName: '开始',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 5,
      },
      {
        nodeSeq: 2,
        branchId: '0',
        nodeId: 'llm_1',
        nodeType: 'LLM',
        nodeName: '意图识别',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 800,
        input: JSON.stringify({ query: '我想查询订单状态' }),
        output: JSON.stringify({ intent: 'ORDER_QUERY' }),
      },
      {
        nodeSeq: 3,
        branchId: '0',
        nodeId: 'check_1',
        nodeType: 'CONDITION',
        nodeName: '条件判断',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 10,
      },
      {
        nodeSeq: 4,
        branchId: '0',
        nodeId: 'end_1',
        nodeType: 'END',
        nodeName: '结束',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 2,
      },
    ],
  },
  {
    id: 2,
    graphDefId: 1,
    graphKey: 'CUSTOMER_ROUTING_V2',
    graphName: '客服分流图 V2',
    defVersion: 3,
    status: 'FAILED',
    success: false,
    latencyMs: 5100,
    traceId: 'trace-cust-002',
    createTime: '2026-08-20 11:00:00',
    updateTime: '2026-08-20 11:00:10',
    input: JSON.stringify({ query: '帮我生成营销文案' }),
    output: '',
    errorMessage: '模型调用超时：LLM API 响应超过 5 秒',
    errorCategory: 'MODEL_CALL_TIMEOUT',
    nodeDetails: [
      {
        nodeSeq: 1,
        branchId: '0',
        nodeId: 'start_2',
        nodeType: 'START',
        nodeName: '开始',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 3,
      },
      {
        nodeSeq: 2,
        branchId: '0',
        nodeId: 'llm_2',
        nodeType: 'LLM',
        nodeName: '文案生成',
        status: 'FAILED',
        success: false,
        nodeLatencyMs: 5000,
        errorMessage: 'Timeout after 5000ms',
      },
      {
        nodeSeq: 3,
        branchId: '0',
        nodeId: 'end_2',
        nodeType: 'END',
        nodeName: '错误处理',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 10,
      },
    ],
  },
  {
    id: 3,
    graphDefId: 2,
    graphKey: 'DATA_ANALYSIS_PIPE',
    graphName: '数据分析管线',
    defVersion: 1,
    status: 'SUCCESS',
    success: true,
    latencyMs: 4200,
    traceId: 'trace-data-001',
    createTime: '2026-08-20 12:00:00',
    updateTime: '2026-08-20 12:00:08',
    input: JSON.stringify({ table: 'sales_q3', metrics: ['revenue', 'count'] }),
    output: JSON.stringify({ results: { revenue: 125000, count: 342 } }),
    nodeDetails: [
      {
        nodeSeq: 1,
        branchId: '0',
        nodeId: 'start_3',
        nodeType: 'START',
        nodeName: '开始',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 5,
      },
      {
        nodeSeq: 2,
        branchId: '0',
        nodeId: 'fork_1',
        nodeType: 'FORK',
        nodeName: '扇出计算',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 2,
      },
      {
        nodeSeq: 3,
        branchId: 'branch-a',
        nodeId: 'calc_rev',
        nodeType: 'LLM',
        nodeName: '收入计算',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 2100,
      },
      {
        nodeSeq: 4,
        branchId: 'branch-b',
        nodeId: 'calc_cnt',
        nodeType: 'LLM',
        nodeName: '计数计算',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 1900,
      },
      {
        nodeSeq: 5,
        branchId: '0',
        nodeId: 'join_1',
        nodeType: 'JOIN',
        nodeName: '汇合结果',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 15,
      },
      {
        nodeSeq: 6,
        branchId: '0',
        nodeId: 'end_3',
        nodeType: 'END',
        nodeName: '结束',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 2,
      },
    ],
  },
]

export interface MockConversation {
  id: number
  agentModelConfigId: number
  title?: string
  status: string
  createTime: string
}

export interface MockConversationMessage {
  id: number
  role: string
  content: string
  msgOrder: number
  inputTokens: number | null
  outputTokens: number | null
  createTime: string
}

export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    id: 1,
    agentModelConfigId: 10,
    title: '客服咨询会话',
    status: 'ACTIVE',
    createTime: '2026-08-22 09:00:00',
  },
  {
    id: 2,
    agentModelConfigId: 11,
    title: '未知用量会话',
    status: 'ACTIVE',
    createTime: '2026-08-22 08:30:00',
  },
  {
    id: 3,
    agentModelConfigId: 12,
    title: '部分用量会话',
    status: 'ACTIVE',
    createTime: '2026-08-22 08:00:00',
  },
]

export const MOCK_CONVERSATION_MESSAGES: Record<number, MockConversationMessage[]> = {
  1: [
    {
      id: 101,
      role: 'USER',
      content: '第一轮：如何退款？',
      msgOrder: 0,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 09:00:01',
    },
    {
      id: 102,
      role: 'ASSISTANT',
      content: '第一轮回复：请提供订单号。',
      msgOrder: 1,
      inputTokens: 10,
      outputTokens: 20,
      createTime: '2026-08-22 09:00:02',
    },
    {
      id: 103,
      role: 'USER',
      content: '第二轮：订单号 12345。',
      msgOrder: 2,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 09:00:05',
    },
    {
      id: 104,
      role: 'ASSISTANT',
      content: '第二轮回复：已为您发起退款。',
      msgOrder: 3,
      inputTokens: 30,
      outputTokens: 40,
      createTime: '2026-08-22 09:00:06',
    },
  ],
  2: [
    {
      id: 201,
      role: 'USER',
      content: '未知用量会话提问',
      msgOrder: 0,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 08:30:01',
    },
    {
      id: 202,
      role: 'ASSISTANT',
      content: '供应商未返回 usage 的回复',
      msgOrder: 1,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 08:30:02',
    },
  ],
  3: [
    {
      id: 301,
      role: 'USER',
      content: '部分用量会话提问',
      msgOrder: 0,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 08:00:01',
    },
    {
      id: 302,
      role: 'ASSISTANT',
      content: '仅返回输入 token 的回复',
      msgOrder: 1,
      inputTokens: 50,
      outputTokens: null,
      createTime: '2026-08-22 08:00:02',
    },
  ],
}

export interface MockDebugSession {
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

export interface MockDebugNode {
  id: number
  debugSessionId: number
  nodeSeq: number
  branchId: string
  nodeId: string
  nodeType: string
  nodeLatencyMs: number
  variableSnapshot: string | null
  inputTokens?: number | null
  outputTokens?: number | null
}

export const MOCK_DEBUG_SESSIONS: MockDebugSession[] = [
  {
    id: 1,
    graphDefId: 1001,
    graphDefVersion: 1,
    status: 'PAUSED',
    input: 'hello debug',
    breakpoints: ['llm_1'],
    variables: { input: 'hello debug' },
    traceCount: 1,
    nextNodeId: 'llm_1',
    nextBranchId: '0',
    resultText: null,
    errorCategory: null,
    errorMessage: null,
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    expiresAt: '2030-08-22T10:30:00.000Z',
    createTime: '2026-08-22 09:00:00',
    updateTime: '2026-08-22 09:00:05',
    version: 1,
  },
  {
    id: 2,
    graphDefId: 1002,
    graphDefVersion: 1,
    status: 'COMPLETED',
    input: 'completed input',
    breakpoints: [],
    variables: { input: 'completed input', result: 'completed input -> [llm_1 output]' },
    traceCount: 3,
    nextNodeId: null,
    nextBranchId: null,
    resultText: 'completed input -> [llm_1 output]',
    errorCategory: null,
    errorMessage: null,
    latencyMs: 95,
    inputTokens: 10,
    outputTokens: 20,
    expiresAt: '2030-08-22T11:00:00.000Z',
    createTime: '2026-08-22 08:00:00',
    updateTime: '2026-08-22 08:00:10',
    version: 3,
  },
]

export const MOCK_DEBUG_NODES: Record<number, MockDebugNode[]> = {
  1: [
    {
      id: 101,
      debugSessionId: 1,
      nodeSeq: 1,
      branchId: '0',
      nodeId: 'start_1',
      nodeType: 'START',
      nodeLatencyMs: 5,
      variableSnapshot: JSON.stringify({ input: 'hello debug' }),
      inputTokens: null,
      outputTokens: null,
    },
  ],
  2: [
    {
      id: 201,
      debugSessionId: 2,
      nodeSeq: 1,
      branchId: '0',
      nodeId: 'start_1',
      nodeType: 'START',
      nodeLatencyMs: 5,
      variableSnapshot: JSON.stringify({ input: 'completed input' }),
      inputTokens: null,
      outputTokens: null,
    },
    {
      id: 202,
      debugSessionId: 2,
      nodeSeq: 2,
      branchId: '0',
      nodeId: 'llm_1',
      nodeType: 'LLM',
      nodeLatencyMs: 80,
      variableSnapshot: JSON.stringify({
        input: 'completed input',
        result: 'completed input -> [llm_1 output]',
      }),
      inputTokens: 10,
      outputTokens: 20,
    },
    {
      id: 203,
      debugSessionId: 2,
      nodeSeq: 3,
      branchId: '0',
      nodeId: 'end_1',
      nodeType: 'END',
      nodeLatencyMs: 10,
      variableSnapshot: JSON.stringify({
        input: 'completed input',
        result: 'completed input -> [llm_1 output]',
      }),
      inputTokens: null,
      outputTokens: null,
    },
  ],
}

export interface MockToolInternalEntry {
  id: number
  name: string
  description: string
  inputSchema: string | null
  beanName: string
  methodName: string
  enabled: boolean
  remark: string | null
  createTime: string
  updateTime: string
}

export interface MockToolExternalEntry {
  id: number
  name: string
  description: string
  inputSchema: string | null
  url: string
  httpMethod: string
  timeoutSeconds: number
  enabled: boolean
  remark: string | null
  createTime: string
  updateTime: string
}

export const MOCK_INTERNAL_TOOLS: MockToolInternalEntry[] = [
  {
    id: 1,
    name: 'get_weather',
    description: '获取指定城市的天气信息',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称' },
      },
      required: ['city'],
    }),
    beanName: 'weatherToolBean',
    methodName: 'execute',
    enabled: true,
    remark: '示例内部工具：天气查询',
    createTime: '2026-07-10 10:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
  {
    id: 2,
    name: 'search_knowledge',
    description: '在知识库中搜索相关文档',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        top_k: { type: 'number', description: '返回结果数量', default: 5 },
      },
      required: ['query'],
    }),
    beanName: 'knowledgeSearchBean',
    methodName: 'execute',
    enabled: true,
    remark: '知识库检索工具',
    createTime: '2026-07-11 09:00:00',
    updateTime: '2026-07-11 09:00:00',
  },
  {
    id: 3,
    name: 'calculate',
    description: '执行数学表达式计算',
    inputSchema: null,
    beanName: 'calculatorBean',
    methodName: 'execute',
    enabled: false,
    remark: '停用中的工具',
    createTime: '2026-07-12 14:00:00',
    updateTime: '2026-07-13 11:30:00',
  },
]

export const MOCK_EXTERNAL_TOOLS: MockToolExternalEntry[] = [
  {
    id: 1,
    name: 'web_search',
    description: '通过外部搜索引擎搜索互联网信息',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' },
      },
      required: ['query'],
    }),
    url: 'https://api.search-service.com/v1/search',
    httpMethod: 'POST',
    timeoutSeconds: 30,
    enabled: true,
    remark: '外部搜索引擎工具',
    createTime: '2026-07-10 10:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
  {
    id: 2,
    name: 'send_email',
    description: '通过外部邮件服务发送邮件',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        to: { type: 'string', description: '收件人邮箱' },
        subject: { type: 'string', description: '邮件主题' },
        body: { type: 'string', description: '邮件正文' },
      },
      required: ['to', 'subject', 'body'],
    }),
    url: 'https://api.email-service.com/v1/send',
    httpMethod: 'POST',
    timeoutSeconds: 60,
    enabled: true,
    remark: '外部邮件服务工具',
    createTime: '2026-07-11 09:00:00',
    updateTime: '2026-07-11 09:00:00',
  },
]

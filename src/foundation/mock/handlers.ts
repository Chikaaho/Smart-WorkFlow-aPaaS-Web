/**
 * Mock handler 注册数据 —— 导出纯数据（无副作用的 handler 定义），
 * 由 foundation/mock/index 在 registry 初始化后集中注册。
 *
 * ## 扩展指南
 * 按以下样板追加 handler，modules/* 与各 service 层零改动：
 *
 * ```ts
 * export const mockRegistrations: MockRegistration[] = [
 *   ...,
 *   {
 *     method: 'GET',
 *     pattern: '/api/your/endpoint/:param',
 *     handler: (params, query, body) => ({
 *       code: 0,
 *       message: 'ok',
 *       data: { ... },
 *     }),
 *   },
 * ]
 * ```
 *
 * 共享种子数据位于同级 ./seeds。
 */

import { buildMockXlsxBlob } from './mock-xlsx'
import { getAccessToken } from '@/foundation/auth/token'
import type { MockHandler, MockMethod } from './index'

/** 模板/导出两行表头（显示名 + 稳定映射标识），与真实后端模板契约一致。 */
const MOCK_IMPORT_EXPORT_HEADERS: string[][] = [
  ['申请人', '部门', '请假类型', '请假日期', '天数', '紧急', '事由'],
  ['applicant', 'department', 'leaveType', 'leaveDate', 'days', 'urgent', 'reason'],
]

/**
 * P32 导入导出身份/权限闸（对齐真实后端 401/403/放行 口径）：
 * 未登录（无 token 或未认证会话）→ 401；已登录缺对应权限 → 403；超管/持权 → 放行。
 */
function p32AccessGate(required: string): { code: number; message: string; data: null } | null {
  if (!getAccessToken() || MOCK_CURRENT_SESSION.user.username === '') {
    return { code: 401, message: '未认证', data: null }
  }
  if (!MOCK_CURRENT_SESSION.superAdmin && !MOCK_CURRENT_SESSION.permissions.includes(required)) {
    return { code: 403, message: '无权限', data: null }
  }
  return null
}
import type { AgentModelConfig, AgentModelSaveReq } from '@/contracts/agent'
import {
  MOCK_AGENT_MODELS,
  MOCK_AGENT_GRAPH_EXECUTIONS,
  MOCK_CONVERSATIONS,
  MOCK_CONVERSATION_MESSAGES,
  MOCK_GRAPH_DEFS,
  type MockGraphDefEntry,
  MOCK_DEBUG_SESSIONS,
  MOCK_DEBUG_NODES,
  type MockDebugSession,
  MOCK_DICT_DATA,
  MOCK_DICT_TYPES,
  MOCK_SESSION_DATA,
  MOCK_CURRENT_SESSION,
  switchMockSession,
  MOCK_MENU_TREE,
  type MockMenuNode,
  type MockSessionData,
  MOCK_ROLE_MENU_BINDINGS,
  DEMO_FORM_KEY,
  MOCK_DEMO_FORM_DEFINITION,
  MOCK_DEMO_SUBMISSIONS,
  MOCK_FORM_DATA_RECORDS,
  MOCK_GENERIC_FORM_RECORDS,
  MOCK_FORM_DEF_STORE,
  MOCK_TODO_TASKS,
  MOCK_PROCESSED_TASKS,
  MOCK_PROCESS_DEFS,
  MOCK_NOTIFY_MESSAGES,
  MOCK_NOTIFY_TEMPLATES,
  MOCK_USERS_LIST,
  MOCK_ROLES_LIST,
  MOCK_DEPTS_LIST,
  MOCK_POSTS_LIST,
  MOCK_USER_GROUPS_LIST,
  MOCK_STORAGE_FILES,
  MOCK_JOB_INFOS,
  MOCK_JOB_LOGS,
  MOCK_INSTANCES,
  MOCK_INSTANCE_DETAILS,
  MOCK_INTERNAL_TOOLS,
  MOCK_EXTERNAL_TOOLS,
  type MockToolInternalEntry,
  type MockToolExternalEntry,
} from './seeds'

// ─── 模型 handler 内部辅助（与真实后端语义对齐） ─────────────────

/**
 * 生成脱敏展示串（对齐后端 AesGcmCipher.mask：前 2 + **** + 后 2）。
 * mock 内部同样不存明文：仅当次提交入参短暂存在，落库/响应只产出脱敏值。
 */
function maskApiKey(raw: string): string {
  const key = raw.trim()
  if (key.length <= 4) return '****'
  return `${key.slice(0, 2)}****${key.slice(-2)}`
}

function findModel(id: number): AgentModelConfig | undefined {
  return MOCK_AGENT_MODELS.find((m) => m.id === id)
}

/** 取 MOCK_AGENT_MODELS 中已出现的最大 id，用于创建时分配新 id。 */
function nextModelId(): number {
  return MOCK_AGENT_MODELS.reduce((max, m) => Math.max(max, m.id), 0) + 1
}

// ─── 消息模板渲染辅助（P36：与后端 TemplateRenderService 同语义） ──

/** 合法变量名：字母或下划线开头，仅字母/数字/下划线 */
const MOCK_TEMPLATE_VAR = /^[A-Za-z_][A-Za-z0-9_]*$/
const MOCK_TEMPLATE_PLACEHOLDER = /\$\{([^}]*)\}/g

/**
 * ${var} 简单替换；变量值按字面文本处理。
 * 缺失变量抛 Error('缺少变量: ...')——与后端 PARAM_ERROR 消息一致。
 */
function renderMockTemplate(template: string, variables: Record<string, string>): string {
  if (!template.includes('${')) return template
  const missing: string[] = []
  const result = template.replace(MOCK_TEMPLATE_PLACEHOLDER, (raw, name: string) => {
    if (!name || !MOCK_TEMPLATE_VAR.test(name)) {
      throw new Error(`非法占位符: \${${name}}`)
    }
    const value = variables?.[name]
    if (value === undefined || value === null) {
      missing.push(name)
      return raw
    }
    return value
  })
  if (missing.length > 0) {
    throw new Error(`缺少变量: ${missing.join(', ')}`)
  }
  return result
}

/** 提取第一个非法占位符的变量名（合法返回 null），用于新建/编辑校验。 */
function extractInvalidPlaceholder(template: string): string | null {
  for (const match of template.matchAll(MOCK_TEMPLATE_PLACEHOLDER)) {
    const name = match[1]
    if (!name || !MOCK_TEMPLATE_VAR.test(name)) return name
  }
  return null
}

// ─── 会话/菜单过滤辅助（对齐真实后端 SysMenuServiceImpl 语义） ──

/** 当前会话（非超管）的全部角色 id。 */
function currentRoleIds(): number[] {
  const roles = MOCK_CURRENT_SESSION.roles
  return MOCK_ROLES_LIST.filter((r) => roles.includes(r.code)).map((r) => Number(r.id))
}

/** 当前会话（非超管）可用的菜单 id 集合（跨角色绑定并集、数字归一）。 */
function currentMenuIds(): Set<number> {
  const ids = new Set<number>()
  for (const roleId of currentRoleIds()) {
    const bindings = MOCK_ROLE_MENU_BINDINGS[String(roleId)]
    if (bindings) for (const id of bindings) ids.add(id)
  }
  return ids
}

/**
 * 按真实后端 buildTree 语义过滤菜单树：
 * 仅在「节点 id ∈ 可用集合」时才挂载（父不在集合 → 该子树整体丢弃，孤儿子节点不挂载）；
 * 同层按 sort 升序（与后端 Comparator 一致）。节点浅拷贝，不改动共享夹具
 * （跨会话复用不污染：admin 全量树永远来自原始 MOCK_MENU_TREE）。
 */
function buildMockMenuTree(): MockMenuNode[] {
  const tree = MOCK_MENU_TREE as MockMenuNode[]
  if (MOCK_CURRENT_SESSION.superAdmin) return tree
  const allowed = currentMenuIds()
  if (allowed.size === 0) return []

  const pick = (nodes: MockMenuNode[]): MockMenuNode[] => {
    const picked: MockMenuNode[] = []
    for (const node of nodes) {
      if (!allowed.has(Number(node.id))) continue
      const clone: MockMenuNode = { ...node }
      if (node.children?.length) {
        clone.children = pick(node.children)
      }
      picked.push(clone)
    }
    picked.sort((a, b) => a.sort - b.sort)
    return picked
  }
  return pick(tree)
}

/**
 * 当前会话（非超管）的按钮行 permission 装配（对齐 UserDetailsProviderImpl.loadByUserId：
 * 经 sys_role_menu 取按钮行 → permission 字段）。仅收集，不判断角色 status（与真实后端
 * 对称：菜单/权限侧不过滤角色 status，step3b A11 实证；mock 夹具角色均启用，无差异面）。
 * 超管不用本函数（/auth/me 对超管直接返回全量权限，与后端旁路一致）。
 */
function buildMockPermissions(): string[] {
  const perms = new Set<string>()
  if (MOCK_CURRENT_SESSION.superAdmin) return [...perms]
  const allowed = currentMenuIds()
  const collect = (nodes: MockMenuNode[]): void => {
    for (const node of nodes) {
      if (allowed.has(Number(node.id)) && node.menuType === 2 && node.permission) {
        perms.add(node.permission)
      }
      if (node.children?.length) collect(node.children)
    }
  }
  collect(MOCK_MENU_TREE as MockMenuNode[])
  return [...perms]
}

// ─── 注册条目类型 ────────────────────────────────────────

export interface MockRegistration {
  method: MockMethod
  pattern: `/${string}`
  handler: MockHandler
}

// ─── 图执行 Mock 辅助（极简解释执行：仅支持 START→LLM→END 单链） ──

interface ExecuteGraphResult {
  success: boolean
  output?: string
  errorMessage?: string
  latencyMs: number
}

/**
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

// ─── Handler 实现 ─────────────────────────────────────────

export const mockRegistrations: MockRegistration[] = [
  // ── 登录/会话（双 token 契约，对齐 F1 的 TokenResponseDTO） ──
  // 登录按 username 切换当前会话：superadmin → 超管（旁路）、admin → 普通管理员（非超管，
  // 权限按角色绑定装配）、user → 普通用户（非超管，空绑定）；其他用户名回退超管。
  // mock 不校验密码（既有行为），仅用于演示/测试非超管菜单过滤语义（方向 §2.2）。
  {
    method: 'POST',
    pattern: '/api/auth/login',
    handler: (_params, _query, body) => {
      const payload = body as { username?: string; password?: string } | undefined
      const username = payload?.username ?? 'admin'
      switchMockSession(username)
      return {
        code: 0,
        message: 'ok',
        data: {
          accessToken: 'mock-access-token-' + username + '-' + Date.now(),
          expiresIn: 900,
        },
      }
    },
  },

  // ── Token 刷新（mock 模式：直接返回新 token，无需 cookie） ──
  {
    method: 'POST',
    pattern: '/api/auth/refresh',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: {
        accessToken: 'mock-refreshed-token-' + Date.now(),
        expiresIn: 900,
      },
    }),
  },

  // ── 登出（mock 模式：幂等，始终返回成功） ──
  {
    method: 'POST',
    pattern: '/api/auth/logout',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: null,
    }),
  },

  // ── 当前用户会话 ──────────────────────────────────────────
  // GET /api/system/auth/me → SessionDTO
  // 真实后端：AuthMeController 按当前登录用户装配会话（超管 → 全量 permissions；
  // 非超管 → permissions 由角色绑定按钮行装配，见 UserDetailsProviderImpl.loadByUserId）。
  // mock 对齐：superadmin（超管旁路）→ MOCK_SESSION_DATA（固定全量权限）；
  // admin（普通管理员）/ user（非超管）→ 会话快照，permissions 取该用户角色绑定中的
  // 按钮行 permission（与 /auth/menus 的过滤同源，保证按钮显隐与菜单可见性一致）。
  {
    method: 'GET',
    pattern: '/api/system/auth/me',
    handler: () => {
      if (!MOCK_CURRENT_SESSION.user.id) {
        return { code: 401, message: '未认证', data: null }
      }
      if (MOCK_CURRENT_SESSION.superAdmin) {
        return { code: 0, message: 'ok', data: MOCK_SESSION_DATA }
      }
      const session: MockSessionData = {
        ...MOCK_CURRENT_SESSION,
        permissions: buildMockPermissions(),
      }
      return { code: 0, message: 'ok', data: session }
    },
  },

  // ── 当前用户菜单 ─────────────────────────────────────────
  // GET /api/system/auth/menus → MenuNode[]
  // 真实后端（step3b 请求级实证）：超管 → 全量树；非超管 → 按用户角色绑定
  // （sys_user_role → sys_role_menu）过滤，getMenuTree 仅在父节点存在于绑定集合时
  // 才挂载子节点 —— 孤儿子节点（父不在集合）不会被挂载，无绑定 → 空树。
  // 过滤后同层按 sort 升序（与后端 Comparator 一致）。
  {
    method: 'GET',
    pattern: '/api/system/auth/menus',
    handler: () => {
      const tree = buildMockMenuTree()
      return { code: 0, message: 'ok', data: tree }
    },
  },

  // ── 字典 ──────────────────────────────────────────────────
  // GET /api/system/dict/data/list/:type
  // 响应形状：ApiResponse<DictItemDTO[]>, DictItemDTO = { code: string, label: string }
  {
    method: 'GET',
    pattern: '/api/system/dict/data/list/:type',
    handler: (params) => ({
      code: 0,
      message: 'ok',
      data: MOCK_DICT_DATA[(params as Record<string, string>).type] ?? [],
    }),
  },

  // ── 字典类型清单（设计器 DICT 绑定下拉） ────────────────────
  // POST /api/system/dict/type/page?pageNum=&pageSize=
  // 响应严格对齐后端分页原始形状 BackendPageResult<{code,name}> =
  //   { records, total, pageNum, pageSize }（foundation/dict.listDictTypes 取 records）
  {
    method: 'POST',
    pattern: '/api/system/dict/type/page',
    handler: (_params, query) => ({
      code: 0,
      message: 'ok',
      data: {
        records: MOCK_DICT_TYPES,
        total: MOCK_DICT_TYPES.length,
        pageNum: Number(query.pageNum ?? 1),
        pageSize: Number(query.pageSize ?? 1000),
      },
    }),
  },

  // ── 表单定义元信息 ────────────────────────────────────────
  // GET /api/form/def/by-key/:formKey → FormDefDTO
  {
    method: 'GET',
    pattern: '/api/form/def/by-key/:formKey',
    handler: (params) => {
      const formKey = (params as Record<string, string>).formKey
      return {
        code: 0,
        message: 'ok',
        data: {
          formKey,
          formName: formKey === DEMO_FORM_KEY ? '请假申请单' : `表单「${formKey}」`,
        },
      }
    },
  },

  // ── 表单定义 schema ───────────────────────────────────────
  // GET /api/form/def/by-key/:formKey/definition
  // 返回裸 JSON 字符串，经 form service → parseDefinition 解析为 FormSchema
  {
    method: 'GET',
    pattern: '/api/form/def/by-key/:formKey/definition',
    handler: (params) => {
      const formKey = (params as Record<string, string>).formKey
      const definition =
        formKey === DEMO_FORM_KEY
          ? MOCK_DEMO_FORM_DEFINITION
          : {
              title: `示例表单「${formKey}」`,
              fields: [
                { name: 'name', label: '申请人', type: 'TEXT', required: true },
                {
                  name: 'department',
                  label: '部门',
                  type: 'DICT',
                  dictType: 'dept',
                  required: true,
                },
                { name: 'date', label: '申请日期', type: 'DATE', required: true },
                { name: 'amount', label: '金额', type: 'NUMBER' },
                { name: 'remark', label: '备注', type: 'RICH_TEXT' },
              ],
            }
      return {
        code: 0,
        message: 'ok',
        data: JSON.stringify(definition),
      }
    },
  },

  // ── 表单提交 ──────────────────────────────────────────────
  // POST /api/form/data/:formKey
  // - 正常 ➤ code=0, data: recordId
  // - 必填 TEXT 为空 ➤ code=1401, data=null
  // - 字典值域错误 ➤ code=1403, data=null（当 leaveType 不在字典范围内）
  {
    method: 'POST',
    pattern: '/api/form/data/:formKey',
    handler: (_params, _query, body) => {
      const formKey = (_params as Record<string, string>).formKey
      const payload = body as Record<string, unknown> | undefined

      if (formKey === DEMO_FORM_KEY && payload) {
        // 1401：必填 TEXT 字段 applicant 为空
        const applicant = String(payload.applicant ?? '').trim()
        if (!applicant) {
          return { code: 1401, message: '申请人必填', data: null }
        }

        // 1403：leaveType 不在字典值域内
        const leaveType = String(payload.leaveType ?? '').trim()
        if (leaveType) {
          const validTypes: string[] = (MOCK_DICT_DATA.leave_type ?? []).map((d) => d.code)
          if (!validTypes.includes(leaveType)) {
            return { code: 1403, message: '请假类型不在字典允许范围内', data: null }
          }
        }
      }

      return {
        code: 0,
        message: 'ok',
        data: 'mock-record-' + Date.now(),
      }
    },
  },

  // ── 提交记录列表 ──────────────────────────────────────────
  // GET /api/form/submit/by-key/:formKey/list
  // 形状严格对齐 BackendPageResult<T> =
  //   { records: T[], total: number, pageNum: number, pageSize: number }
  {
    method: 'GET',
    pattern: '/api/form/submit/by-key/:formKey/list',
    handler: (_params, query) => {
      const formKey = (_params as Record<string, string>).formKey
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)

      const records =
        formKey === DEMO_FORM_KEY
          ? MOCK_DEMO_SUBMISSIONS
          : [
              {
                id: 'rec_001',
                formKey,
                applicant: '张三',
                department: '技术部',
                status: 'approved',
                submittedAt: '2026-06-20T10:00:00Z',
              },
              {
                id: 'rec_002',
                formKey,
                applicant: '李四',
                department: '产品部',
                status: 'pending',
                submittedAt: '2026-06-21T14:30:00Z',
              },
              {
                id: 'rec_003',
                formKey,
                applicant: '王五',
                department: '设计部',
                status: 'rejected',
                submittedAt: '2026-06-22T09:15:00Z',
              },
              {
                id: 'rec_004',
                formKey,
                applicant: '赵六',
                department: '技术部',
                status: 'approved',
                submittedAt: '2026-06-23T16:45:00Z',
              },
              {
                id: 'rec_005',
                formKey,
                applicant: '陈七',
                department: '人事部',
                status: 'pending',
                submittedAt: '2026-06-24T11:30:00Z',
              },
            ]

      return {
        code: 0,
        message: 'ok',
        data: {
          records,
          total: records.length,
          pageNum,
          pageSize,
        },
      }
    },
  },

  // ── 表单数据查询（页型 B 列表） ──────────────────────────────
  // POST /api/form/data/{formKey}/query
  // 请求: { pageNum, pageSize, filters: [{field, op, value}] }
  // 响应: R<PageResult<Map>> — records, total, pageNum, pageSize
  {
    method: 'POST',
    pattern: '/api/form/data/:formKey/query',
    handler: (params, _query, body) => {
      const formKey = (params as Record<string, string>).formKey
      const req = (body as Record<string, unknown>) ?? {}
      const pageNum = Number(req.pageNum ?? 1)
      const pageSize = Number(req.pageSize ?? 10)

      // demo-form 返回完整假数据；其他 formKey 返回通用假记录
      const allRecords =
        formKey === DEMO_FORM_KEY ? MOCK_FORM_DATA_RECORDS : MOCK_GENERIC_FORM_RECORDS

      // 简易过滤（按 filters 条件逐个匹配）
      const filters = (req.filters as Array<{ field: string; op: string; value: string }>) ?? []
      let filtered = allRecords
      for (const f of filters) {
        if (!f.value) continue
        filtered = filtered.filter((r) => {
          const cell = r[f.field]
          if (cell === null || cell === undefined) return false
          const strCell = String(cell)
          if (f.op === 'EQ') return strCell === f.value
          if (f.op === 'LIKE') return strCell.includes(f.value)
          // GE / LE 暂不实现 mock 级过滤（日期范围留手工验收分页）
          return true
        })
      }

      // 分页
      const start = (pageNum - 1) * pageSize
      const records = filtered.slice(start, start + pageSize)

      return {
        code: 0,
        message: 'ok',
        data: {
          records,
          total: filtered.length,
          pageNum,
          pageSize,
        },
      }
    },
  },

  // ── 表单数据：查详情（编辑回显） ────────────────────────────
  // ── 表单数据：下载模板 ─────────────────────────────────────
  // GET /api/form/data/{formKey}/template
  // 返: Blob（.xlsx 文件）
  {
    method: 'GET',
    pattern: '/api/form/data/:formKey/template',
    handler: () => {
      const denied = p32AccessGate('form:data:template')
      if (denied) return denied
      // 与真实后端对齐：第一行字段显示名 + 第二行稳定映射标识的真实 .xlsx
      const blob = buildMockXlsxBlob(MOCK_IMPORT_EXPORT_HEADERS)

      return {
        code: 0,
        message: 'ok',
        data: blob,
      }
    },
  },

  // ── 表单数据：导入 ─────────────────────────────────────────
  // POST /api/form/data/{formKey}/import
  // 请求: FormData（包含 file 字段）
  // 返: ImportResult
  {
    method: 'POST',
    pattern: '/api/form/data/:formKey/import',
    handler: (_params, _query, _body) => {
      const denied = p32AccessGate('form:data:import')
      if (denied) return denied
      // 与真实后端语义逐项对齐：
      // 1) 非 .xlsx / 缺文件 → code=1499 格式拒绝（对齐"无法解析文件"）
      // 2) 文件名含 'invalid' → 字段校验错 → 整批原子失败（successCount=0，零写入）
      // 3) 其余 → 导入成功
      const body = _body as FormData | undefined
      const file = body?.get('file') as File | null | undefined
      const filename = typeof file?.name === 'string' ? file.name : ''

      if (!file || !filename.endsWith('.xlsx')) {
        return {
          code: 1499,
          message: '导入失败: 无法解析文件：不是有效的 .xlsx 工作簿',
          data: null,
        }
      }

      if (filename.includes('invalid')) {
        return {
          code: 0,
          message: 'ok',
          data: {
            totalRows: 1,
            successCount: 0,
            errorCount: 1,
            successIds: [],
            errors: [{ rowNum: 3, message: "必填字段 'applicant' 缺失" }],
          },
        }
      }

      return {
        code: 0,
        message: 'ok',
        data: {
          totalRows: 2,
          successCount: 2,
          errorCount: 0,
          successIds: ['mock-record-1', 'mock-record-2'],
          errors: [],
        },
      }
    },
  },

  // ── 表单数据：导出 ─────────────────────────────────────────
  // POST /api/form/data/{formKey}/export
  // 请求: QueryRequest（可选）
  // 返: Blob（.xlsx 文件）
  {
    method: 'POST',
    pattern: '/api/form/data/:formKey/export',
    handler: (_params, _query, _body) => {
      const denied = p32AccessGate('form:data:export')
      if (denied) return denied
      const body = _body as { filters?: unknown[] } | undefined

      // 与真实后端对齐：返回真实 .xlsx；无匹配数据时仅含表头（空集导出语义）。
      const rows: string[][] = [[...MOCK_IMPORT_EXPORT_HEADERS[0]]]
      const hasUnmatchedFilter =
        Array.isArray(body?.filters) && (body!.filters as unknown[]).length > 0
      if (!hasUnmatchedFilter) {
        for (const record of MOCK_FORM_DATA_RECORDS) {
          rows.push(MOCK_IMPORT_EXPORT_HEADERS[1].map((key) => String(record[key] ?? '')))
        }
      }
      const blob = buildMockXlsxBlob(rows)

      return {
        code: 0,
        message: 'ok',
        data: blob,
      }
    },
  },

  // GET /api/form/data/{formKey}/{recordId}
  // 返: R<Map> 含 id / version / 审计列 / 业务字段 / 子表行（每行带 id）
  {
    method: 'GET',
    pattern: '/api/form/data/:formKey/:recordId',
    handler: (params) => {
      const { formKey, recordId } = params as Record<string, string>
      const allRecords =
        formKey === DEMO_FORM_KEY ? MOCK_FORM_DATA_RECORDS : MOCK_GENERIC_FORM_RECORDS
      const record = allRecords.find((r) => String(r.id) === recordId)
      if (!record) {
        return { code: 1507, message: '记录不存在或已被删除', data: null }
      }
      // 返回副本，将 JSON 串子表字段解析为带行 id 的数组
      const result: Record<string, unknown> = { ...record }
      for (const [key, val] of Object.entries(result)) {
        if (typeof val === 'string' && val.trim().startsWith('[')) {
          try {
            const arr = JSON.parse(val) as Record<string, unknown>[]
            result[key] = arr.map((item, idx) => ({
              id: `${recordId}_row_${idx + 1}`,
              ...item,
            }))
          } catch {
            /* 非 JSON 串则保留原值 */
          }
        }
      }
      return { code: 0, message: 'ok', data: result }
    },
  },

  // ── 表单数据：更新记录 ─────────────────────────────────────
  // PUT /api/form/data/{formKey}/{recordId}
  // ← { data, version, subTableRows } → R<Void>
  // 错误码: 1507 记录不存在 · 1508 版本冲突
  {
    method: 'PUT',
    pattern: '/api/form/data/:formKey/:recordId',
    handler: (params, _query, body) => {
      const { formKey, recordId } = params as Record<string, string>
      const { version: reqVersion } = (body as { version?: number }) ?? {}
      const allRecords =
        formKey === DEMO_FORM_KEY ? MOCK_FORM_DATA_RECORDS : MOCK_GENERIC_FORM_RECORDS
      const record = allRecords.find((r) => String(r.id) === recordId)
      if (!record) {
        return { code: 1507, message: '记录不存在或已被删除', data: null }
      }
      const currentVersion = (record.version as number) ?? 1
      if (reqVersion !== undefined && reqVersion !== currentVersion) {
        return { code: 1508, message: '版本冲突，请刷新后重试', data: null }
      }
      // mock: 更新成功，版本号 +1
      record.version = currentVersion + 1
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 表单定义：新建草稿 ───────────────────────────────────
  // POST /api/form/def
  // 入参: { formKey, name }  返: FormDefDTO{ id, formKey, status }
  {
    method: 'POST',
    pattern: '/api/form/def',
    handler: (_params, _query, body) => {
      const req = body as { formKey?: string; name?: string }
      const id = 'mock-def-' + Date.now()
      const formKey = req.formKey ?? 'form_' + Date.now()
      const name = req.name ?? '未命名表单'

      MOCK_FORM_DEF_STORE.set(id, {
        id,
        formKey,
        name,
        status: 'DRAFT',
        definition: JSON.stringify({ title: name, fields: [] }),
      })

      return {
        code: 0,
        message: 'ok',
        data: { id, formKey, name, status: 'DRAFT' },
      }
    },
  },

  // ── 表单定义：保存 config ─────────────────────────────────
  // POST /api/form/def/:id/config
  // 入参: { definition: string }  返: void
  {
    method: 'POST',
    pattern: '/api/form/def/:id/config',
    handler: (params, _query, body) => {
      const id = (params as Record<string, string>).id
      const req = body as { definition?: string }
      const existing = MOCK_FORM_DEF_STORE.get(id)

      if (!existing) {
        return { code: 1500, message: '表单不存在', data: null }
      }

      existing.definition = req.definition ?? existing.definition
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 表单定义：取 definition ────────────────────────────────
  // GET /api/form/def/:id/definition
  // 返: R<String>（definition JSON 字符串）
  {
    method: 'GET',
    pattern: '/api/form/def/:id/definition',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const existing = MOCK_FORM_DEF_STORE.get(id)

      if (!existing) {
        return {
          code: 0,
          message: 'ok',
          data: JSON.stringify({ title: '未命名表单', fields: [] }),
        }
      }

      return { code: 0, message: 'ok', data: existing.definition }
    },
  },

  // ── 表单定义：发布 ────────────────────────────────────────
  // POST /api/form/def/:id/publish
  // 返: FormDefDTO（status=PUBLISHED）
  // 模拟校验：非法列名（以数字开头）→ 1204
  {
    method: 'POST',
    pattern: '/api/form/def/:id/publish',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const existing = MOCK_FORM_DEF_STORE.get(id)

      if (!existing) {
        return { code: 1500, message: '表单不存在', data: null }
      }

      // 简易 mock 校验：检查 definition 中是否有以数字开头的字段名
      try {
        const def = JSON.parse(existing.definition) as {
          title: string
          fields: Array<{ name: string; type: string }>
        }
        for (const field of def.fields) {
          if (/^\d/.test(field.name)) {
            return {
              code: 1204,
              message: `字段名 "${field.name}" 不合法（仅允许字母/数字/下划线，且不能以数字开头）`,
              data: null,
            }
          }
          // DICT 未绑定 dictType
          if (field.type === 'DICT' && !(field as { dictType?: string }).dictType) {
            return {
              code: 1206,
              message: `字典字段 "${field.name}" 未绑定字典类型`,
              data: null,
            }
          }
          // REFERENCE 未指定 targetFormId
          if (field.type === 'REFERENCE' && !(field as { targetFormId?: string }).targetFormId) {
            return {
              code: 1207,
              message: `引用字段 "${field.name}" 未指定目标表单`,
              data: null,
            }
          }
          // TABLE 无子列
          if (
            field.type === 'TABLE' &&
            (!(field as { subFields?: unknown[] }).subFields ||
              (field as { subFields?: unknown[] }).subFields!.length === 0)
          ) {
            return {
              code: 1208,
              message: `子表格字段 "${field.name}" 未定义子列`,
              data: null,
            }
          }
        }
      } catch {
        // JSON 非法时也返回校验失败
      }

      existing.status = 'PUBLISHED'
      return {
        code: 0,
        message: 'ok',
        data: {
          id: existing.id,
          formKey: existing.formKey,
          name: existing.name,
          status: 'PUBLISHED',
        },
      }
    },
  },

  // ── 表单定义分页列表 ──────────────────────────────────────
  // GET /api/form/def/page?pageNum=&pageSize=&keyword=
  // 返 BackendPageResult<FormDefListItem>（records/total/pageNum/pageSize）
  // 排序 update_time DESC（mock 按种子定义顺序模拟）
  // 临时数据，上线后由后端真实数据替换。
  {
    method: 'GET',
    pattern: '/api/form/def/page',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const keyword = String(query.keyword ?? '').trim()

      // 从共享 store 读取所有条目，填充列表额外字段
      const now = '2026-06-30 10:00:00'
      let all = Array.from(MOCK_FORM_DEF_STORE.values()).map((item) => ({
        id: item.id,
        formKey: item.formKey,
        name: item.name,
        logicalTableName: '',
        status: item.status,
        physicalTableName: '',
        formVersion: 1,
        description: '',
        createTime: now,
        updateTime: now,
      }))

      // keyword 过滤
      if (keyword) {
        all = all.filter((i) => i.name.includes(keyword) || i.formKey.includes(keyword))
      }

      // 按 updateTime DESC（mock 按 name 逆序模拟）
      all.sort((a, b) => b.name.localeCompare(a.name))

      const total = all.length
      const start = (pageNum - 1) * pageSize
      const records = all.slice(start, start + pageSize)

      return {
        code: 0,
        message: 'ok',
        data: { records, total, pageNum, pageSize },
      }
    },
  },

  // ── 待办任务：当前用户待办分页列表 ─────────────────────
  {
    method: 'GET',
    pattern: '/api/workflow/tasks/todo',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const total = MOCK_TODO_TASKS.length
      const start = (pageNum - 1) * pageSize
      const records = MOCK_TODO_TASKS.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },

  // ── 待办任务：查询任务详情 ─────────────────────────────
  {
    method: 'GET',
    pattern: '/api/workflow/tasks/:taskId',
    handler: (params) => {
      const { taskId } = params as Record<string, string>
      const task = MOCK_TODO_TASKS.find((t) => t.taskId === taskId)
      if (!task) {
        return { code: 404, message: '任务不存在', data: null }
      }

      // 根据 processInstanceId 获取对应的审批历史（从 MOCK_INSTANCE_DETAILS 的 flowTrace 提取 userTask）
      const instanceDetail = MOCK_INSTANCE_DETAILS[task.processInstanceId]
      const approvalHistory = instanceDetail
        ? instanceDetail.flowTrace
            .filter((node) => node.activityType === 'userTask' && node.endTime != null)
            .map((node) => ({
              taskId: node.taskId ?? '',
              taskName: node.activityName ?? '',
              assignee: node.assignee ?? '',
              createTime: node.startTime ?? '',
              endTime: node.endTime,
              approvalResult: 'APPROVED' as const, // 已完成的节点默认为通过
            }))
        : []

      return {
        code: 0,
        message: 'ok',
        data: {
          taskId: task.taskId,
          taskName: task.processName + '审批',
          processInstanceId: task.processInstanceId,
          processDefinitionKey: 'skeleton_approval',
          processName: task.processName,
          formKey: task.formKey,
          businessKey: task.businessKey,
          assignee: '2',
          initiatorId: 1,
          createTime: task.createTime,
          processVariables: { formKey: task.formKey },
          approvalHistory,
        },
      }
    },
  },

  // ── 待办任务：完成审批 ─────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/workflow/tasks/:taskId/complete',
    handler: (params) => {
      const { taskId } = params as Record<string, string>
      const idx = MOCK_TODO_TASKS.findIndex((t) => t.taskId === taskId)
      if (idx === -1) {
        return { code: 404, message: '任务不存在', data: null }
      }
      MOCK_TODO_TASKS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 待办任务：驳回 ───────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/workflow/tasks/:taskId/reject',
    handler: (params) => {
      const { taskId } = params as Record<string, string>
      const idx = MOCK_TODO_TASKS.findIndex((t) => t.taskId === taskId)
      if (idx === -1) {
        return { code: 404, message: '任务不存在', data: null }
      }
      MOCK_TODO_TASKS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 已办任务：当前用户已办分页列表 ─────────────────────
  {
    method: 'GET',
    pattern: '/api/workflow/tasks/processed',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const total = MOCK_PROCESSED_TASKS.length
      const start = (pageNum - 1) * pageSize
      const records = MOCK_PROCESSED_TASKS.slice(start, start + pageSize)
      return {
        code: 0,
        message: 'ok',
        data: { records, total, pageNum, pageSize },
      }
    },
  },

  // ── 流程定义：创建 ──
  // POST /api/workflow/defs → R<CreateProcessDefResponse>
  {
    method: 'POST',
    pattern: '/api/workflow/defs',
    handler: (_params, _query, body) => {
      const req = body as { name?: string; formKey?: string }
      if (!req.name || !req.formKey) {
        return { code: 400, message: '流程名称和表单标识不能为空', data: null }
      }
      const newId = Math.max(...MOCK_PROCESS_DEFS.map((d) => d.id), 0) + 1
      const processKey = `bpm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const newDef = {
        id: newId,
        processKey,
        name: req.name,
        formKey: req.formKey,
        defVersion: 1,
        status: 'DRAFT' as const,
        createTime: now,
        updateTime: now,
      }
      MOCK_PROCESS_DEFS.unshift(newDef)
      return {
        code: 0,
        message: 'ok',
        data: {
          defId: newId,
          graph: { processKey, name: req.name, formKey: req.formKey, elements: [] },
        },
      }
    },
  },

  // ── 流程定义：分页列表 ─────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/workflow/defs',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const total = MOCK_PROCESS_DEFS.length
      const start = (pageNum - 1) * pageSize
      const records = MOCK_PROCESS_DEFS.slice(start, start + pageSize)
      return {
        code: 0,
        message: 'ok',
        data: { records, total, pageNum, pageSize },
      }
    },
  },

  // ── 流程定义：获取 BPMN XML 流程图（增强版：含 userTask 节点，支持高亮演示） ──
  // GET /api/workflow/defs/:id/bpmn-xml → R<String>
  // DRAFT 状态返回 code=2104 (PROCESS_NOT_PUBLISHED)
  {
    method: 'GET',
    pattern: '/api/workflow/defs/:id/bpmn-xml',
    handler: (params) => {
      const defId = Number((params as Record<string, string>).id)
      const def = MOCK_PROCESS_DEFS.find((d) => d.id === defId)
      if (!def || def.status === 'DRAFT') {
        return { code: 2104, message: '流程定义未发布，无法获取流程图', data: null }
      }
      // 返回含 3 个 userTask 的模拟审批流程 BPMN XML（activityId 与 mock seeds 中 MOCK_INSTANCE_DETAILS 的 activityId 对齐）
      const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="${def.processKey}" name="${def.name}" isExecutable="true">
    <startEvent id="StartEvent_1" name="开始" />
    <userTask id="Activity_submit" name="提交申请" />
    <userTask id="Activity_approve1" name="部门经理审批" />
    <userTask id="Activity_approve2" name="HR 审批" />
    <endEvent id="EndEvent_1" name="结束" />
    <sequenceFlow id="Flow_start2submit" sourceRef="StartEvent_1" targetRef="Activity_submit" />
    <sequenceFlow id="Flow_submit2approve1" sourceRef="Activity_submit" targetRef="Activity_approve1" />
    <sequenceFlow id="Flow_approve1_2approve2" sourceRef="Activity_approve1" targetRef="Activity_approve2" />
    <sequenceFlow id="Flow_approve2_2end" sourceRef="Activity_approve2" targetRef="EndEvent_1" />
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${def.processKey}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_submit_di" bpmnElement="Activity_submit">
        <dc:Bounds x="260" y="95" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_approve1_di" bpmnElement="Activity_approve1">
        <dc:Bounds x="420" y="95" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_approve2_di" bpmnElement="Activity_approve2">
        <dc:Bounds x="580" y="95" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="740" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="flow1_di" bpmnElement="Flow_start2submit">
        <di:waypoint x="216" y="138" />
        <di:waypoint x="260" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow2_di" bpmnElement="Flow_submit2approve1">
        <di:waypoint x="360" y="135" />
        <di:waypoint x="420" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow3_di" bpmnElement="Flow_approve1_2approve2">
        <di:waypoint x="520" y="135" />
        <di:waypoint x="580" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow4_di" bpmnElement="Flow_approve2_2end">
        <di:waypoint x="680" y="135" />
        <di:waypoint x="740" y="138" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`
      return { code: 0, message: 'ok', data: bpmnXml }
    },
  },

  // ── 流程定义：删除（仅 DRAFT 状态可删除） ──
  // DELETE /api/workflow/defs/:id → R<Void>
  // 非 DRAFT 状态返回 code=2105 (PROCESS_DEF_NOT_DELETABLE)
  {
    method: 'DELETE',
    pattern: '/api/workflow/defs/:id',
    handler: (params) => {
      const defId = Number((params as Record<string, string>).id)
      const idx = MOCK_PROCESS_DEFS.findIndex((d) => d.id === defId)
      if (idx === -1) {
        return { code: 404, message: '流程定义不存在', data: null }
      }
      if (MOCK_PROCESS_DEFS[idx].status !== 'DRAFT') {
        return { code: 2105, message: '只有草稿状态的流程定义可以删除', data: null }
      }
      MOCK_PROCESS_DEFS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 流程定义：发布（DRAFT → PUBLISHED） ──
  // POST /api/workflow/defs/:id/publish → R<ProcessDef>
  // 仅 DRAFT 状态可发布；已发布返回 code=2104
  {
    method: 'POST',
    pattern: '/api/workflow/defs/:id/publish',
    handler: (params) => {
      const defId = Number((params as Record<string, string>).id)
      const def = MOCK_PROCESS_DEFS.find((d) => d.id === defId)
      if (!def) {
        return { code: 404, message: '流程定义不存在', data: null }
      }
      if (def.status !== 'DRAFT') {
        return { code: 2104, message: '流程定义已发布，无法重复发布', data: null }
      }
      def.status = 'PUBLISHED'
      def.updateTime = new Date().toISOString().slice(0, 19).replace('T', ' ')
      return { code: 0, message: 'ok', data: def }
    },
  },

  // ── 流程定义：保存草稿图 ──
  // PUT /api/workflow/defs/:id/graph → R<Void>
  {
    method: 'PUT',
    pattern: '/api/workflow/defs/:id/graph',
    handler: (params) => {
      const defId = Number((params as Record<string, string>).id)
      const def = MOCK_PROCESS_DEFS.find((d) => d.id === defId)
      if (!def) {
        return { code: 404, message: '流程定义不存在', data: null }
      }
      if (def.status !== 'DRAFT') {
        return { code: 2104, message: '已发布的流程定义无法修改', data: null }
      }
      def.updateTime = new Date().toISOString().slice(0, 19).replace('T', ' ')
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 通知消息：当前用户通知列表（支持 read/keyword 过滤） ──
  {
    method: 'GET',
    pattern: '/api/notify/messages',
    handler: (_params, query) => {
      let result = [...MOCK_NOTIFY_MESSAGES]
      // 过滤已读状态
      const readParam = (query as Record<string, string>)?.read
      if (readParam !== undefined && readParam !== '') {
        const readFilter = readParam === 'true'
        result = result.filter((m) => m.read === readFilter)
      }
      // 过滤关键词（匹配标题或内容）
      const keyword = (query as Record<string, string>)?.keyword
      if (keyword) {
        const kw = keyword.toLowerCase()
        result = result.filter(
          (m) => m.title.toLowerCase().includes(kw) || m.content.toLowerCase().includes(kw),
        )
      }
      return { code: 0, message: 'ok', data: result }
    },
  },

  // ── 通知消息：标记已读 ──────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/notify/messages/:id/read',
    handler: (params) => {
      const msg = MOCK_NOTIFY_MESSAGES.find(
        (m) => m.id === Number((params as Record<string, string>).id),
      )
      if (msg) {
        msg.read = true
      }
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 通知消息：删除通知 ──────────────────────────────────
  {
    method: 'DELETE',
    pattern: '/api/notify/messages/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_NOTIFY_MESSAGES.findIndex((m) => m.id === id)
      if (idx !== -1) {
        MOCK_NOTIFY_MESSAGES.splice(idx, 1)
      }
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ══ 消息模板（P36 / M05-F02-01）═════════════════════════
  // 渲染语义与真实后端一致：仅 ${var} 简单替换；缺变量/非法占位符/停用
  // 返回与后端相同的错误语义（code=400/404 + 明确消息），不静默降级。

  // ── 分页列表（keyword 匹配代码/名称，enabled 过滤） ──
  {
    method: 'GET',
    pattern: '/api/notify/templates',
    handler: (_params, query) => {
      const q = query as Record<string, string>
      const pageNum = Number(q.pageNum ?? 1)
      const pageSize = Number(q.pageSize ?? 10)
      let result = [...MOCK_NOTIFY_TEMPLATES]
      const keyword = q.keyword
      if (keyword) {
        const kw = keyword.toLowerCase()
        result = result.filter(
          (t) => t.templateCode.toLowerCase().includes(kw) || t.name.toLowerCase().includes(kw),
        )
      }
      if (q.enabled !== undefined && q.enabled !== '') {
        const enabledFilter = q.enabled === 'true'
        result = result.filter((t) => t.enabled === enabledFilter)
      }
      result.sort((a, b) => b.id - a.id)
      const total = result.length
      const start = (pageNum - 1) * pageSize
      return {
        code: 0,
        message: 'ok',
        data: { records: result.slice(start, start + pageSize), total, pageNum, pageSize },
      }
    },
  },

  // ── 详情 ──
  {
    method: 'GET',
    pattern: '/api/notify/templates/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const t = MOCK_NOTIFY_TEMPLATES.find((x) => x.id === id)
      if (!t) return { code: 404, message: '消息模板不存在', data: null }
      return { code: 0, message: 'ok', data: t }
    },
  },

  // ── 新建（代码唯一校验 + 占位符合法性，与后端同规则） ──
  {
    method: 'POST',
    pattern: '/api/notify/templates',
    handler: (_params, _query, body) => {
      const b = (body ?? {}) as Record<string, unknown>
      const code = String(b.templateCode ?? '')
      const name = String(b.name ?? '')
      const titleTemplate = String(b.titleTemplate ?? '')
      const contentTemplate = String(b.contentTemplate ?? '')
      if (!code || !name || !titleTemplate || !contentTemplate) {
        return { code: 400, message: '模板代码/名称/标题模板/正文模板不能为空', data: null }
      }
      if (!/^[A-Za-z][A-Za-z0-9_]{1,98}$/.test(code)) {
        return {
          code: 400,
          message: '模板代码须为字母开头、仅字母/数字/下划线、长度2-99',
          data: null,
        }
      }
      for (const tpl of [titleTemplate, contentTemplate]) {
        const bad = extractInvalidPlaceholder(tpl)
        if (bad) return { code: 400, message: `非法占位符: \${${bad}}`, data: null }
      }
      if (MOCK_NOTIFY_TEMPLATES.some((t) => t.templateCode === code)) {
        return { code: 400, message: `模板代码已存在: ${code}`, data: null }
      }
      const now = new Date().toISOString()
      const nextId = Math.max(...MOCK_NOTIFY_TEMPLATES.map((t) => t.id)) + 1
      MOCK_NOTIFY_TEMPLATES.push({
        id: nextId,
        templateCode: code,
        name,
        titleTemplate,
        contentTemplate,
        enabled: b.enabled !== false,
        remark: typeof b.remark === 'string' ? b.remark : null,
        createTime: now,
        updateTime: now,
      })
      return { code: 0, message: 'ok', data: nextId }
    },
  },

  // ── 编辑（templateCode 不可变更） ──
  {
    method: 'PUT',
    pattern: '/api/notify/templates/:id',
    handler: (params, _query, body) => {
      const id = Number((params as Record<string, string>).id)
      const t = MOCK_NOTIFY_TEMPLATES.find((x) => x.id === id)
      if (!t) return { code: 404, message: '消息模板不存在', data: null }
      const b = (body ?? {}) as Record<string, unknown>
      const code = String(b.templateCode ?? t.templateCode)
      if (code !== t.templateCode) {
        return { code: 400, message: `模板代码不可变更: ${t.templateCode}`, data: null }
      }
      const name = String(b.name ?? '')
      const titleTemplate = String(b.titleTemplate ?? '')
      const contentTemplate = String(b.contentTemplate ?? '')
      if (!name || !titleTemplate || !contentTemplate) {
        return { code: 400, message: '名称/标题模板/正文模板不能为空', data: null }
      }
      for (const tpl of [titleTemplate, contentTemplate]) {
        const bad = extractInvalidPlaceholder(tpl)
        if (bad) return { code: 400, message: `非法占位符: \${${bad}}`, data: null }
      }
      t.name = name
      t.titleTemplate = titleTemplate
      t.contentTemplate = contentTemplate
      t.enabled =
        b.enabled !== false && b.enabled !== undefined ? Boolean(b.enabled) : Boolean(b.enabled)
      if (typeof b.remark === 'string') t.remark = b.remark
      t.updateTime = new Date().toISOString()
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 删除（幂等） ──
  {
    method: 'DELETE',
    pattern: '/api/notify/templates/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_NOTIFY_TEMPLATES.findIndex((t) => t.id === id)
      if (idx !== -1) MOCK_NOTIFY_TEMPLATES.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 启停 ──
  {
    method: 'PUT',
    pattern: '/api/notify/templates/:id/toggle',
    handler: (params, query) => {
      const id = Number((params as Record<string, string>).id)
      const t = MOCK_NOTIFY_TEMPLATES.find((x) => x.id === id)
      if (!t) return { code: 404, message: '消息模板不存在', data: null }
      const enabled = (query as Record<string, string>).enabled === 'true'
      t.enabled = enabled
      t.updateTime = new Date().toISOString()
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 预览（与发送同一渲染函数：renderMockTemplate） ──
  {
    method: 'POST',
    pattern: '/api/notify/templates/preview',
    handler: (_params, _query, body) => {
      const b = (body ?? {}) as Record<string, unknown>
      const titleTemplate = String(b.titleTemplate ?? '')
      const contentTemplate = String(b.contentTemplate ?? '')
      if (!titleTemplate.trim() || !contentTemplate.trim()) {
        return { code: 400, message: '标题/正文模板不能为空', data: null }
      }
      const variables = (b.variables ?? {}) as Record<string, string>
      try {
        const title = renderMockTemplate(titleTemplate, variables)
        const content = renderMockTemplate(contentTemplate, variables)
        return { code: 0, message: 'ok', data: { title, content } }
      } catch (e) {
        return { code: 400, message: e instanceof Error ? e.message : '渲染失败', data: null }
      }
    },
  },

  // ── 按模板代码预览（先 requireEnabledByCode 可用性检查再渲染，方向 §8 标准 2） ──
  // 停用/删除/不存在 → 404「模板不存在或未启用」，与发送链路同源；
  // 纯内容预览场景仍走 POST /preview（编辑页草稿渲染，不做可用性检查）
  {
    method: 'POST',
    pattern: '/api/notify/templates/:code/preview',
    handler: (params, _query, body) => {
      const code = String((params as Record<string, string>).code ?? '')
      const t = MOCK_NOTIFY_TEMPLATES.find((x) => x.templateCode === code)
      if (!t || !t.enabled) {
        return { code: 404, message: `模板不存在或未启用: ${code}`, data: null }
      }
      const b = (body ?? {}) as Record<string, unknown>
      const variables = (b.variables ?? {}) as Record<string, string>
      try {
        const title = renderMockTemplate(t.titleTemplate, variables)
        const content = renderMockTemplate(t.contentTemplate, variables)
        return { code: 0, message: 'ok', data: { title, content } }
      } catch (e) {
        return { code: 400, message: e instanceof Error ? e.message : '渲染失败', data: null }
      }
    },
  },

  // ── 发送（落库进收件箱；失败原子性：先渲染成功才 push） ──
  {
    method: 'POST',
    pattern: '/api/notify/templates/send',
    handler: (_params, _query, body) => {
      const b = (body ?? {}) as Record<string, unknown>
      const templateCode = String(b.templateCode ?? '')
      const recipientId = Number(b.recipientId)
      if (!recipientId) return { code: 400, message: '接收人不能为空', data: null }
      const t = MOCK_NOTIFY_TEMPLATES.find((x) => x.templateCode === templateCode)
      if (!t || !t.enabled) {
        return { code: 404, message: `模板不存在或未启用: ${templateCode}`, data: null }
      }
      const variables = (b.variables ?? {}) as Record<string, string>
      let title: string
      let content: string
      try {
        title = renderMockTemplate(t.titleTemplate, variables)
        content = renderMockTemplate(t.contentTemplate, variables)
      } catch (e) {
        return { code: 400, message: e instanceof Error ? e.message : '渲染失败', data: null }
      }
      // 落库（渲染结果即最终内容）
      MOCK_NOTIFY_MESSAGES.push({
        id: Date.now(),
        recipientId,
        title,
        content,
        bizType: 'SYSTEM',
        bizId: t.templateCode,
        read: false,
        createTime: new Date().toISOString(),
        createBy: null,
        updateTime: new Date().toISOString(),
        updateBy: null,
        tenantId: 1,
      })
      return { code: 0, message: 'ok', data: Date.now() }
    },
  },

  // ── 解析批量发送接收人数（对齐后端 POST /api/notify/messages/resolve-count） ──
  // 权限：与 batch-send 一致（notify:batch:send）。
  {
    method: 'POST',
    pattern: '/api/notify/messages/resolve-count',
    handler: (_params, _query, body) => {
      const b = (body ?? {}) as Record<string, unknown>

      if (!MOCK_CURRENT_SESSION.user.id) {
        return { code: 401, message: '未认证', data: null }
      }

      // 权限检查
      if (!MOCK_CURRENT_SESSION.superAdmin) {
        const perms = buildMockPermissions()
        if (!perms.includes('notify:batch:send')) {
          return { code: 403, message: '无权限', data: null }
        }
      }

      // 解析接收对象（与 batch-send 相同逻辑，不做递归展开）
      const recipientUserIds = Array.isArray(b.recipientUserIds)
        ? b.recipientUserIds.map(Number)
        : []
      const recipientDeptIds = Array.isArray(b.recipientDeptIds)
        ? b.recipientDeptIds.map(Number)
        : []
      const recipientRoleCodes = Array.isArray(b.recipientRoleCodes)
        ? b.recipientRoleCodes.map(String)
        : []

      const hitByUser = new Set<string>()
      for (const uid of recipientUserIds) {
        hitByUser.add(String(uid))
      }

      const deptIdSet = new Set(recipientDeptIds.map(String))
      for (const user of MOCK_USERS_LIST) {
        if (deptIdSet.has(user.deptId) && user.status === 0) {
          hitByUser.add(String(user.id))
        }
      }

      for (const roleCode of recipientRoleCodes) {
        const role = MOCK_ROLES_LIST.find((r) => r.code === roleCode)
        if (!role) continue
        for (const user of MOCK_USERS_LIST) {
          if (user.roleIds.includes(role.id) && user.status === 0) {
            hitByUser.add(String(user.id))
          }
        }
      }

      return {
        code: 0,
        data: { recipientCount: hitByUser.size },
        message: 'success',
      }
    },
  },

  // ── 批量发送（对齐后端 POST /api/notify/messages/batch-send） ──
  // 权限：需 notify:batch:send（独立发送权限，不复用模板管理权限）。
  // 接收人解析：userId/deptId/roleCode 三种维度交叉去重。
  // 空接收人 / 超500人 / 直接内容与模板互斥 / 模板不存在或停用 → 业务拒绝。
  {
    method: 'POST',
    pattern: '/api/notify/messages/batch-send',
    handler: (_params, _query, body) => {
      const b = (body ?? {}) as Record<string, unknown>

      if (!MOCK_CURRENT_SESSION.user.id) {
        return { code: 401, message: '未认证', data: null }
      }

      // 权限检查：当前会话需有 notify:batch:send
      if (!MOCK_CURRENT_SESSION.superAdmin) {
        const perms = buildMockPermissions()
        if (!perms.includes('notify:batch:send')) {
          return { code: 403, message: '无权限执行批量发送', data: null }
        }
      }

      // 内容模式互斥校验
      const hasDirect = Boolean(b.title && b.content)
      const hasTemplate = Boolean(b.templateCode)
      if (hasDirect === hasTemplate) {
        return {
          code: 400,
          message: '必须选择直接内容模式或模板模式，且只能选一种',
          data: null,
        }
      }

      // 解析接收对象（三种维度交叉去重）
      const recipientUserIds = Array.isArray(b.recipientUserIds)
        ? b.recipientUserIds.map(Number)
        : []
      const recipientDeptIds = Array.isArray(b.recipientDeptIds)
        ? b.recipientDeptIds.map(Number)
        : []
      const recipientRoleCodes = Array.isArray(b.recipientRoleCodes)
        ? b.recipientRoleCodes.map(String)
        : []

      if (
        recipientUserIds.length === 0 &&
        recipientDeptIds.length === 0 &&
        recipientRoleCodes.length === 0
      ) {
        return { code: 400, message: '接收人不能为空', data: null }
      }

      // 按 userId 直接命中
      const hitByUser = new Set<string>()
      for (const uid of recipientUserIds) {
        hitByUser.add(String(uid))
      }

      // 按 deptId 命中：只匹配直接提交的部门 ID，不做递归展开
      // （语义锁定：单个 deptId 只代表该部门本身；前端需显式提交子部门 IDs）
      const deptIdSet = new Set(recipientDeptIds.map(String))
      for (const user of MOCK_USERS_LIST) {
        if (deptIdSet.has(user.deptId) && user.status === 0) {
          hitByUser.add(String(user.id))
        }
      }

      // 按 roleCode 命中：先查角色 id，再查用户
      for (const roleCode of recipientRoleCodes) {
        const role = MOCK_ROLES_LIST.find((r) => r.code === roleCode)
        if (!role) continue
        for (const user of MOCK_USERS_LIST) {
          if (user.roleIds.includes(role.id) && user.status === 0) {
            hitByUser.add(String(user.id))
          }
        }
      }

      if (hitByUser.size === 0) {
        return { code: 400, message: '接收人为空（无匹配的有效用户）', data: null }
      }

      // 超 500 人拒绝
      if (hitByUser.size > 500) {
        return { code: 400, message: '接收人数超过上限（500人）', data: null }
      }

      // 模板模式：渲染
      let title: string
      let content: string
      if (hasTemplate) {
        const templateCode = String(b.templateCode ?? '')
        const t = MOCK_NOTIFY_TEMPLATES.find((x) => x.templateCode === templateCode)
        if (!t || !t.enabled) {
          return { code: 404, message: `模板不存在或未启用: ${templateCode}`, data: null }
        }
        const variables = (b.variables ?? {}) as Record<string, string>
        try {
          title = renderMockTemplate(t.titleTemplate, variables)
          content = renderMockTemplate(t.contentTemplate, variables)
        } catch (e) {
          return { code: 400, message: e instanceof Error ? e.message : '渲染失败', data: null }
        }
      } else {
        title = String(b.title ?? '')
        content = String(b.content ?? '')
      }

      // 落库：为每个去重后的接收人写一条通知
      for (const uid of hitByUser) {
        MOCK_NOTIFY_MESSAGES.push({
          id: Date.now() + Math.random(),
          recipientId: Number(uid),
          title,
          content,
          bizType: 'SYSTEM',
          bizId: null,
          read: false,
          createTime: new Date().toISOString(),
          createBy: null,
          updateTime: new Date().toISOString(),
          updateBy: null,
          tenantId: 1,
        })
      }

      return { code: 0, message: 'ok', data: { recipientCount: hitByUser.size } }
    },
  },

  // ── 用户管理 CRUD ──────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/system/user/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = [...MOCK_USERS_LIST]
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        const keyword = String(f.keyword ?? f.username ?? f.realName ?? '')
        if (keyword)
          list = list.filter((u) => u.username.includes(keyword) || u.realName.includes(keyword))
        if (f.status !== undefined && f.status !== null && f.status !== '')
          list = list.filter((u) => u.status === Number(f.status))
        if (f.deptId !== undefined && f.deptId !== null && f.deptId !== '') {
          const root = String(f.deptId)
          const children = new Set([root])
          let changed = true
          while (changed) {
            changed = false
            for (const dept of MOCK_DEPTS_LIST) {
              if (children.has(dept.parentId) && !children.has(dept.id)) {
                children.add(dept.id)
                changed = true
              }
            }
          }
          list = list.filter((u) => children.has(u.deptId))
        }
        if (f.postId) list = list.filter((u) => u.postIds?.includes(String(f.postId)))
        if (f.roleId) list = list.filter((u) => u.roleIds?.includes(String(f.roleId)))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const user = MOCK_USERS_LIST.find((u) => u.id === id)
      if (!user) return { code: 404, message: '用户不存在', data: null }
      return { code: 0, message: 'ok', data: { ...user } }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/user',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = String(Date.now())
      const newUser = {
        id,
        username: String(data.username ?? ''),
        realName: String(data.realName ?? ''),
        email: String(data.email ?? ''),
        phone: String(data.phone ?? ''),
        sex: Number(data.sex ?? 0),
        status: Number(data.status ?? 0),
        deptId: String(data.deptId ?? ''),
        roleIds: Array.isArray(data.roleIds) ? data.roleIds.map(String) : [],
        postIds: Array.isArray(data.postIds) ? data.postIds.map(String) : [],
        isAdmin: false,
        avatar: null,
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_USERS_LIST.push(newUser as (typeof MOCK_USERS_LIST)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_USERS_LIST.findIndex((u) => u.id === String(data.id))
      if (idx === -1) return { code: 404, message: '用户不存在', data: null }
      const existing = MOCK_USERS_LIST[idx]
      MOCK_USERS_LIST[idx] = {
        ...existing,
        username: String(data.username ?? existing.username),
        realName: String(data.realName ?? existing.realName),
        email: String(data.email ?? existing.email),
        phone: String(data.phone ?? existing.phone),
        sex: data.sex !== undefined ? Number(data.sex) : existing.sex,
        status: data.status !== undefined ? Number(data.status) : existing.status,
        deptId: data.deptId !== undefined ? String(data.deptId) : existing.deptId,
        roleIds: Array.isArray(data.roleIds) ? data.roleIds.map(String) : existing.roleIds,
        postIds: Array.isArray(data.postIds) ? data.postIds.map(String) : existing.postIds,
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/user/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const idx = MOCK_USERS_LIST.findIndex((u) => u.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_USERS_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user/:id/roles',
    handler: (params) => {
      const user = MOCK_USERS_LIST.find(
        (u) => u.id === String((params as Record<string, string>).id),
      )
      return user
        ? { code: 0, message: 'ok', data: [...(user.roleIds ?? [])] }
        : { code: 404, message: '用户不存在', data: null }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user/:id/roles',
    handler: (params, _query, body) => {
      const user = MOCK_USERS_LIST.find(
        (u) => u.id === String((params as Record<string, string>).id),
      )
      const roleIds = Array.isArray(body) ? body.map(String) : []
      if (roleIds.includes('1')) return { code: 403, message: '不能绑定 superadmin', data: null }
      if (!user) return { code: 404, message: '用户不存在', data: null }
      user.roleIds = roleIds
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user/:id/posts',
    handler: (params) => {
      const user = MOCK_USERS_LIST.find(
        (u) => u.id === String((params as Record<string, string>).id),
      )
      return user
        ? { code: 0, message: 'ok', data: [...(user.postIds ?? [])] }
        : { code: 404, message: '用户不存在', data: null }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user/:id/posts',
    handler: (params, _query, body) => {
      const user = MOCK_USERS_LIST.find(
        (u) => u.id === String((params as Record<string, string>).id),
      )
      if (!user) return { code: 404, message: '用户不存在', data: null }
      user.postIds = Array.isArray(body) ? body.map(String) : []
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 用户组管理 CRUD（D112：P28/I36） ────────────────────────
  {
    method: 'POST',
    pattern: '/api/system/user-group/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = [...MOCK_USER_GROUPS_LIST]
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.groupCode) list = list.filter((g) => g.groupCode.includes(String(f.groupCode)))
        if (f.groupName) list = list.filter((g) => g.groupName.includes(String(f.groupName)))
        if (f.status !== undefined && f.status !== null && f.status !== '')
          list = list.filter((g) => g.status === Number(f.status))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user-group/:id',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const group = MOCK_USER_GROUPS_LIST.find((g) => g.id === id)
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      return { code: 0, message: 'ok', data: { ...group, memberIds: [...group.memberIds] } }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/user-group',
    handler: (_params, _query, body) => {
      const data = (body ?? {}) as Record<string, unknown>
      if (!data.groupCode || !data.groupName)
        return { code: 400, message: '业务标识与组名称不能为空', data: null }
      const existing = MOCK_USER_GROUPS_LIST.find(
        (g) => g.groupCode === String(data.groupCode) && g.status !== undefined,
      )
      if (existing) return { code: 400, message: '用户组业务标识已存在', data: null }
      const nextId = String(Math.max(0, ...MOCK_USER_GROUPS_LIST.map((g) => Number(g.id))) + 1)
      const group = {
        id: nextId,
        groupCode: String(data.groupCode),
        groupName: String(data.groupName),
        status: data.status === undefined ? 0 : Number(data.status),
        remark: data.remark == null ? null : String(data.remark),
        memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
        createTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
        updateTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }
      MOCK_USER_GROUPS_LIST.push(group)
      return { code: 0, message: 'ok', data: nextId }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user-group',
    handler: (_params, _query, body) => {
      const data = (body ?? {}) as Record<string, unknown>
      const idx = MOCK_USER_GROUPS_LIST.findIndex((g) => g.id === String(data.id))
      if (idx < 0) return { code: 404, message: '用户组不存在', data: null }
      const existing = MOCK_USER_GROUPS_LIST[idx]
      MOCK_USER_GROUPS_LIST[idx] = {
        ...existing,
        groupName: data.groupName != null ? String(data.groupName) : existing.groupName,
        status: data.status === undefined ? existing.status : Number(data.status),
        remark: data.remark == null ? existing.remark : String(data.remark),
        // 业务标识不可变：忽略请求携带的 groupCode 变更
        groupCode: existing.groupCode,
        updateTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/user-group/:id',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const idx = MOCK_USER_GROUPS_LIST.findIndex((g) => g.id === id)
      if (idx < 0) return { code: 404, message: '用户组不存在', data: null }
      MOCK_USER_GROUPS_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user-group/:id/disable',
    handler: (params) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      group.status = 1
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user-group/:id/enable',
    handler: (params) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      group.status = 0
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user-group/:id/members',
    handler: (params) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      return { code: 0, message: 'ok', data: [...group.memberIds] }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/user-group/:id/members',
    handler: (params, _query, body) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      group.memberIds = Array.isArray(body) ? body.map(String) : []
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/user-group/:id/members',
    handler: (params, _query, body) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      const add = Array.isArray(body) ? body.map(String) : []
      group.memberIds = [...new Set([...group.memberIds, ...add])]
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/user-group/:id/members',
    handler: (params, _query, body) => {
      const group = MOCK_USER_GROUPS_LIST.find(
        (g) => g.id === String((params as Record<string, string>).id),
      )
      if (!group) return { code: 404, message: '用户组不存在', data: null }
      const remove = new Set(Array.isArray(body) ? body.map(String) : [])
      group.memberIds = group.memberIds.filter((id) => !remove.has(id))
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/user-group/candidates',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 20)
      const keyword = query.keyword ? String(query.keyword) : ''
      let list = MOCK_USERS_LIST.filter((u) => u.status === 0)
      if (keyword)
        list = list.filter((u) => u.username.includes(keyword) || u.realName.includes(keyword))
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },

  // ── 角色管理 CRUD ──────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/system/role/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = [...MOCK_ROLES_LIST]
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.name) list = list.filter((r) => r.name.includes(String(f.name)))
        if (f.code) list = list.filter((r) => r.code.includes(String(f.code)))
        if (f.status !== undefined && f.status !== null && f.status !== '')
          list = list.filter((r) => r.status === Number(f.status))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/role/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const role = MOCK_ROLES_LIST.find((r) => r.id === id)
      if (!role) return { code: 404, message: '角色不存在', data: null }
      return { code: 0, message: 'ok', data: { ...role } }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/role',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = String(Date.now())
      const newRole = {
        id,
        name: String(data.name ?? ''),
        code: String(data.code ?? ''),
        sort: Number(data.sort ?? 0),
        status: Number(data.status ?? 1),
        dataScope: 1,
        builtIn: false,
        description: String(data.description ?? ''),
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_ROLES_LIST.push(newRole as (typeof MOCK_ROLES_LIST)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/role',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_ROLES_LIST.findIndex((r) => r.id === String(data.id))
      if (idx === -1) return { code: 404, message: '角色不存在', data: null }
      const existing = MOCK_ROLES_LIST[idx]
      MOCK_ROLES_LIST[idx] = {
        ...existing,
        name: String(data.name ?? existing.name),
        code: String(data.code ?? existing.code),
        sort: data.sort !== undefined ? Number(data.sort) : existing.sort,
        status: data.status !== undefined ? Number(data.status) : existing.status,
        description:
          data.description !== undefined ? String(data.description) : existing.description,
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/role/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const idx = MOCK_ROLES_LIST.findIndex((r) => r.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_ROLES_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 角色菜单/按钮权限绑定（M02-F02/F03，契约对齐 step1 §5） ──
  // GET /api/system/role/:id/menus → R<number[]>
  // 真实后端：SysRoleServiceImpl.listMenuIds 仅按 role_id 查 sys_role_menu，
  // 不校验角色是否存在、不过滤 menu_type（目录/页面/按钮全返回）。
  // 未知角色 → data=[]（code=0），与真实 API 一致（无绑定的空角色同样返回 []）。
  {
    method: 'GET',
    pattern: '/api/system/role/:id/menus',
    handler: (params) => {
      const id = String((params as Record<string, string>).id)
      const bindings = MOCK_ROLE_MENU_BINDINGS[id]
      return { code: 0, message: 'ok', data: bindings ? [...bindings] : [] }
    },
  },

  // PUT /api/system/role/:id/menus → R<null>
  // 真实后端：updateMenuIds = 先删后插；body=number[]，null/[]=清空；
  // 应用层 filter(nonNull).distinct() 去重（重复提交幂等）；未知角色静默成功（写孤儿关系）。
  // 受保护角色：built_in=true && code='superadmin' → 业务错误（HTTP 200 + body code=400，
  // 「内置超管角色不可修改或删除」），绑定不被修改（方向 §5 风险 4 / §6 验收 4）。
  {
    method: 'PUT',
    pattern: '/api/system/role/:id/menus',
    handler: (params, _query, body) => {
      const id = String((params as Record<string, string>).id)
      const role = MOCK_ROLES_LIST.find((r) => r.id === id)
      // superadmin 保护判定与后端一致：code 判定（真实后端不校验角色存在，
      // 仅当角色存在且 builtIn+code=superadmin 才拒绝）
      if (role?.builtIn === true && role.code === 'superadmin') {
        return { code: 400, message: '内置超管角色不可修改或删除', data: null }
      }
      // 先删后插（null / [] / 非数组均按清空处理）；应用层 filter+distinct 去重（幂等）
      const requested = Array.isArray(body)
        ? body.filter((n): n is number => n !== null && n !== undefined).map(Number)
        : []
      MOCK_ROLE_MENU_BINDINGS[id] = [...new Set(requested)]
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 部门管理 CRUD ──────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/api/system/dept/tree',
    handler: (_params, query) => {
      // 与后端契约对齐（I31）：name=包含匹配（trim 后空白等价未填写）、status=0/1 精确相等；
      // 结果 = 直接命中 + 沿 parentId 上溯至 '0' 或断链的祖先，去重，sort 升序稳定排序；
      // 无参数时返回全量（与旧行为一致）；非法 status 显式 400。
      const name = String(query.name ?? '').trim()
      const statusRaw = query.status
      const hasStatus = statusRaw !== undefined && statusRaw !== ''
      if (hasStatus && statusRaw !== '0' && statusRaw !== '1') {
        return { code: 400, message: '非法部门状态参数', data: null }
      }

      let hits = [...MOCK_DEPTS_LIST]
      if (name) hits = hits.filter((d) => d.name.includes(name))
      if (hasStatus) hits = hits.filter((d) => d.status === Number(statusRaw))

      if (!name && !hasStatus) {
        // 无筛选条件：与现状一致，直接返回全量（保持既有顺序）
        return { code: 0, message: 'ok', data: hits }
      }

      // 祖先补全：沿 parentId 上溯（断链即停），Map 去重保证无重复节点
      const byId = new Map(MOCK_DEPTS_LIST.map((d) => [d.id, d]))
      const result = new Map<string, (typeof MOCK_DEPTS_LIST)[number]>()
      for (const hit of hits) {
        let cur: (typeof MOCK_DEPTS_LIST)[number] | undefined = hit
        while (cur && !result.has(cur.id)) {
          result.set(cur.id, cur)
          cur = cur.parentId && cur.parentId !== '0' ? byId.get(cur.parentId) : undefined
        }
      }
      // sort 升序（nullsLast）+ 同 sort 按 id 升序，与后端 Comparator(comparing(sort, nullsLast).thenComparing(id)) 一致
      const list = [...result.values()].sort(
        (a, b) =>
          (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) ||
          Number(a.id) - Number(b.id),
      )
      return { code: 0, message: 'ok', data: list }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/dept/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const dept = MOCK_DEPTS_LIST.find((d) => d.id === id)
      if (!dept) return { code: 404, message: '部门不存在', data: null }
      return { code: 0, message: 'ok', data: { ...dept } }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/dept',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = String(Date.now())
      const newDept = {
        id,
        parentId: String(data.parentId ?? '0'),
        name: String(data.name ?? ''),
        code: String(data.code ?? ''),
        sort: Number(data.sort ?? 0),
        status: Number(data.status ?? 0),
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_DEPTS_LIST.push(newDept as (typeof MOCK_DEPTS_LIST)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/dept',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_DEPTS_LIST.findIndex((d) => d.id === String(data.id))
      if (idx === -1) return { code: 404, message: '部门不存在', data: null }
      const existing = MOCK_DEPTS_LIST[idx]
      MOCK_DEPTS_LIST[idx] = {
        ...existing,
        parentId: data.parentId !== undefined ? String(data.parentId) : existing.parentId,
        name: String(data.name ?? existing.name),
        code: String(data.code ?? existing.code),
        sort: data.sort !== undefined ? Number(data.sort) : existing.sort,
        status: data.status !== undefined ? Number(data.status) : existing.status,
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/dept/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const idx = MOCK_DEPTS_LIST.findIndex((d) => d.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_DEPTS_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 岗位管理 CRUD ──────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/api/system/post/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = [...MOCK_POSTS_LIST]
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.code) list = list.filter((p) => p.code.includes(String(f.code)))
        if (f.name) list = list.filter((p) => p.name.includes(String(f.name)))
        if (f.status !== undefined && f.status !== null && f.status !== '')
          list = list.filter((p) => p.status === Number(f.status))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/system/post/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const post = MOCK_POSTS_LIST.find((p) => p.id === id)
      if (!post) return { code: 404, message: '岗位不存在', data: null }
      return { code: 0, message: 'ok', data: { ...post } }
    },
  },
  {
    method: 'POST',
    pattern: '/api/system/post',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = String(Date.now())
      const newPost = {
        id,
        code: String(data.code ?? ''),
        name: String(data.name ?? ''),
        sort: Number(data.sort ?? 0),
        status: Number(data.status ?? 1),
        description: String(data.description ?? ''),
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_POSTS_LIST.push(newPost as (typeof MOCK_POSTS_LIST)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/system/post',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_POSTS_LIST.findIndex((p) => p.id === String(data.id))
      if (idx === -1) return { code: 404, message: '岗位不存在', data: null }
      const existing = MOCK_POSTS_LIST[idx]
      MOCK_POSTS_LIST[idx] = {
        ...existing,
        code: String(data.code ?? existing.code),
        name: String(data.name ?? existing.name),
        sort: data.sort !== undefined ? Number(data.sort) : existing.sort,
        status: data.status !== undefined ? Number(data.status) : existing.status,
        description:
          data.description !== undefined ? String(data.description) : existing.description,
        updateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/system/post/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const idx = MOCK_POSTS_LIST.findIndex((p) => p.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_POSTS_LIST.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ── 文件存储：分页列表 ─────────────────────────────────
  // GET /api/storage/files?page=&size=
  // query 参数名 page/size 对齐 listFiles() 发送的 axios params
  // 响应字段 pageNum/pageSize 对齐后端 MP Page Jackson 序列化
  {
    method: 'GET',
    pattern: '/api/storage/files',
    handler: (_params, query) => {
      const page = Number(query.page ?? 1)
      const size = Number(query.size ?? 10)
      const total = MOCK_STORAGE_FILES.length
      const start = (page - 1) * size
      const records = MOCK_STORAGE_FILES.slice(start, start + size)
      return {
        code: 0,
        message: 'ok',
        data: { records, total, pageNum: page, pageSize: size },
      }
    },
  },

  // ── 文件存储：上传 ────────────────────────────────────
  // POST /api/storage/files/upload (multipart/form-data)
  // Mock 模式不解析 FormData body，直接返回静态上传结果
  {
    method: 'POST',
    pattern: '/api/storage/files/upload',
    handler: (_params, _query, _body) => {
      const id = MOCK_STORAGE_FILES.length + 1
      const now = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00')
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19)
      const storageKey = `mock-upload-${id}-${Date.now()}`
      MOCK_STORAGE_FILES.unshift({
        id,
        originalName: '新上传的文件.txt',
        storageKey,
        storageName: storageKey,
        fileSize: 1024,
        contentType: 'text/plain',
        fileExt: 'txt',
        providerType: 'local',
        bucketName: 'default',
        storageUrl: `/upload/${storageKey}`,
        createTime: now,
        updateTime: now,
        createBy: 1,
        updateBy: 1,
      })
      return {
        code: 0,
        message: 'ok',
        data: {
          storageKey,
          storageName: storageKey,
          storageUrl: `/upload/${storageKey}`,
          fileSize: 1024,
        },
      }
    },
  },

  // ── 文件存储：查询详情 ─────────────────────────────
  // GET /api/storage/files/:storageKey
  {
    method: 'GET',
    pattern: '/api/storage/files/:storageKey',
    handler: (params) => {
      const { storageKey } = params as Record<string, string>
      const file = MOCK_STORAGE_FILES.find((f) => f.storageKey === storageKey)
      if (!file) {
        return { code: 404, message: '文件不存在', data: null }
      }
      return { code: 0, message: 'ok', data: { ...file } }
    },
  },

  // ── 文件存储：删除 ─────────────────────────────────
  // DELETE /api/storage/files/:storageKey
  // 幂等：不存在的 storageKey 也返回 code: 0
  {
    method: 'DELETE',
    pattern: '/api/storage/files/:storageKey',
    handler: (params) => {
      const { storageKey } = params as Record<string, string>
      const idx = MOCK_STORAGE_FILES.findIndex((f) => f.storageKey === storageKey)
      if (idx !== -1) {
        MOCK_STORAGE_FILES.splice(idx, 1)
      }
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ═══════════════════════════════════════════════════
  // ── 定时任务：任务管理 CRUD ─────────────────────────────
  // ═══════════════════════════════════════════════════

  // POST /api/job/info/page — 分页查询（支持 jobName/status/jobType 筛选）
  {
    method: 'POST',
    pattern: '/api/job/info/page',
    handler: (_params, query, body) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = [...MOCK_JOB_INFOS]
      if (body && typeof body === 'object') {
        const f = body as Record<string, unknown>
        if (f.jobName) list = list.filter((j) => j.jobName.includes(String(f.jobName)))
        if (f.status) list = list.filter((j) => j.status === String(f.status))
        if (f.jobType) list = list.filter((j) => j.jobType === String(f.jobType))
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },

  // GET /api/job/info/:id — 查询单个任务
  {
    method: 'GET',
    pattern: '/api/job/info/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const job = MOCK_JOB_INFOS.find((j) => j.id === id)
      if (!job) return { code: 404, message: '任务不存在', data: null }
      return { code: 0, message: 'ok', data: { ...job } }
    },
  },

  // POST /api/job/info — 创建任务
  {
    method: 'POST',
    pattern: '/api/job/info',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const id = MOCK_JOB_INFOS.length > 0 ? Math.max(...MOCK_JOB_INFOS.map((j) => j.id)) + 1 : 1
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const newJob = {
        id,
        jobName: String(data.jobName ?? ''),
        jobGroup: String(data.jobGroup ?? 'DEFAULT'),
        jobType: (data.jobType as 'BEAN' | 'FLOW') ?? 'BEAN',
        cronExpression: String(data.cronExpression ?? ''),
        status: (data.status as 'NORMAL' | 'PAUSED') ?? 'NORMAL',
        concurrent: Boolean(data.concurrent ?? false),
        misfirePolicy: Number(data.misfirePolicy ?? 0),
        description: String(data.description ?? ''),
        beanName: data.beanName ? String(data.beanName) : null,
        beanParams: data.beanParams ? String(data.beanParams) : null,
        flowDefKey: data.flowDefKey ? String(data.flowDefKey) : null,
        formData: data.formData ? String(data.formData) : null,
        lastFireTime: null,
        nextFireTime: null,
        createTime: now,
        updateTime: now,
        createBy: 1,
        updateBy: 1,
      }
      MOCK_JOB_INFOS.push(newJob as (typeof MOCK_JOB_INFOS)[number])
      return { code: 0, message: 'ok', data: id }
    },
  },

  // PUT /api/job/info — 更新任务
  {
    method: 'PUT',
    pattern: '/api/job/info',
    handler: (_params, _query, body) => {
      const data = body as Record<string, unknown>
      const idx = MOCK_JOB_INFOS.findIndex((j) => j.id === Number(data.id))
      if (idx === -1) return { code: 404, message: '任务不存在', data: null }
      const existing = MOCK_JOB_INFOS[idx]
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      MOCK_JOB_INFOS[idx] = {
        ...existing,
        jobName: data.jobName !== undefined ? String(data.jobName) : existing.jobName,
        jobGroup: data.jobGroup !== undefined ? String(data.jobGroup) : existing.jobGroup,
        jobType: data.jobType !== undefined ? (data.jobType as 'BEAN' | 'FLOW') : existing.jobType,
        cronExpression:
          data.cronExpression !== undefined ? String(data.cronExpression) : existing.cronExpression,
        status: data.status !== undefined ? (data.status as 'NORMAL' | 'PAUSED') : existing.status,
        concurrent: data.concurrent !== undefined ? Boolean(data.concurrent) : existing.concurrent,
        misfirePolicy:
          data.misfirePolicy !== undefined ? Number(data.misfirePolicy) : existing.misfirePolicy,
        description:
          data.description !== undefined ? String(data.description) : existing.description,
        beanName:
          data.beanName !== undefined
            ? data.beanName
              ? String(data.beanName)
              : null
            : existing.beanName,
        beanParams:
          data.beanParams !== undefined
            ? data.beanParams
              ? String(data.beanParams)
              : null
            : existing.beanParams,
        flowDefKey:
          data.flowDefKey !== undefined
            ? data.flowDefKey
              ? String(data.flowDefKey)
              : null
            : existing.flowDefKey,
        formData:
          data.formData !== undefined
            ? data.formData
              ? String(data.formData)
              : null
            : existing.formData,
        updateTime: now,
        updateBy: 1,
      }
      return { code: 0, message: 'ok', data: null }
    },
  },

  // DELETE /api/job/info/:id — 删除任务（幂等）
  {
    method: 'DELETE',
    pattern: '/api/job/info/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_JOB_INFOS.findIndex((j) => j.id === id)
      if (idx === -1) return { code: 0, message: 'ok', data: null }
      MOCK_JOB_INFOS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },

  // POST /api/job/info/:id/pause — 暂停任务
  {
    method: 'POST',
    pattern: '/api/job/info/:id/pause',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const job = MOCK_JOB_INFOS.find((j) => j.id === id)
      if (!job) return { code: 404, message: '任务不存在', data: null }
      job.status = 'PAUSED'
      return { code: 0, message: 'ok', data: null }
    },
  },

  // POST /api/job/info/:id/resume — 恢复任务
  {
    method: 'POST',
    pattern: '/api/job/info/:id/resume',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const job = MOCK_JOB_INFOS.find((j) => j.id === id)
      if (!job) return { code: 404, message: '任务不存在', data: null }
      job.status = 'NORMAL'
      return { code: 0, message: 'ok', data: null }
    },
  },

  // POST /api/job/info/:id/trigger — 手动触发
  {
    method: 'POST',
    pattern: '/api/job/info/:id/trigger',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const job = MOCK_JOB_INFOS.find((j) => j.id === id)
      if (!job) return { code: 404, message: '任务不存在', data: null }
      // Mock 触发：追加一条 MANUAL 执行日志
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const logId = MOCK_JOB_LOGS.length > 0 ? Math.max(...MOCK_JOB_LOGS.map((l) => l.id)) + 1 : 1
      MOCK_JOB_LOGS.push({
        id: logId,
        jobId: job.id,
        jobName: job.jobName,
        jobGroup: job.jobGroup,
        triggerType: 'MANUAL',
        jobParams: job.beanParams ?? job.formData ?? null,
        execStatus: 'RUNNING',
        startTime: now,
        endTime: null,
        duration: null,
        resultMsg: null,
        exceptionStack: null,
        createTime: now,
      })
      return { code: 0, message: 'ok', data: null }
    },
  },

  // ═══════════════════════════════════════════════════
  // ── 定时任务：执行日志查询 ─────────────────────────────
  // ═══════════════════════════════════════════════════

  // POST /api/job/log/page?jobId=&pageNum=&pageSize= — 分页查询日志
  {
    method: 'POST',
    pattern: '/api/job/log/page',
    handler: (_params, query) => {
      const jobId = Number(query.jobId)
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = MOCK_JOB_LOGS.filter((l) => l.jobId === jobId)
      if (query.execStatus) {
        list = list.filter((l) => l.execStatus === query.execStatus)
      }
      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },

  // GET /api/job/log/:id — 查询单条日志
  {
    method: 'GET',
    pattern: '/api/job/log/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const log = MOCK_JOB_LOGS.find((l) => l.id === id)
      if (!log) return { code: 404, message: '日志不存在', data: null }
      return { code: 0, message: 'ok', data: { ...log } }
    },
  },

  // ═══════════════════════════════════════════════════
  // ── 流程实例监控 ──────────────────────────────────
  // ═══════════════════════════════════════════════════

  // GET /api/workflow/instances — 分页实例列表
  {
    method: 'GET',
    pattern: '/api/workflow/instances',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)

      // 可选过滤
      let list = [...MOCK_INSTANCES]
      if (query.status) {
        list = list.filter((i) => i.status === query.status)
      }
      if (query.processDefKey) {
        list = list.filter((i) => i.processDefKey === query.processDefKey)
      }
      if (query.initiatorId) {
        list = list.filter((i) => i.initiatorId === Number(query.initiatorId))
      }

      // 按创建时间倒序
      list.sort((a, b) => b.createTime.localeCompare(a.createTime))

      const total = list.length
      const start = (pageNum - 1) * pageSize
      const records = list.slice(start, start + pageSize)
      return {
        code: 0,
        message: 'ok',
        data: { records, total, pageNum, pageSize },
      }
    },
  },

  // GET /api/workflow/instances/:processInstanceId — 实例详情
  {
    method: 'GET',
    pattern: '/api/workflow/instances/:processInstanceId',
    handler: (params) => {
      const processInstanceId = (params as Record<string, string>).processInstanceId
      const instance = MOCK_INSTANCES.find((i) => i.processInstanceId === processInstanceId)
      if (!instance) {
        return { code: 404, message: '流程实例不存在', data: null }
      }
      const detail = MOCK_INSTANCE_DETAILS[processInstanceId]
      return {
        code: 0,
        message: 'ok',
        data: {
          ...instance,
          activeNodeIds: detail?.activeNodeIds ?? [],
          flowTrace: detail?.flowTrace ?? [],
        },
      }
    },
  },

  // ═══════════════════════════════════════════════════
  // ── 大模型管理（M07-F01，契约对齐 AgentModelConfigDTO / AgentModelSaveReqDTO） ──
  // ═══════════════════════════════════════════════════

  // GET /api/agent/models?pageNum=&pageSize=&nameKeyword=
  // 分页 + 名称关键字过滤（name 包含匹配），响应 BackendPageResult<AgentModelConfig>。
  // 列表数据与详情同源：均只含 apiKeyMasked 脱敏值，无明文、无 apiKeyCipher。
  {
    method: 'GET',
    pattern: '/api/agent/models',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const keyword = String(query.nameKeyword ?? '').trim()
      const filtered = keyword
        ? MOCK_AGENT_MODELS.filter((m) => m.name.includes(keyword))
        : MOCK_AGENT_MODELS
      const total = filtered.length
      const start = (pageNum - 1) * pageSize
      const records = filtered.slice(start, start + pageSize)
      return {
        code: 0,
        message: 'ok',
        data: { records, total, pageNum, pageSize },
      }
    },
  },

  // GET /api/agent/models/:id — 详情（含 apiKeyMasked；不存在返回 404 业务码）
  {
    method: 'GET',
    pattern: '/api/agent/models/:id',
    handler: (params) => {
      const model = findModel(Number((params as Record<string, string>).id))
      if (!model) return { code: 404, message: '模型配置不存在', data: null }
      return { code: 0, message: 'ok', data: { ...model } }
    },
  },

  // POST /api/agent/models — 创建（apiKey 非空才生成脱敏值；空=未配置密钥），返回新 id
  {
    method: 'POST',
    pattern: '/api/agent/models',
    handler: (_params, _query, body) => {
      const req = (body ?? {}) as Partial<AgentModelSaveReq>
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const id = nextModelId()
      const newModel: AgentModelConfig = {
        id,
        name: String(req.name ?? ''),
        protocolType: String(req.protocolType ?? 'openai'),
        baseUrl: String(req.baseUrl ?? ''),
        modelName: String(req.modelName ?? ''),
        // 明文仅存在于当次提交入参：只在本次计算脱敏展示值，不落存储
        apiKeyMasked: req.apiKey && req.apiKey.trim() ? maskApiKey(req.apiKey) : null,
        temperature:
          req.temperature === undefined || req.temperature === null
            ? null
            : Number(req.temperature),
        maxTokens:
          req.maxTokens === undefined || req.maxTokens === null ? null : Number(req.maxTokens),
        topP: req.topP === undefined || req.topP === null ? null : Number(req.topP),
        timeoutSeconds:
          req.timeoutSeconds === undefined || req.timeoutSeconds === null
            ? 60
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
        // 系统运行态字段（lockedUntil）不可写，新建恒为 null
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

  // PUT /api/agent/models/:id — 更新
  // 语义对齐后端：apiKey 为空/未传 → 保留旧密钥（mock 内存中仅保留旧脱敏值）；
  // apiKey 传新值 → 只生成新脱敏展示值（mock 内部不存明文）。
  // 系统运行态字段 lockedUntil 不可写，更新保持原值。
  {
    method: 'PUT',
    pattern: '/api/agent/models/:id',
    handler: (params, _query, body) => {
      const id = Number((params as Record<string, string>).id)
      const model = findModel(id)
      if (!model) return { code: 404, message: '模型配置不存在', data: null }
      const req = (body ?? {}) as Partial<AgentModelSaveReq>
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const apiKeyRaw = req.apiKey
      const hasNewKey = apiKeyRaw !== undefined && apiKeyRaw !== null && apiKeyRaw.trim() !== ''
      // 空 Key → 保持旧脱敏值；新 Key → 只生成新脱敏值，明文不落 mock 存储
      const apiKeyMasked = hasNewKey ? maskApiKey(apiKeyRaw) : model.apiKeyMasked
      const idx = MOCK_AGENT_MODELS.findIndex((m) => m.id === id)
      if (idx === -1) return { code: 404, message: '模型配置不存在', data: null }
      MOCK_AGENT_MODELS[idx] = {
        ...model,
        name: req.name !== undefined ? String(req.name) : model.name,
        protocolType:
          req.protocolType !== undefined ? String(req.protocolType) : model.protocolType,
        baseUrl: req.baseUrl !== undefined ? String(req.baseUrl) : model.baseUrl,
        modelName: req.modelName !== undefined ? String(req.modelName) : model.modelName,
        apiKeyMasked,
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
          req.remark === undefined ? model.remark : req.remark === null ? null : String(req.remark),
        groupKey:
          req.groupKey === undefined
            ? model.groupKey
            : req.groupKey === null || String(req.groupKey).trim() === ''
              ? null
              : String(req.groupKey),
        sort: req.sort === undefined || req.sort === null ? model.sort : Number(req.sort),
        // lockedUntil 为系统运行态（只读），更新不触碰
        quotaCooldownSeconds:
          req.quotaCooldownSeconds === undefined || req.quotaCooldownSeconds === null
            ? model.quotaCooldownSeconds
            : Number(req.quotaCooldownSeconds),
        updateTime: now,
      }
      return { code: 0, message: 'ok', data: null }
    },
  },

  // DELETE /api/agent/models/:id — 删除（幂等：不存在也返回 code 0）
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
  // 语义对齐后端 AgentModelTestConnectionRespDTO：{success,message,latencyMs}。
  // 真实后端 AgentModelConfigServiceImpl.testConnection 是纯只读网络探测：
  // 方法体内无 getEnabled()/getLockedUntil() 调用，不读取 enabled / lockedUntil；
  // 2xx-4xx 一律 success=true（message「服务可达（HTTP xxx）」），仅网络层异常
  // （ResourceAccessException）才 success=false；other 协议 GET baseUrl 根路径，
  // 200/404 均可达。故连通性与启停/锁定无关——mock 保持一致：存在即返回 success=true，
  // 不读取 enabled/lockedUntil；仅「配置不存在」以业务码 404 表达（NOT_FOUND，非连通性语义）。
  {
    method: 'POST',
    pattern: '/api/agent/models/:id/test-connection',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const model = findModel(id)
      if (!model) return { code: 404, message: '模型配置不存在，无法发起连通性测试', data: null }
      // 纯网络探测语义：不读取 enabled / lockedUntil（对照后端 testConnection 无 getEnabled()/getLockedUntil()）
      return {
        code: 0,
        message: 'ok',
        data: {
          success: true,
          message: '服务可达（HTTP 200）',
          latencyMs: 120 + (id % 5) * 30,
        },
      }
    },
  },

  // ═══════════════════════════════════════════════════
  // ── 图执行历史（AgentGraphExecution） ─────────────
  // ═══════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════
  // ── 会话历史（AgentConversation，M07-F04-02） ──────────
  // ═══════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════
  // ── 图定义 CRUD + 执行（M07-F02-02，演示 prompt 配置语义） ──
  // ═══════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════
  // ── 图单步调试（AgentGraphDebugSession，M07-F02-04） ──
  // ═══════════════════════════════════════════════════

  // ── 内部辅助：按 id 取会话（原地 mutate 对象以持久化状态变更） ──
  // 需在 handler 外部保持引用一致性，故不在 seeds 中封装。

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

  // ═══════════════════════════════════════════════════
  // ── M07-F03-02: 工具管理 CRUD（AgentToolConfigController） ──
  // ═══════════════════════════════════════════════════

  // ─── 内部工具 ───

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

  // ─── 外部 HTTP 工具 ───

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

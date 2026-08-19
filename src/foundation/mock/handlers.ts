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

import type { MockHandler, MockMethod } from './index'
import type { AgentModelConfig, AgentModelSaveReq } from '@/contracts/agent'
import {
  MOCK_AGENT_MODELS,
  MOCK_DICT_DATA,
  MOCK_DICT_TYPES,
  MOCK_SESSION_DATA,
  MOCK_MENU_TREE,
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
  MOCK_USERS_LIST,
  MOCK_ROLES_LIST,
  MOCK_DEPTS_LIST,
  MOCK_POSTS_LIST,
  MOCK_STORAGE_FILES,
  MOCK_JOB_INFOS,
  MOCK_JOB_LOGS,
  MOCK_INSTANCES,
  MOCK_INSTANCE_DETAILS,
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

// ─── 注册条目类型 ────────────────────────────────────────

export interface MockRegistration {
  method: MockMethod
  pattern: `/${string}`
  handler: MockHandler
}

// ─── Handler 实现 ─────────────────────────────────────────

export const mockRegistrations: MockRegistration[] = [
  // ── 登录/会话（双 token 契约，对齐 F1 的 TokenResponseDTO） ──
  {
    method: 'POST',
    pattern: '/api/auth/login',
    handler: (_params, _query, body) => {
      const payload = body as { username?: string; password?: string } | undefined
      const username = payload?.username ?? 'admin'
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
  {
    method: 'GET',
    pattern: '/api/system/auth/me',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: MOCK_SESSION_DATA,
    }),
  },

  // ── 当前用户菜单 ─────────────────────────────────────────
  // GET /api/system/auth/menus → MenuNode[]
  {
    method: 'GET',
    pattern: '/api/system/auth/menus',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: MOCK_MENU_TREE,
    }),
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
          approvalHistory: [],
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

  // ── 通知消息：当前用户通知列表 ──────────────────────────
  {
    method: 'GET',
    pattern: '/api/notify/messages',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: MOCK_NOTIFY_MESSAGES,
    }),
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
  // 语义对齐后端 AgentModelTestConnectionRespDTO：{success,message,latencyMs}，
  // 2xx-4xx 视为可达（success=true）；网络不可达/异常返回 success=false。
  // 不可测情况（配置不存在 / 当前被锁定）以业务码 code≠0 表达，
  // 前端不得把业务失败改判为网络失败。
  {
    method: 'POST',
    pattern: '/api/agent/models/:id/test-connection',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const model = findModel(id)
      if (!model) return { code: 404, message: '模型配置不存在，无法发起连通性测试', data: null }
      if (model.lockedUntil && model.lockedUntil > new Date().toISOString()) {
        return {
          code: 429,
          message: '该模型配置当前处于限流锁定状态，暂不可测试',
          data: null,
        }
      }
      const reachable = model.enabled || model.protocolType === 'ollama'
      return {
        code: 0,
        message: 'ok',
        data: reachable
          ? {
              success: true,
              message: `连接成功（${model.protocolType} / ${model.modelName}）`,
              latencyMs: 120 + (id % 5) * 30,
            }
          : {
              success: false,
              message: '连接失败：网络不可达或服务未响应',
              latencyMs: 500 + (id % 5) * 100,
            },
      }
    },
  },
]

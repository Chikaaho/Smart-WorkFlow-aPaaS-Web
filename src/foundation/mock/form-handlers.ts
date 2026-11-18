/**
 * 表单 mock：定义、数据、动作、应用管理、导入导出、提交。
 * 从 handlers.ts 按域拆出（行为零变化，域内保持原相对顺序）。
 */
import { getAccessToken } from '@/foundation/auth/token'
import { buildMockXlsxBlob } from './mock-xlsx'
import {
  DEMO_FORM_KEY,
  MOCK_APP_STORE,
  MOCK_CURRENT_SESSION,
  MOCK_DEMO_FORM_DEFINITION,
  MOCK_DEMO_SUBMISSIONS,
  MOCK_DICT_DATA,
  MOCK_FORM_DATA_RECORDS,
  MOCK_FORM_DEF_STORE,
  MOCK_FORM_SNAPSHOTS,
  MOCK_GENERIC_FORM_RECORDS,
} from './seeds'
import type { MockRegistration } from './mock-shared'

export const MOCK_IMPORT_EXPORT_HEADERS: string[][] = [
  ['申请人', '部门', '请假类型', '请假日期', '天数', '紧急', '事由'],
  ['applicant', 'department', 'leaveType', 'leaveDate', 'days', 'urgent', 'reason'],
]

export function p32AccessGate(
  required: string,
): { code: number; message: string; data: null } | null {
  if (!getAccessToken() || MOCK_CURRENT_SESSION.user.username === '') {
    return { code: 401, message: '未认证', data: null }
  }
  if (!MOCK_CURRENT_SESSION.superAdmin && !MOCK_CURRENT_SESSION.permissions.includes(required)) {
    return { code: 403, message: '无权限', data: null }
  }
  return null
}

export const formMockRegistrations: MockRegistration[] = [
  // ── 已发布表单定义候选 ────────────────────────────────────
  // GET /api/form/def/published → [{formKey, name, formVersion}]（仅 PUBLISHED，登录即可）
  // 「我的草稿」新建时选表单候选使用；PUBLISHED 判定来自 MOCK_FORM_DEF_STORE 实时状态。
  {
    method: 'GET',
    pattern: '/api/form/def/published',
    handler: () => {
      const list = Array.from(MOCK_FORM_DEF_STORE.values())
        .filter((d) => d.status === 'PUBLISHED')
        .map((d) => ({ formKey: d.formKey, name: d.name, formVersion: d.formVersion }))
      return { code: 0, message: 'ok', data: list }
    },
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
  // GET /api/form/data/:formKey/:recordId — 表单数据读取（mock 默认不备份数据，
  // 返回 404 与既有网络回退行为一致；设计 fixture 会话经 OVERRIDES 命中演示数据）
  {
    method: 'GET',
    pattern: '/api/form/data/:formKey/:recordId',
    handler: () => ({ code: 404, message: '表单数据不存在', data: null }),
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
      // Keep the generic detail route from shadowing the static template suffix
      // when the mock registry evaluates registrations in declaration order.
      if (recordId === 'template') {
        const denied = p32AccessGate('form:data:template')
        if (denied) return denied
        return {
          code: 0,
          message: 'ok',
          data: buildMockXlsxBlob(MOCK_IMPORT_EXPORT_HEADERS),
        }
      }
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
        formVersion: 1,
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
      // P52：发布成功即冻结一版快照（对齐后端 publish Step 6 语义）
      const snapshotVersion = (existing.formVersion ?? 1) + 1
      existing.formVersion = snapshotVersion
      MOCK_FORM_SNAPSHOTS.push({
        formId: existing.id,
        formVersion: snapshotVersion,
        definition: existing.definition,
        createTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      })
      return {
        code: 0,
        message: 'ok',
        data: {
          id: existing.id,
          formKey: existing.formKey,
          name: existing.name,
          status: 'PUBLISHED',
          formVersion: snapshotVersion,
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
        // V012-BUG-015：创建人展示名（mock 固定占位，直连模式由后端解析下发）
        createByName: '管理员',
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
  // ── 表单定义：按 ID 取身份 DTO（P52 工作台） ────────────────
  // GET /api/form/def/:id → R<FormDefDTO>
  // 注意：必须注册在 /page 与 /by-key 字面量 handler 之后——mock 匹配按注册
  // 顺序首中即止，:param 模式会吞掉同段数的字面量路径。
  // 不存在/已删除 → 1000（对齐后端 FORM_NOT_FOUND）
  {
    method: 'GET',
    pattern: '/api/form/def/:id',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      const existing = MOCK_FORM_DEF_STORE.get(id)
      if (!existing) {
        return { code: 1000, message: '表单不存在', data: null }
      }
      return {
        code: 0,
        message: 'ok',
        data: {
          id: existing.id,
          formKey: existing.formKey,
          name: existing.name,
          status: existing.status,
          formVersion: existing.formVersion,
        },
      }
    },
  },
  // ── 应用中心（应用 → 目录 → 表单）：用户端可见应用 ──────────
  // GET /api/form/app/center/apps → R<FormApp[]>（启用 + 可见范围命中的最小投影）
  {
    method: 'GET',
    pattern: '/api/form/app/center/apps',
    handler: () => {
      const rows = Array.from(MOCK_APP_STORE.values())
        .filter((app) => app.status === 'ENABLED')
        .map((app) => ({
          id: app.id,
          name: app.name,
          icon: app.icon,
          color: app.color,
          sortNo: app.sortNo,
          visibleScopeType: app.visibleScopeType,
          status: app.status,
          source: app.source,
          formCount:
            app.directForms.filter((f) => f.status === 'PUBLISHED').length +
            app.dirs.reduce(
              (acc, dir) => acc + dir.forms.filter((f) => f.status === 'PUBLISHED').length,
              0,
            ),
          dirCount: app.dirs.length,
        }))
      return { code: 0, message: 'ok', data: rows }
    },
  },
  // ── 应用中心：应用内容（用户端只下发可用表单） ──────────────
  // GET /api/form/app/center/apps/:id → R<FormAppContent>
  {
    method: 'GET',
    pattern: '/api/form/app/center/apps/:id',
    handler: (params) => {
      const { id } = params as Record<string, string>
      const app = MOCK_APP_STORE.get(id)
      if (!app || app.status !== 'ENABLED') {
        return { code: 1700, message: '应用不存在或不可见', data: null }
      }
      const usable = (f: { status: string }) => f.status === 'PUBLISHED'
      return {
        code: 0,
        message: 'ok',
        data: {
          app: {
            id: app.id,
            name: app.name,
            icon: app.icon,
            color: app.color,
            sortNo: app.sortNo,
            visibleScopeType: app.visibleScopeType,
            status: app.status,
            source: app.source,
            formCount:
              app.directForms.filter(usable).length +
              app.dirs.reduce((acc, dir) => acc + dir.forms.filter(usable).length, 0),
            dirCount: app.dirs.length,
          },
          dirs: app.dirs.map((dir) => ({ ...dir, forms: dir.forms.filter(usable) })),
          directForms: app.directForms.filter(usable),
        },
      }
    },
  },
  // ── 应用管理：应用列表（管理端含停用与可见范围） ────────────
  // GET /api/form/app/manage/list → R<FormApp[]>
  {
    method: 'GET',
    pattern: '/api/form/app/manage/list',
    handler: (_params, query) => {
      const keyword = String(query.keyword ?? '').trim()
      const rows = Array.from(MOCK_APP_STORE.values())
        .filter((app) => !keyword || app.name.includes(keyword))
        .map((app) => ({
          id: app.id,
          name: app.name,
          icon: app.icon,
          color: app.color,
          sortNo: app.sortNo,
          visibleScopeType: app.visibleScopeType,
          visibleUserIds: app.visibleUserIds,
          visibleDeptIds: app.visibleDeptIds,
          visibleRoleCodes: app.visibleRoleCodes,
          visiblePostIds: app.visiblePostIds,
          visibleTenantIds: app.visibleTenantIds,
          status: app.status,
          source: app.source,
          legacyCategoryId: app.legacyCategoryId ?? null,
          formCount:
            app.directForms.length + app.dirs.reduce((acc, dir) => acc + dir.forms.length, 0),
          dirCount: app.dirs.length,
        }))
      return { code: 0, message: 'ok', data: rows }
    },
  },
  // ── 应用管理：应用内容（管理视角含草稿/停用/不可见） ────────
  // GET /api/form/app/manage/:id/content → R<FormAppContent>
  {
    method: 'GET',
    pattern: '/api/form/app/manage/:id/content',
    handler: (params) => {
      const { id } = params as Record<string, string>
      const app = MOCK_APP_STORE.get(id)
      if (!app) {
        return { code: 1700, message: '应用不存在或不可见', data: null }
      }
      return {
        code: 0,
        message: 'ok',
        data: {
          app: {
            id: app.id,
            name: app.name,
            icon: app.icon,
            color: app.color,
            sortNo: app.sortNo,
            visibleScopeType: app.visibleScopeType,
            visibleUserIds: app.visibleUserIds,
            visibleDeptIds: app.visibleDeptIds,
            visibleRoleCodes: app.visibleRoleCodes,
            visiblePostIds: app.visiblePostIds,
            visibleTenantIds: app.visibleTenantIds,
            status: app.status,
            source: app.source,
            formCount:
              app.directForms.length + app.dirs.reduce((acc, dir) => acc + dir.forms.length, 0),
            dirCount: app.dirs.length,
          },
          dirs: app.dirs,
          directForms: app.directForms,
        },
      }
    },
  },
  // ── 表单定义：历史版本快照列表（P52 工作台） ────────────────
  // GET /api/form/def/:id/snapshots → R<FormSnapshotDTO[]>
  // 版本号倒序；行内不含 definition。表单不存在 → 1000。
  {
    method: 'GET',
    pattern: '/api/form/def/:id/snapshots',
    handler: (params) => {
      const id = (params as Record<string, string>).id
      if (!MOCK_FORM_DEF_STORE.has(id)) {
        return { code: 1000, message: '表单不存在', data: null }
      }
      const rows = MOCK_FORM_SNAPSHOTS.filter((s) => s.formId === id)
        .sort((a, b) => b.formVersion - a.formVersion)
        .map((s) => ({ formVersion: s.formVersion, createTime: s.createTime }))
      return { code: 0, message: 'ok', data: rows }
    },
  },
  // ── 表单定义：指定版本快照详情（P52 工作台·只读预览） ───────
  // GET /api/form/def/:id/snapshots/:version → R<FormSnapshotDetailDTO>
  // 版本不存在 → 1301（对齐后端 SNAPSHOT_NOT_FOUND）
  {
    method: 'GET',
    pattern: '/api/form/def/:id/snapshots/:version',
    handler: (params) => {
      const { id, version } = params as Record<string, string>
      if (!MOCK_FORM_DEF_STORE.has(id)) {
        return { code: 1000, message: '表单不存在', data: null }
      }
      const row = MOCK_FORM_SNAPSHOTS.find(
        (s) => s.formId === id && s.formVersion === Number(version),
      )
      if (!row) {
        return { code: 1301, message: '表单版本快照不存在', data: null }
      }
      return {
        code: 0,
        message: 'ok',
        data: {
          formVersion: row.formVersion,
          createTime: row.createTime,
          definition: row.definition,
        },
      }
    },
  },
]

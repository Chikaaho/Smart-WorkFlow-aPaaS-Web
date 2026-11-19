/**
 * 消息通知 mock：模板、规则、收件箱、记录、订阅、渠道、批量发送。
 * 从 handlers.ts 按域拆出（行为零变化，域内保持原相对顺序）。
 */
import { buildMockPermissions, paginateMock } from './mock-shared'
import {
  MOCK_CURRENT_SESSION,
  MOCK_NOTIFY_ATTEMPTS,
  MOCK_NOTIFY_CHANNELS,
  MOCK_NOTIFY_MESSAGES,
  MOCK_NOTIFY_RECORDS,
  MOCK_NOTIFY_RULES,
  MOCK_NOTIFY_SUBSCRIPTIONS,
  MOCK_NOTIFY_TEMPLATES,
  MOCK_ROLES_LIST,
  MOCK_USERS_LIST,
} from './seeds'
import type { MockRegistration } from './mock-shared'

export // ─── 消息模板渲染辅助（P36：与后端 TemplateRenderService 同语义） ──

/** 合法变量名：字母或下划线开头，仅字母/数字/下划线 */
const MOCK_TEMPLATE_VAR = /^[A-Za-z_][A-Za-z0-9_]*$/

export const MOCK_TEMPLATE_PLACEHOLDER = /\$\{([^}]*)\}/g

export /**
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

export /** 提取第一个非法占位符的变量名（合法返回 null），用于新建/编辑校验。 */
function extractInvalidPlaceholder(template: string): string | null {
  for (const match of template.matchAll(MOCK_TEMPLATE_PLACEHOLDER)) {
    const name = match[1]
    if (!name || !MOCK_TEMPLATE_VAR.test(name)) return name
  }
  return null
}

export function mockNotifyRecordGate(
  permission: string,
): { code: number; message: string; data: null } | null {
  if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
  if (!MOCK_CURRENT_SESSION.superAdmin && !buildMockPermissions().includes(permission))
    return { code: 403, message: '无通知记录权限', data: null }
  return null
}

export const notifyMockRegistrations: MockRegistration[] = [
  // ── I6 收件箱：服务端真分页 + 未读数 + 全部已读 + 受保护深链 ──
  {
    method: 'GET',
    pattern: '/api/notify/inbox',
    handler: (_params, query) => {
      const q = query as Record<string, string>
      let result = [...MOCK_NOTIFY_MESSAGES]
      if (q.read !== undefined && q.read !== '') {
        result = result.filter((m) => m.read === (q.read === 'true'))
      }
      if (q.keyword) {
        const kw = q.keyword.toLowerCase()
        result = result.filter(
          (m) => m.title.toLowerCase().includes(kw) || m.content.toLowerCase().includes(kw),
        )
      }
      const pageNum = Math.max(1, Number(q.pageNum ?? 1))
      const pageSize = Math.max(1, Math.min(200, Number(q.pageSize ?? 10)))
      const total = result.length
      const records = result.slice((pageNum - 1) * pageSize, pageNum * pageSize)
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
  {
    method: 'GET',
    pattern: '/api/notify/inbox/unread-count',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: MOCK_NOTIFY_MESSAGES.filter((m) => !m.read).length,
    }),
  },
  {
    method: 'POST',
    pattern: '/api/notify/inbox/read-all',
    handler: () => {
      let affected = 0
      MOCK_NOTIFY_MESSAGES.forEach((m) => {
        if (!m.read) {
          m.read = true
          affected++
        }
      })
      return { code: 0, message: 'ok', data: affected }
    },
  },
  {
    method: 'POST',
    pattern: '/api/notify/inbox/:id/link',
    handler: (params) => {
      const msg = MOCK_NOTIFY_MESSAGES.find(
        (m) => m.id === Number((params as Record<string, string>).id),
      )
      if (!msg) return { code: 404, message: '通知不存在', data: null }
      return { code: 0, message: 'ok', data: { linkType: 'WF_TASK', linkId: String(msg.id) } }
    },
  },
  // ── I6 通知规则（管理端） ──
  {
    method: 'GET',
    pattern: '/api/notify/rules',
    handler: (_params, query) => {
      const q = query as Record<string, string>
      const pageNum = Math.max(1, Number(q.pageNum ?? 1))
      const pageSize = Math.max(1, Math.min(200, Number(q.pageSize ?? 20)))
      const records = MOCK_NOTIFY_RULES.slice((pageNum - 1) * pageSize, pageNum * pageSize)
      return {
        code: 0,
        message: 'ok',
        data: { records, total: MOCK_NOTIFY_RULES.length, pageNum, pageSize },
      }
    },
  },
  {
    method: 'POST',
    pattern: '/api/notify/rules',
    handler: (_params, body) => {
      const req = body as Record<string, unknown>
      const id = Math.max(0, ...MOCK_NOTIFY_RULES.map((r) => r.id)) + 1
      const rule = { id, ...req } as unknown as (typeof MOCK_NOTIFY_RULES)[number]
      MOCK_NOTIFY_RULES.push(rule)
      return { code: 0, message: 'ok', data: id }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/notify/rules/:id',
    handler: (params, body) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_NOTIFY_RULES.findIndex((r) => r.id === id)
      if (idx === -1) return { code: 404, message: '规则不存在', data: null }
      MOCK_NOTIFY_RULES[idx] = {
        ...MOCK_NOTIFY_RULES[idx],
        ...(body as object),
      } as (typeof MOCK_NOTIFY_RULES)[number]
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/notify/rules/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_NOTIFY_RULES.findIndex((r) => r.id === id)
      if (idx !== -1) MOCK_NOTIFY_RULES.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  {
    method: 'POST',
    pattern: '/api/notify/rules/:id/enabled/:enabled',
    handler: (params) => {
      const p = params as Record<string, string>
      const rule = MOCK_NOTIFY_RULES.find((r) => r.id === Number(p.id))
      if (!rule) return { code: 404, message: '规则不存在', data: null }
      rule.enabled = p.enabled === 'true'
      return { code: 0, message: 'ok', data: null }
    },
  },
  // ── I6 渠道状态（管理端） ──
  {
    method: 'GET',
    pattern: '/api/notify/channels',
    handler: () => ({ code: 0, message: 'ok', data: MOCK_NOTIFY_CHANNELS }),
  },
  {
    method: 'POST',
    pattern: '/api/notify/channels/:channel',
    handler: (params, body) => {
      const channel = (params as Record<string, string>).channel
      const row = MOCK_NOTIFY_CHANNELS.find((c) => c.channel === channel)
      if (!row) return { code: 404, message: '渠道未登记', data: null }
      const req = body as {
        tenantEnabled?: boolean
        senderDisplay?: string
        configSummary?: string
      }
      if (req.tenantEnabled && !row.systemConfigured) {
        return { code: 400, message: '生产渠道适配器未装配，禁止启用', data: null }
      }
      if (row) row.tenantEnabled = Boolean(req.tenantEnabled)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // ── I6 订阅偏好（用户端） ──
  {
    method: 'GET',
    pattern: '/api/notify/subscriptions',
    handler: () => ({ code: 0, message: 'ok', data: MOCK_NOTIFY_SUBSCRIPTIONS }),
  },
  {
    method: 'POST',
    pattern: '/api/notify/subscriptions',
    handler: (_params, body) => {
      const req = body as {
        items?: Array<{ eventType: string; channel: string; enabled: boolean }>
      }
      if (!req?.items) return { code: 400, message: '订阅内容不能为空', data: null }
      MOCK_NOTIFY_SUBSCRIPTIONS.splice(0, MOCK_NOTIFY_SUBSCRIPTIONS.length, ...req.items)
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
  // GET /api/notify/records
  {
    method: 'GET',
    pattern: '/api/notify/records',
    handler: (_params, query) => {
      const gate = mockNotifyRecordGate('notify:record:view')
      if (gate) return gate
      const status = query.deliveryStatus
      const keyword = (query.keyword ?? '').toLowerCase()
      const records = MOCK_NOTIFY_RECORDS.filter((r) =>
        status ? r.deliveryStatus === status : true,
      ).filter((r) =>
        keyword === ''
          ? true
          : r.title.toLowerCase().includes(keyword) ||
            r.content.toLowerCase().includes(keyword) ||
            (r.bizId ?? '').toLowerCase().includes(keyword),
      )
      return { code: 0, message: 'ok', data: paginateMock(records, query) }
    },
  },
  // GET /api/notify/records/:id — 详情 + 尝试流水
  {
    method: 'GET',
    pattern: '/api/notify/records/:id',
    handler: (params) => {
      const gate = mockNotifyRecordGate('notify:record:view')
      if (gate) return gate
      const id = Number((params as Record<string, string>).id)
      const message = MOCK_NOTIFY_RECORDS.find((r) => r.id === id)
      if (!message) return { code: 404, message: '发送记录不存在', data: null }
      return {
        code: 0,
        message: 'ok',
        data: { message, attempts: MOCK_NOTIFY_ATTEMPTS.filter((a) => a.messageId === id) },
      }
    },
  },
  // POST /api/notify/records/:id/resend — 仅 FAILED 可重发；并发/重复受理返回冲突语义
  {
    method: 'POST',
    pattern: '/api/notify/records/:id/resend',
    handler: (params) => {
      const gate = mockNotifyRecordGate('notify:record:resend')
      if (gate) return gate
      const id = Number((params as Record<string, string>).id)
      const record = MOCK_NOTIFY_RECORDS.find((r) => r.id === id)
      if (!record) return { code: 404, message: '发送记录不存在', data: null }
      if (record.deliveryStatus !== 'FAILED')
        return {
          code: 400,
          message: `记录当前状态为 ${record.deliveryStatus}，仅明确失败且无进行中重发的记录可重发`,
          data: null,
        }
      // 受理即置 RESENDING（同步完成重发并落最新结果）
      record.deliveryStatus = 'RESENDING'
      const success = record.channel === 'IN_APP'
      record.deliveryStatus = success ? 'SUCCESS' : 'FAILED'
      record.failureReason = success ? null : '渠道仍不可用（mock）'
      const attemptNo = MOCK_NOTIFY_ATTEMPTS.filter((a) => a.messageId === id).length + 1
      MOCK_NOTIFY_ATTEMPTS.push({
        id: Date.now(),
        messageId: id,
        attemptNo,
        channel: record.channel,
        status: record.deliveryStatus,
        failureReason: record.failureReason,
        externalMessageId: null,
        createTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      })
      return { code: 0, message: 'ok', data: record.deliveryStatus }
    },
  },
]

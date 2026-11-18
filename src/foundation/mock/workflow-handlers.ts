/**
 * 工作流 mock：流程定义、任务、我的实例、草稿、目录、监控、交接、触发器、txn-batch 批量受理。
 * 从 handlers.ts 按域拆出（行为零变化，域内保持原相对顺序）。
 */
import { getAccessToken } from '@/foundation/auth/token'
import { buildMockPermissions, mockSessionUid, paginateMock } from './mock-shared'
import {
  MOCK_CATALOG_ITEMS,
  MOCK_CATEGORIES,
  MOCK_CURRENT_SESSION,
  MOCK_DEPTS_LIST,
  MOCK_INSTANCES,
  MOCK_INSTANCE_DETAILS,
  MOCK_MY_COPIES,
  MOCK_MY_DRAFTS,
  MOCK_MY_PROCESSED,
  MOCK_PROCESSED_TASKS,
  MOCK_PROCESS_DEFS,
  MOCK_TODO_TASKS,
  MOCK_URGE_LAST_ACCEPTED,
  MOCK_WORKFLOW_COMMANDS,
  nextMyDraftId,
  registerMockCommand,
} from './seeds'
import { MOCK_WORKFLOW_NODE_CAPABILITIES } from './workflow-node-capabilities'
import type { MockRegistration } from './mock-shared'

export /** 模板/导出两行表头（显示名 + 稳定映射标识），与真实后端模板契约一致。 */
/** I3：演示流程图（第一方渲染内核消费；坐标契约 contractVersion=2；与 activityId 对齐轨迹高亮） */
function demoGraph(def: {
  id: number
  processKey: string
  name: string
  formKey: string
  defVersion?: number
}) {
  return {
    processKey: def.processKey,
    name: def.name,
    formKey: def.formKey,
    version: def.defVersion ?? 1,
    contractVersion: 2,
    elements: [
      { id: 'StartEvent_1', kind: 'node', type: 'START', x: 120, y: 240, config: { name: '开始' } },
      {
        id: 'Activity_submit',
        kind: 'node',
        type: 'APPROVAL',
        x: 380,
        y: 240,
        config: { name: '提交申请' },
      },
      {
        id: 'Activity_approve1',
        kind: 'node',
        type: 'APPROVAL',
        x: 640,
        y: 240,
        config: { name: '部门经理审批' },
      },
      {
        id: 'Activity_approve2',
        kind: 'node',
        type: 'APPROVAL',
        x: 900,
        y: 240,
        config: { name: 'HR 审批' },
      },
      { id: 'EndEvent_1', kind: 'node', type: 'END', x: 1160, y: 240, config: { name: '结束' } },
      { id: 'Flow_start2submit', kind: 'edge', source: 'StartEvent_1', target: 'Activity_submit' },
      {
        id: 'Flow_submit2approve1',
        kind: 'edge',
        source: 'Activity_submit',
        target: 'Activity_approve1',
      },
      {
        id: 'Flow_approve1_2approve2',
        kind: 'edge',
        source: 'Activity_approve1',
        target: 'Activity_approve2',
      },
      { id: 'Flow_approve2_2end', kind: 'edge', source: 'Activity_approve2', target: 'EndEvent_1' },
    ],
    canvas: {},
  }
}

export /**
 * P32 导入导出身份/权限闸（对齐真实后端 401/403/放行 口径）：
 * 未登录（无 token 或未认证会话）→ 401；已登录缺对应权限 → 403；超管/持权 → 放行。
 */
/** B021-027：部门子树 ID（含环保护），与后端 searchActiveUsersInDept 同口径。 */
function mockDescendantDeptIds(deptId: string): string[] {
  const children = new Map<string, string[]>()
  for (const dept of MOCK_DEPTS_LIST) {
    const parent = String((dept as { parentId?: string }).parentId ?? '')
    if (!parent) continue
    const list = children.get(parent) ?? []
    list.push(String(dept.id))
    children.set(parent, list)
  }
  const result: string[] = []
  const visited = new Set<string>([deptId])
  const stack = [...(children.get(deptId) ?? [])]
  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    result.push(current)
    stack.push(...(children.get(current) ?? []))
  }
  return result
}

export /** P58 节点能力清单沿用当前 workflow 设计入口权限；未认证与无权语义与真实接口一致。 */
function workflowNodeCapabilityAccessGate(): { code: number; message: string; data: null } | null {
  if (!getAccessToken() || MOCK_CURRENT_SESSION.user.username === '') {
    return { code: 401, message: '未认证', data: null }
  }
  if (
    !MOCK_CURRENT_SESSION.superAdmin &&
    !MOCK_CURRENT_SESSION.permissions.includes('workflow:def:view')
  ) {
    return { code: 403, message: '无权限', data: null }
  }
  return null
}

export function mockCatalogPortalVisible(item: (typeof MOCK_CATALOG_ITEMS)[number]): boolean {
  return item.portalVisible && item.status === 'PUBLISHED' && item.bindingActive
}

export function mockCatalogManageGate(): { code: number; message: string; data: null } | null {
  if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
  if (
    !MOCK_CURRENT_SESSION.superAdmin &&
    !buildMockPermissions().includes('workflow:catalog:manage')
  )
    return { code: 403, message: '无事项管理权限', data: null }
  return null
}

export /** P62 S5 mock（临时）：后台批量批次（批次键 → 批次）。 */
const MOCK_TXN_BATCHES = new Map<
  string,
  {
    batchKey: string
    actionId: string
    actionVersion: number
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_FAILED'
    totalCount: number
    succeededCount: number
    failedCount: number
    commandId: number
    replay: boolean
    items: {
      itemKey: string
      recordId: string
      quantity: string
      status: 'PENDING' | 'SUCCEEDED' | 'REJECTED'
      invocationId: string | null
      errorCode: number | null
      errorMsg: string | null
      attemptCount: number
      _reject?: boolean
    }[]
  }
>()

export const workflowMockRegistrations: MockRegistration[] = [
  // POST /api/workflow/txn-batch — 后台批量受理（P62 S5 mock，临时）
  // 同批次键幂等重放返回原批次（replay=true）；受理后转 PROCESSING，首次回查完成逐项结算。
  {
    method: 'POST',
    pattern: '/api/workflow/txn-batch',
    handler: (_params, _query, body) => {
      const req = body as {
        batchKey?: string
        actionId?: string
        items?: { itemKey: string; recordId: string; quantity: string }[]
      }
      if (!req?.batchKey || !req?.actionId || !Array.isArray(req.items) || req.items.length === 0) {
        return { code: 400, message: 'batchKey/actionId/items 不能为空', data: null }
      }
      const existing = MOCK_TXN_BATCHES.get(req.batchKey)
      if (existing) {
        return {
          code: 0,
          message: 'ok',
          data: { ...existing, replay: true, items: existing.items },
        }
      }
      const items = req.items.map((item, index) => ({
        itemKey: item.itemKey,
        recordId: item.recordId,
        quantity: item.quantity,
        status: 'PENDING' as const,
        invocationId: null,
        errorCode: null,
        errorMsg: null,
        attemptCount: 0,
        _reject: index === 1,
      }))
      const batch = {
        batchKey: req.batchKey,
        actionId: req.actionId,
        actionVersion: 1,
        status: 'PROCESSING' as const,
        totalCount: items.length,
        succeededCount: 0,
        failedCount: 0,
        commandId: Math.floor(Math.random() * 900000) + 100000,
        replay: false,
        items,
      }
      MOCK_TXN_BATCHES.set(req.batchKey, batch)
      return {
        code: 0,
        message: 'ok',
        data: JSON.parse(JSON.stringify({ ...batch, replay: false })),
      }
    },
  },
  // GET /api/workflow/txn-batch/:batchKey — 批次回查（P62 S5 mock，临时）
  // 首次回查完成逐项结算：1 成功 + 1 拒绝（1604），之后保持终态。
  {
    method: 'GET',
    pattern: '/api/workflow/txn-batch/:batchKey',
    handler: (params) => {
      const batchKey = (params as Record<string, string>).batchKey
      const batch = MOCK_TXN_BATCHES.get(batchKey)
      if (!batch) {
        return { code: 404, message: '批量批次不存在或不属于当前租户', data: null }
      }
      if (batch.status === 'PENDING' || batch.status === 'PROCESSING') {
        let succeeded = 0
        let failed = 0
        for (const item of batch.items) {
          if (item.status !== 'PENDING') continue
          const record = item as typeof item & { _reject?: boolean }
          if (record._reject) {
            item.status = 'REJECTED'
            item.errorCode = 1604
            item.errorMsg = '可用量不足（mock 部分失败演示）'
            item.invocationId = 'mock-inv-' + item.itemKey
            failed += 1
          } else {
            item.status = 'SUCCEEDED'
            item.invocationId = 'mock-inv-' + item.itemKey
            succeeded += 1
          }
          item.attemptCount = 1
        }
        batch.succeededCount = succeeded
        batch.failedCount = failed
        batch.status = failed > 0 ? 'PARTIALLY_FAILED' : 'COMPLETED'
      }
      return { code: 0, message: 'ok', data: JSON.parse(JSON.stringify(batch)) }
    },
  },
  // POST /api/workflow/defs/:id/iot-device-action — 流程设备动作保存（P63 dev:mock 验收辅助，临时）
  // 合并写入种子行 iotDeviceActionJson（可变数据原则），重开配置对话框即可回读下发方式。
  {
    method: 'POST',
    pattern: '/api/workflow/defs/:id/iot-device-action',
    handler: (params, _query, body) => {
      const id = Number((params as Record<string, string>).id)
      const def = MOCK_PROCESS_DEFS.find((d) => d.id === id)
      if (!def) {
        return { code: 404, message: '流程定义不存在', data: null }
      }
      const req = body as { action?: Record<string, unknown> }
      if (!req?.action || typeof req.action !== 'object') {
        return { code: 400, message: '缺少 action 配置', data: null }
      }
      const iotDeviceActionJson = JSON.stringify(req.action)
      const row = def as typeof def & { iotDeviceActionJson?: string }
      row.iotDeviceActionJson = iotDeviceActionJson
      return { code: 0, message: 'ok', data: { ...def, iotDeviceActionJson } }
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
  // ── 任务详情：运行期待办优先，已完成任务回落已办（只读，V012-BUG-001） ──
  {
    method: 'GET',
    pattern: '/api/workflow/tasks/:taskId',
    handler: (params) => {
      const { taskId } = params as Record<string, string>

      const buildApprovalHistory = (processInstanceId: string) => {
        const instanceDetail = MOCK_INSTANCE_DETAILS[processInstanceId]
        return instanceDetail
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
      }

      // 运行期待办：可办理（canHandle），含意见表单语义
      const task = MOCK_TODO_TASKS.find((t) => t.taskId === taskId)
      if (task) {
        return {
          code: 0,
          message: 'ok',
          data: {
            taskId: task.taskId,
            taskName: task.processName + '审批',
            taskStatus: 'RUNNING',
            instanceStatus:
              MOCK_INSTANCES.find((i) => i.processInstanceId === task.processInstanceId)?.status ??
              'RUNNING',
            canHandle: true,
            processInstanceId: task.processInstanceId,
            processDefinitionKey: 'skeleton_approval',
            processName: task.processName,
            formKey: task.formKey,
            businessKey: task.businessKey,
            assignee: '2',
            initiatorId: 1,
            createTime: task.createTime,
            processVariables: { formKey: task.formKey },
            approvalHistory: buildApprovalHistory(task.processInstanceId),
          },
        }
      }

      // 已办历史任务：只读详情（canHandle=false、无意见表单）
      const processed = MOCK_PROCESSED_TASKS.find((t) => t.taskId === taskId)
      if (processed) {
        return {
          code: 0,
          message: 'ok',
          data: {
            taskId: processed.taskId,
            taskName: processed.taskName,
            taskStatus: 'FINISHED',
            instanceStatus:
              MOCK_INSTANCES.find((i) => i.processInstanceId === processed.processInstanceId)
                ?.status ?? null,
            canHandle: false,
            processInstanceId: processed.processInstanceId,
            processDefinitionKey: 'skeleton_approval',
            processName: processed.processName,
            formKey: processed.formKey,
            businessKey: processed.businessKey,
            assignee: '2',
            initiatorId: 1,
            createTime: processed.createTime,
            processVariables: { formKey: processed.formKey },
            approvalHistory: buildApprovalHistory(processed.processInstanceId),
          },
        }
      }

      return { code: 404, message: '任务不存在', data: null }
    },
  },
  // ── 审批意见草稿：任务详情加载时回查（mock 演示恒为空，未填过草稿） ──
  {
    method: 'GET',
    pattern: '/api/workflow/tasks/:taskId/opinion-draft',
    handler: () => ({ code: 0, message: 'ok', data: null }),
  },
  // ── 最新审批命令回查（P63 G05b）：mock 演示无历史命令 ──
  {
    method: 'GET',
    pattern: '/api/workflow/commands/tasks/:taskId/latest',
    handler: () => ({ code: 0, message: 'ok', data: null }),
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
  // ── 流程定义：节点能力清单 ─────────────────────────────
  // GET /api/workflow/defs/node-capabilities → R<BpmNodeCapability[]>
  // 只返回后端统一注册结果中完整可用的节点，不把 P58 预留类型伪造成可设计能力。
  {
    method: 'GET',
    pattern: '/api/workflow/defs/node-capabilities',
    handler: () => {
      const denied = workflowNodeCapabilityAccessGate()
      if (denied) return denied
      return { code: 0, message: 'ok', data: MOCK_WORKFLOW_NODE_CAPABILITIES }
    },
  },
  // ── 审批人候选（P53 节点12）：keyword 模糊匹配 username/displayName，脱敏三字段 ──
  {
    method: 'GET',
    pattern: '/api/workflow/defs/approver-candidates',
    handler: (_params, query) => {
      const keyword = String(query.keyword ?? '')
        .trim()
        .toLowerCase()
      const candidates = [
        { id: 2, username: 'admin', realName: '陈曦', deptId: '1' },
        { id: 103, username: 'wanghai', realName: '王海', deptId: '2' },
        { id: 104, username: 'linyue', realName: '林悦', deptId: '2' },
        { id: 105, username: 'zhaochen', realName: '赵辰', deptId: '3' },
        { id: 106, username: 'zhouming', realName: '周明', deptId: '4' },
      ]
      // B021-027：deptId 命中部门及子孙部门（与后端 searchActiveUsersInDept 同口径）
      const deptId = String(query.deptId ?? '').trim()
      const deptIds = deptId ? [deptId, ...mockDescendantDeptIds(deptId)] : null
      const filtered = candidates.filter((c) => {
        if (deptIds && !deptIds.includes(String(c.deptId))) return false
        if (!keyword) return true
        return (
          c.username.toLowerCase().includes(keyword) ||
          (c.realName ?? '').toLowerCase().includes(keyword)
        )
      })
      return { code: 0, message: 'ok', data: filtered }
    },
  },
  // ── 流程定义：分页列表 ─────────────────────────────────
  // formKey 查询参数可选：按持久化 form_key 精确过滤（P52 表单工作台"关联流程"）。
  {
    method: 'GET',
    pattern: '/api/workflow/defs',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const formKey = String(query.formKey ?? '').trim()
      const filtered = formKey
        ? MOCK_PROCESS_DEFS.filter((d) => d.formKey === formKey)
        : MOCK_PROCESS_DEFS
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
  // ── I3：按 id 读取已保存 ProcessGraph（自研渲染内核单一图契约） ──
  {
    method: 'GET',
    pattern: '/api/workflow/defs/:id/graph-json',
    handler: (params) => {
      const defId = Number((params as Record<string, string>).id)
      const def = MOCK_PROCESS_DEFS.find((d) => d.id === defId)
      if (!def) return { code: 2010, message: '流程定义不存在', data: null }
      return { code: 0, message: 'ok', data: demoGraph(def) }
    },
  },
  // GET /api/workflow/defs/:id → ProcessGraph（设计器定义加载；供 fixture 覆盖的前置基础）
  {
    method: 'GET',
    pattern: '/api/workflow/defs/:id',
    handler: (params) => {
      const defId = Number((params as Record<string, string>).id)
      const def = MOCK_PROCESS_DEFS.find((d) => d.id === defId)
      if (!def) return { code: 2010, message: '流程定义不存在', data: null }
      return { code: 0, message: 'ok', data: demoGraph(def) }
    },
  },
  // ── I3：按 processKey 读取已保存 ProcessGraph（实例详情图查看共用） ──
  {
    method: 'GET',
    pattern: '/api/workflow/defs/by-key/:processKey',
    handler: (params) => {
      const key = (params as Record<string, string>).processKey
      const def = MOCK_PROCESS_DEFS.find((d) => d.processKey === key)
      if (!def) return { code: 2010, message: '流程定义不存在', data: null }
      return { code: 0, message: 'ok', data: demoGraph(def) }
    },
  },
  // ── I3：独立校验端点（返回全部可判定错误及 nodeKey/edgeKey） ──
  {
    method: 'POST',
    pattern: '/api/workflow/defs/:id/validate',
    handler: () => ({ code: 0, message: 'ok', data: [] }),
  },
  {
    method: 'POST',
    pattern: '/api/workflow/defs/validate',
    handler: () => ({ code: 0, message: 'ok', data: [] }),
  },
  // ── I3：发布版本行 ──
  {
    method: 'GET',
    pattern: '/api/workflow/defs/:id/versions',
    handler: (params) => {
      const defId = Number((params as Record<string, string>).id)
      return {
        code: 0,
        message: 'ok',
        data: [
          {
            id: 1,
            defId,
            graphVersion: 1,
            status: 'PUBLISHED',
            name: '演示流程',
            formKey: null,
            formVersion: null,
            publishedAt: '2026-09-01T10:00:00',
            deploymentId: null,
            processDefinitionId: null,
          },
        ],
      }
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
  // ── P64 阶段Ⅰ：节点业务表单 / 触发器回查（mock 模式返回空绑定/空链，真实数据走 dev 直连） ──
  {
    method: 'GET',
    pattern: '/api/workflow/tasks/:taskId/node-form',
    handler: () => ({ code: 0, message: 'ok', data: { bound: false } }),
  },
  {
    method: 'POST',
    pattern: '/api/workflow/tasks/:taskId/node-form/draft',
    handler: () => ({ code: 0, message: 'ok', data: 0 }),
  },
  {
    method: 'POST',
    pattern: '/api/workflow/triggers/preview',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: {
        kind: 'SCRIPT_ERROR',
        variables: {},
        missingRequired: [],
        errors: ['mock 模式无真实实例上下文'],
      },
    }),
  },
  {
    method: 'GET',
    pattern: '/api/workflow/instances/:instanceId/trigger-execs',
    handler: () => ({ code: 0, message: 'ok', data: [] }),
  },
  {
    method: 'GET',
    pattern: '/api/workflow/instances/:instanceId/action-refs',
    handler: () => ({ code: 0, message: 'ok', data: [] }),
  },
  {
    method: 'GET',
    pattern: '/api/workflow/instances/:instanceId/node-form-data',
    handler: () => ({ code: 0, message: 'ok', data: [] }),
  },
  {
    method: 'POST',
    pattern: '/api/workflow/action-refs/:refId/retry',
    handler: () => ({ code: 2441, message: 'mock 模式无真实命令队列', data: null }),
  },
  {
    method: 'GET',
    pattern: '/api/workflow/instances/:instanceId/child-batches',
    handler: () => ({ code: 0, message: 'ok', data: [] }),
  },
  {
    method: 'POST',
    pattern: '/api/workflow/child-items/:itemId/retry-writeback',
    handler: () => ({ code: 2448, message: 'mock 模式无真实子流程编排', data: null }),
  },
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
  // GET /api/workflow/my/instances — 我发起的流程（按当前会话用户过滤）
  {
    method: 'GET',
    pattern: '/api/workflow/my/instances',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const currentUserId = MOCK_CURRENT_SESSION.user.id
      let list = MOCK_INSTANCES.filter((i) => String(i.initiatorId) === currentUserId)
      if (query.status) {
        list = list.filter((i) => i.status === query.status)
      }
      const keyword = String(query.keyword ?? '').trim()
      if (keyword) {
        list = list.filter(
          (i) => (i.processName ?? '').includes(keyword) || i.businessKey.includes(keyword),
        )
      }
      list.sort((a, b) => b.createTime.localeCompare(a.createTime))
      const total = list.length
      const start = (pageNum - 1) * pageSize
      return {
        code: 0,
        message: 'ok',
        data: { records: list.slice(start, start + pageSize), total, pageNum, pageSize },
      }
    },
  },
  // GET /api/workflow/my/instances/count — 提交后实例探测（本人 + 表单键 + 业务键）
  // 先于 /api/workflow/my/instances/:id 注册，避免 "count" 被当作 :id 解析
  {
    method: 'GET',
    pattern: '/api/workflow/my/instances/count',
    handler: (_params, query) => {
      const currentUserId = MOCK_CURRENT_SESSION.user.id
      const formKey = String(query.formKey ?? '')
      const businessKey = String(query.businessKey ?? '')
      const count = MOCK_INSTANCES.filter(
        (i) =>
          i.businessKey === businessKey &&
          (formKey ? i.formKey === formKey : true) &&
          String(i.initiatorId) === currentUserId,
      ).length
      return { code: 0, message: 'ok', data: { count, formKey, businessKey } }
    },
  },
  // GET /api/workflow/my/instances/relations — 统一详情关系（0.1.7 #30）
  // formHasProcess 与实例存在性无关：纯数据表单恒 false；有流程但尚未发起时为 true 且
  // relation=NONE。真实后端须在「实例不存在提前返回」之前写入该字段，否则纯表单路径取不到值。
  {
    method: 'GET',
    pattern: '/api/workflow/my/instances/relations',
    handler: (_params, query) => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      const formKey = String(query.formKey ?? '')
      const businessKey = String(query.businessKey ?? '')
      const formHasProcess = MOCK_PROCESS_DEFS.some(
        (d) => d.formKey === formKey && d.status === 'PUBLISHED',
      )
      const instance = MOCK_INSTANCES.filter(
        (i) => i.formKey === formKey && i.businessKey === businessKey,
      ).sort((a, b) => b.createTime.localeCompare(a.createTime))[0]
      if (!instance) {
        return { code: 0, message: 'ok', data: { relation: 'NONE', formHasProcess } }
      }
      const trace = MOCK_INSTANCE_DETAILS[instance.processInstanceId]?.flowTrace ?? []
      const activeTasks = trace.filter((n) => n.activityType === 'userTask' && n.endTime === null)
      const pendingTaskId = activeTasks.find((t) => t.assignee === uid)?.taskId ?? null
      const initiator = String(instance.initiatorId) === uid
      const historyDone = trace.filter((n) => n.activityType === 'userTask' && n.endTime !== null)
      const historyParticipant = historyDone.some((t) => t.assignee === uid)
      const relation = pendingTaskId
        ? 'APPROVER'
        : initiator || historyParticipant
          ? 'PARTICIPANT'
          : 'NONE'
      if (relation === 'NONE') {
        return { code: 0, message: 'ok', data: { relation: 'NONE', formHasProcess } }
      }
      return {
        code: 0,
        message: 'ok',
        data: {
          relation,
          formHasProcess,
          pendingTaskId,
          instance: {
            id: instance.id,
            processInstanceId: instance.processInstanceId,
            processDefKey: instance.processDefKey,
            processName: instance.processName,
            theme: null,
            status: instance.status,
            initiatorId: instance.initiatorId,
            initiatorName: null,
            createTime: instance.createTime,
            currentNodes: activeTasks.map((t) => t.activityName ?? '').filter(Boolean),
            currentNodeKeys: activeTasks.map((t) => t.activityId),
          },
          approvalHistory: historyDone.map((n) => ({
            taskId: n.taskId ?? '',
            taskName: n.activityName ?? '',
            nodeKey: n.activityId,
            assignee: n.assignee ?? '',
            assigneeName: null,
            assigneeDept: null,
            createTime: n.startTime ?? '',
            endTime: n.endTime,
            action: 'APPROVE' as const,
            opinionData: null,
            approvalResult: 'APPROVED' as const,
          })),
          formData: null,
        },
      }
    },
  },
  // GET /api/workflow/my/instances/:id — 我发起的流程详情（进度 + 流转记录）
  {
    method: 'GET',
    pattern: '/api/workflow/my/instances/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const instance = MOCK_INSTANCES.find((i) => i.id === id)
      if (!instance) {
        return { code: 404, message: '流程实例不存在', data: null }
      }
      const trace = MOCK_INSTANCE_DETAILS[instance.processInstanceId]?.flowTrace ?? []
      const progress = trace
        .filter((n) => n.activityType === 'userTask' && n.endTime === null)
        .map((n) => ({
          taskId: n.taskId ?? '',
          taskName: n.activityName ?? '',
          nodeKey: n.activityId,
          assignee: n.assignee,
        }))
      const history = trace
        .filter((n) => n.activityType === 'userTask' && n.endTime !== null)
        .map((n) => ({
          taskId: n.taskId ?? '',
          taskName: n.activityName ?? '',
          nodeKey: n.activityId,
          assignee: n.assignee ?? '',
          assigneeName: null,
          createTime: n.startTime ?? '',
          endTime: n.endTime,
          action: 'APPROVE' as const,
          approvalResult: 'APPROVED' as const,
        }))
      return {
        code: 0,
        message: 'ok',
        data: {
          instance,
          processName: instance.processName,
          formKey: instance.formKey,
          businessKey: instance.businessKey,
          status: instance.status,
          progress,
          history,
        },
      }
    },
  },
  // GET /api/workflow/drafts — 我的草稿分页（按当前会话用户过滤）
  {
    method: 'GET',
    pattern: '/api/workflow/drafts',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      const currentUserId = MOCK_CURRENT_SESSION.user.id
      const list = MOCK_MY_DRAFTS.filter((d) => d.ownerId === currentUserId).sort((a, b) =>
        b.updateTime.localeCompare(a.updateTime),
      )
      const total = list.length
      const start = (pageNum - 1) * pageSize
      return {
        code: 0,
        message: 'ok',
        data: { records: list.slice(start, start + pageSize), total, pageNum, pageSize },
      }
    },
  },
  // POST /api/workflow/drafts — 新建草稿
  {
    method: 'POST',
    pattern: '/api/workflow/drafts',
    handler: (_params, _query, body) => {
      const req = (body ?? {}) as Record<string, unknown>
      const formKey = String(req.formKey ?? '').trim()
      if (!formKey) {
        return { code: 400, message: '表单标识不能为空', data: null }
      }
      const payload = String(req.payload ?? '')
      try {
        const parsed: unknown = JSON.parse(payload)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return { code: 400, message: '表单数据须为 JSON 对象', data: null }
        }
      } catch {
        return { code: 400, message: '表单数据不是合法的 JSON', data: null }
      }
      const now = new Date().toISOString().slice(0, 19)
      const draft = {
        id: nextMyDraftId(),
        ownerId: MOCK_CURRENT_SESSION.user.id,
        title: typeof req.title === 'string' && req.title.trim() ? req.title.trim() : null,
        formKey,
        formVersion: '1',
        processDefKey:
          typeof req.processDefKey === 'string' && req.processDefKey.trim()
            ? req.processDefKey.trim()
            : null,
        payload,
        status: 'EDITING' as const,
        commandId: null,
        submitSeq: 0,
        resultRecordId: null,
        lastError: null,
        createTime: now,
        updateTime: now,
      }
      MOCK_MY_DRAFTS.push(draft)
      return { code: 0, message: 'ok', data: draft }
    },
  },
  // GET /api/workflow/drafts/:id — 草稿详情（非本人 → 403）
  {
    method: 'GET',
    pattern: '/api/workflow/drafts/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const draft = MOCK_MY_DRAFTS.find((d) => d.id === id)
      if (!draft) {
        return { code: 404, message: '草稿不存在', data: null }
      }
      if (draft.ownerId !== MOCK_CURRENT_SESSION.user.id) {
        return { code: 403, message: '只能访问本人的草稿', data: null }
      }
      return { code: 0, message: 'ok', data: draft }
    },
  },
  // PUT /api/workflow/drafts/:id — 更新草稿（合并字段，非本人 → 403）
  {
    method: 'PUT',
    pattern: '/api/workflow/drafts/:id',
    handler: (params, _query, body) => {
      const id = Number((params as Record<string, string>).id)
      const draft = MOCK_MY_DRAFTS.find((d) => d.id === id)
      if (!draft) {
        return { code: 404, message: '草稿不存在', data: null }
      }
      if (draft.ownerId !== MOCK_CURRENT_SESSION.user.id) {
        return { code: 403, message: '只能修改本人的草稿', data: null }
      }
      const req = (body ?? {}) as Record<string, unknown>
      if (typeof req.title === 'string') {
        draft.title = req.title.trim() ? req.title.trim() : null
      }
      if (typeof req.processDefKey === 'string') {
        draft.processDefKey = req.processDefKey.trim() ? req.processDefKey.trim() : null
      }
      if (typeof req.payload === 'string') {
        try {
          const parsed: unknown = JSON.parse(req.payload)
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return { code: 400, message: '表单数据须为 JSON 对象', data: null }
          }
        } catch {
          return { code: 400, message: '表单数据不是合法的 JSON', data: null }
        }
        draft.payload = req.payload
      }
      draft.updateTime = new Date().toISOString().slice(0, 19)
      return { code: 0, message: 'ok', data: draft }
    },
  },
  // DELETE /api/workflow/drafts/:id — 删除草稿（幂等；非本人 → 403）
  {
    method: 'DELETE',
    pattern: '/api/workflow/drafts/:id',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const idx = MOCK_MY_DRAFTS.findIndex((d) => d.id === id)
      if (idx === -1) {
        return { code: 0, message: 'ok', data: null }
      }
      if (MOCK_MY_DRAFTS[idx].ownerId !== MOCK_CURRENT_SESSION.user.id) {
        return { code: 403, message: '只能删除本人的草稿', data: null }
      }
      MOCK_MY_DRAFTS.splice(idx, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // POST /api/workflow/drafts/:id/submit — 提交草稿（受理 ≠ 成功）
  // 未选流程 → 400「提交前必须选择流程」；非本人 → 403；payload 非法 → 400。
  {
    method: 'POST',
    pattern: '/api/workflow/drafts/:id/submit',
    handler: (params) => {
      const id = Number((params as Record<string, string>).id)
      const draft = MOCK_MY_DRAFTS.find((d) => d.id === id)
      if (!draft) {
        return { code: 404, message: '草稿不存在', data: null }
      }
      if (draft.ownerId !== MOCK_CURRENT_SESSION.user.id) {
        return { code: 403, message: '只能提交本人的草稿', data: null }
      }
      if (!draft.processDefKey) {
        return { code: 400, message: '提交前必须选择流程', data: null }
      }
      try {
        JSON.parse(draft.payload)
      } catch {
        return { code: 400, message: '表单数据不是合法的 JSON', data: null }
      }
      const command = registerMockCommand('DRAFT_SUBMIT')
      draft.status = 'SUBMITTING'
      draft.commandId = command.commandId
      draft.submitSeq += 1
      draft.lastError = null
      draft.updateTime = new Date().toISOString().slice(0, 19)
      return {
        code: 0,
        message: 'ok',
        data: {
          commandId: command.commandId,
          commandKey: `draft-submit-${draft.id}-${draft.submitSeq}`,
          commandType: command.commandType,
          channel: command.channel,
          status: 'ACCEPTED',
          duplicated: false,
        },
      }
    },
  },
  // GET /api/workflow/commands/:commandId — 命令状态回查
  // 每次查询 pollCount+1，达到 pollToComplete 转 COMPLETED（同时落地关联草稿/任务）。
  {
    method: 'GET',
    pattern: '/api/workflow/commands/:commandId',
    handler: (params) => {
      const commandId = (params as Record<string, string>).commandId
      const command = MOCK_WORKFLOW_COMMANDS.get(commandId)
      if (!command) {
        return { code: 404, message: '命令不存在', data: null }
      }
      if (command.status === 'PROCESSING' || command.status === 'PENDING') {
        command.pollCount += 1
        if (command.pollCount >= command.pollToComplete) {
          command.status = 'COMPLETED'
          command.finishedAt = new Date().toISOString().slice(0, 19)
          // 关联效果落地：草稿提交 → SUBMITTED + resultRecordId；任务动作 → 移除待办行
          if (command.commandType === 'DRAFT_SUBMIT') {
            const draft = MOCK_MY_DRAFTS.find((d) => d.commandId === command.commandId)
            if (draft) {
              draft.status = 'SUBMITTED'
              draft.resultRecordId = 'mock-record-' + draft.id
              draft.lastError = null
              draft.updateTime = command.finishedAt
            }
            command.result = { recordId: draft?.resultRecordId ?? null }
          } else if (command.result && typeof command.result.taskId === 'string') {
            const idx = MOCK_TODO_TASKS.findIndex((t) => t.taskId === command.result?.taskId)
            if (idx !== -1) MOCK_TODO_TASKS.splice(idx, 1)
          }
        }
      }
      return {
        code: 0,
        message: 'ok',
        data: {
          commandId: command.commandId,
          commandType: command.commandType,
          channel: command.channel,
          status: command.status,
          result: command.result,
          failureReason: command.failureReason,
          retryCount: command.retryCount,
          createTime: command.createTime,
          finishedAt: command.finishedAt,
        },
      }
    },
  },
  // POST /api/workflow/commands/tasks/:taskId/:action — 审批动作异步受理
  // 受理 ≠ 成功；任务不存在 → 404；未知 action → 400。
  {
    method: 'POST',
    pattern: '/api/workflow/commands/tasks/:taskId/:action',
    handler: (params, _query, _body) => {
      const { taskId, action } = params as Record<string, string>
      if (!['complete', 'reject', 'return'].includes(action)) {
        return { code: 400, message: `不支持的审批动作: ${action}`, data: null }
      }
      const task = MOCK_TODO_TASKS.find((t) => t.taskId === taskId)
      if (!task) {
        return { code: 404, message: '任务不存在', data: null }
      }
      const command = registerMockCommand(`TASK_${action.toUpperCase()}`)
      command.result = { taskId, action }
      return {
        code: 0,
        message: 'ok',
        data: {
          commandId: command.commandId,
          commandKey: `task-${action}-${taskId}`,
          commandType: command.commandType,
          channel: command.channel,
          status: 'ACCEPTED',
          duplicated: false,
        },
      }
    },
  },
  // GET /api/workflow/my/processed — 我的已办（新契约，含来源标记）
  {
    method: 'GET',
    pattern: '/api/workflow/my/processed',
    handler: (_params, query) => {
      const pageNum = Number(query.pageNum ?? 1)
      const pageSize = Number(query.pageSize ?? 10)
      let list = [...MOCK_MY_PROCESSED]
      const source = String(query.source ?? '').trim()
      if (source) {
        list = list.filter((r) => r.source === source)
      }
      list.sort((a, b) => b.handleTime.localeCompare(a.handleTime))
      const total = list.length
      const start = (pageNum - 1) * pageSize
      return {
        code: 0,
        message: 'ok',
        data: { records: list.slice(start, start + pageSize), total, pageNum, pageSize },
      }
    },
  },
  // GET /api/workflow/catalog/items — 普通视角（不泄漏 portalVisible=false 事项）
  {
    method: 'GET',
    pattern: '/api/workflow/catalog/items',
    handler: (_params, query) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const keyword = (query.keyword ?? '').toLowerCase()
      const categoryId = query.categoryId
      const items = MOCK_CATALOG_ITEMS.filter(mockCatalogPortalVisible)
        .filter((it) =>
          categoryId === undefined || categoryId === ''
            ? true
            : Number(categoryId) === 0
              ? it.categoryId === null
              : it.categoryId === Number(categoryId),
        )
        .filter((it) =>
          keyword === ''
            ? true
            : it.name.toLowerCase().includes(keyword) || it.formKey.toLowerCase().includes(keyword),
        )
      return { code: 0, message: 'ok', data: paginateMock(items, query) }
    },
  },
  // GET /api/workflow/catalog/categories — 普通视角分类列表（登录即可用，仅名称/排序）。
  // 缺失时 dev:mock 会穿透真实后端，违反「mock 模式后端零参与」前提（P53 补证修复）。
  {
    method: 'GET',
    pattern: '/api/workflow/catalog/categories',
    handler: () => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      return { code: 0, message: 'ok', data: MOCK_CATEGORIES }
    },
  },
  // GET /api/workflow/catalog/category-counts — 仅统计可见事项
  {
    method: 'GET',
    pattern: '/api/workflow/catalog/category-counts',
    handler: () => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const counts: Record<string, number> = {}
      for (const it of MOCK_CATALOG_ITEMS.filter(mockCatalogPortalVisible)) {
        if (it.categoryId !== null)
          counts[String(it.categoryId)] = (counts[String(it.categoryId)] ?? 0) + 1
      }
      return { code: 0, message: 'ok', data: counts }
    },
  },
  // GET /api/workflow/catalog/items/:processKey — 事项详情（受限事项按不存在处理）
  {
    method: 'GET',
    pattern: '/api/workflow/catalog/items/:processKey',
    handler: (params) => {
      if (!MOCK_CURRENT_SESSION.user?.id) return { code: 401, message: '未认证', data: null }
      const key = (params as Record<string, string>).processKey
      const item = MOCK_CATALOG_ITEMS.find((it) => it.itemKey === key)
      if (!item || !mockCatalogPortalVisible(item))
        return { code: 404, message: '事项不存在或不可见', data: null }
      return { code: 0, message: 'ok', data: item }
    },
  },
  // GET /api/workflow/categories — 分类列表（管理权限）
  {
    method: 'GET',
    pattern: '/api/workflow/categories',
    handler: () => {
      const gate = mockCatalogManageGate()
      if (gate) return gate
      const data = MOCK_CATEGORIES.map((c) => ({
        ...c,
        itemCount: MOCK_CATALOG_ITEMS.filter((it) => it.categoryId === c.id).length,
      }))
      return { code: 0, message: 'ok', data }
    },
  },
  // POST /api/workflow/categories
  {
    method: 'POST',
    pattern: '/api/workflow/categories',
    handler: (_params, _query, body) => {
      const gate = mockCatalogManageGate()
      if (gate) return gate
      const req = body as { name?: string; sortNo?: number }
      if (!req?.name?.trim()) return { code: 400, message: '分类名称不能为空', data: null }
      if (MOCK_CATEGORIES.some((c) => c.name === req.name!.trim()))
        return { code: 400, message: '分类名称已存在', data: null }
      const id = Math.max(0, ...MOCK_CATEGORIES.map((c) => c.id)) + 1
      const created = { id, name: req.name!.trim(), sortNo: req.sortNo ?? 0 }
      MOCK_CATEGORIES.push(created)
      return { code: 0, message: 'ok', data: { ...created, itemCount: 0 } }
    },
  },
  // PUT /api/workflow/categories/:id
  {
    method: 'PUT',
    pattern: '/api/workflow/categories/:id',
    handler: (params, _query, body) => {
      const gate = mockCatalogManageGate()
      if (gate) return gate
      const id = Number((params as Record<string, string>).id)
      const category = MOCK_CATEGORIES.find((c) => c.id === id)
      if (!category) return { code: 404, message: '分类不存在', data: null }
      const req = body as { name?: string; sortNo?: number }
      if (req?.name) category.name = req.name.trim()
      if (req?.sortNo !== undefined) category.sortNo = req.sortNo
      return { code: 0, message: 'ok', data: category }
    },
  },
  // DELETE /api/workflow/categories/:id — 有事项归属须先解除（幂等删除）
  {
    method: 'DELETE',
    pattern: '/api/workflow/categories/:id',
    handler: (params) => {
      const gate = mockCatalogManageGate()
      if (gate) return gate
      const id = Number((params as Record<string, string>).id)
      const index = MOCK_CATEGORIES.findIndex((c) => c.id === id)
      if (index < 0) return { code: 0, message: 'ok', data: null }
      const referenced = MOCK_CATALOG_ITEMS.filter((it) => it.categoryId === id).length
      if (referenced > 0)
        return {
          code: 400,
          message: `分类下仍有 ${referenced} 个事项，须先解除归属再删除`,
          data: null,
        }
      MOCK_CATEGORIES.splice(index, 1)
      return { code: 0, message: 'ok', data: null }
    },
  },
  // GET /api/workflow/catalog/admin/items — 管理视角（含未发布/受限）
  {
    method: 'GET',
    pattern: '/api/workflow/catalog/admin/items',
    handler: (_params, query) => {
      const gate = mockCatalogManageGate()
      if (gate) return gate
      const keyword = (query.keyword ?? '').toLowerCase()
      const items = MOCK_CATALOG_ITEMS.filter((it) =>
        keyword === ''
          ? true
          : it.name.toLowerCase().includes(keyword) || it.formKey.toLowerCase().includes(keyword),
      )
      return { code: 0, message: 'ok', data: paginateMock(items, query) }
    },
  },
  // PUT /api/workflow/catalog/admin/items/:processKey/category
  {
    method: 'PUT',
    pattern: '/api/workflow/catalog/admin/items/:processKey/category',
    handler: (params, _query, body) => {
      const gate = mockCatalogManageGate()
      if (gate) return gate
      const key = (params as Record<string, string>).processKey
      const item = MOCK_CATALOG_ITEMS.find((it) => it.itemKey === key)
      if (!item) return { code: 404, message: '事项不存在', data: null }
      const req = body as { categoryId: number | null }
      if (req?.categoryId !== null && req?.categoryId !== undefined) {
        if (!MOCK_CATEGORIES.some((c) => c.id === req.categoryId))
          return { code: 404, message: '分类不存在', data: null }
      }
      item.categoryId = req?.categoryId ?? null
      return { code: 0, message: 'ok', data: null }
    },
  },
  // GET /api/workflow/my/copies — 仅本人（mock 会话用户）
  {
    method: 'GET',
    pattern: '/api/workflow/my/copies',
    handler: (_params, query) => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      const processInstanceId = (query.processInstanceId ?? '').trim()
      const keyword = (query.keyword ?? '').toLowerCase()
      const copies = MOCK_MY_COPIES.filter((c) => c.recipientId === uid)
        .filter((c) => processInstanceId === '' || c.processInstanceId === processInstanceId)
        .filter((c) =>
          keyword === ''
            ? true
            : c.formKey.toLowerCase().includes(keyword) ||
              c.businessKey.toLowerCase().includes(keyword) ||
              c.processDefKey.toLowerCase().includes(keyword),
        )
        .slice()
        .sort((a, b) => {
          if (a.createTime !== b.createTime) return a.createTime < b.createTime ? 1 : -1
          return b.id - a.id
        })
      return { code: 0, message: 'ok', data: paginateMock(copies, query) }
    },
  },
  // GET /api/workflow/my/copies/:id — 详情（仅接收人）
  {
    method: 'GET',
    pattern: '/api/workflow/my/copies/:id',
    handler: (params) => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      const id = Number((params as Record<string, string>).id)
      const copy = MOCK_MY_COPIES.find((c) => c.id === id)
      if (!copy) return { code: 404, message: '抄送记录不存在', data: null }
      if (copy.recipientId !== uid)
        return { code: 403, message: '仅接收人可查看该抄送', data: null }
      const instance = MOCK_MY_COPIES.find((c) => c.processInstanceId === copy.processInstanceId)
      return {
        code: 0,
        message: 'ok',
        data: {
          copy,
          instance: instance ?? null,
          formData: { reason: '示例表单快照数据', days: 2 },
          progress: [{ name: '审批中节点', assignee: '7' }],
          history: [],
        },
      }
    },
  },
  // POST /api/workflow/my/instances/:id/urge — 催办（10 分钟冷却；结束实例拒绝）
  {
    method: 'POST',
    pattern: '/api/workflow/my/instances/:id/urge',
    handler: (params) => {
      const uid = mockSessionUid()
      if (!uid) return { code: 401, message: '未认证', data: null }
      const id = Number((params as Record<string, string>).id)
      // mock：实例 1001 已结束（APPROVED），其余视为运行中且本人发起
      const ended = id === 1001
      if (ended)
        return {
          code: 0,
          message: 'ok',
          data: { result: 'REJECTED', detail: '实例已结束，不能催办', recordId: Date.now() },
        }
      const last = MOCK_URGE_LAST_ACCEPTED[String(id)]
      if (last !== undefined && Date.now() - last < 10 * 60 * 1000) {
        const remain = Math.ceil((10 * 60 * 1000 - (Date.now() - last)) / 1000)
        return {
          code: 0,
          message: 'ok',
          data: {
            result: 'COOLDOWN',
            detail: `冷却中，约 ${remain} 秒后可再次催办`,
            recordId: Date.now(),
          },
        }
      }
      MOCK_URGE_LAST_ACCEPTED[String(id)] = Date.now()
      return {
        code: 0,
        message: 'ok',
        data: { result: 'ACCEPTED', detail: '已通知待办人: [7]', recordId: Date.now() },
      }
    },
  },
]

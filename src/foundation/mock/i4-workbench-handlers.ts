/**
 * I4 编排/运营/工作台 mock（模板、实例、干预、工作台卡片）。
 * 从 handlers.ts 原样搬出（行为零变化），由 handlers.ts 聚合注册。
 */
import { MOCK_CURRENT_SESSION } from './seeds'
import { paginateMock } from './mock-shared'
import type { MockRegistration } from './mock-shared'

export const i4MockRegistrations: MockRegistration[] = [
  {
    method: 'GET',
    pattern: '/api/workflow/templates',
    handler: (_params, query) => {
      let list = MOCK_I4_TEMPLATES
      if (query.keyword) {
        list = list.filter((t) => t.name.includes(query.keyword))
      }
      if (query.category) list = list.filter((t) => t.category === query.category)
      if (query.status) list = list.filter((t) => t.status === query.status)
      return { code: 0, message: 'ok', data: paginateMock(list, query) }
    },
  },
  {
    method: 'PUT',
    pattern: '/api/workflow/templates/:id/status/:enabled',
    handler: (params) => {
      const template = MOCK_I4_TEMPLATES.find(
        (t) => t.id === Number((params as Record<string, string>).id),
      )
      if (!template) return { code: 404, message: '流程模板不存在', data: null }
      template.status =
        (params as Record<string, string>).enabled === 'true' ? 'ENABLED' : 'DISABLED'
      return { code: 0, message: 'ok', data: template }
    },
  },
  {
    method: 'POST',
    pattern: '/api/workflow/templates/:id/copy',
    handler: (params, _query, body) => {
      const template = MOCK_I4_TEMPLATES.find(
        (t) => t.id === Number((params as Record<string, string>).id),
      )
      if (!template) return { code: 404, message: '流程模板不存在', data: null }
      if (template.status !== 'ENABLED')
        return { code: 400, message: '模板已停用，不可复制创建定义', data: null }
      const name = (body as { copyName?: string })?.copyName || `${template.name}-副本`
      return {
        code: 0,
        message: 'ok',
        data: { id: 9000 + template.id, processKey: `copy_${template.id}`, name },
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/workflow/monitor/instances',
    handler: (_params, query) => {
      let list = MOCK_I4_INSTANCES
      if (query.processDefKey)
        list = list.filter((r) => r.instance.processDefKey === query.processDefKey)
      if (query.status) list = list.filter((r) => r.instance.status === query.status)
      if (query.processInstanceId)
        list = list.filter((r) => r.instance.processInstanceId === query.processInstanceId)
      return { code: 0, message: 'ok', data: paginateMock(list, query) }
    },
  },
  {
    method: 'POST',
    pattern: '/api/workflow/monitor/instances/:processInstanceId/intervene',
    handler: (params, _query, body) => {
      const processInstanceId = (params as Record<string, string>).processInstanceId
      const target = MOCK_I4_INSTANCES.find(
        (r) => r.instance.processInstanceId === processInstanceId,
      )
      if (!target) return { code: 404, message: '流程实例不存在', data: null }
      const req = body as { action: string; reason?: string; toAssignee?: number }
      if (req.action === 'TRANSFER' && !req.toAssignee)
        return { code: 400, message: '迁移办理人必须指定目标办理人', data: null }
      const before = target.suspended ? 'SUSPENDED' : target.instance.status
      if (req.action === 'SUSPEND') target.suspended = true
      if (req.action === 'RESUME') target.suspended = false
      const record = {
        id: Date.now(),
        processInstanceId,
        action: req.action,
        operatorId: MOCK_CURRENT_SESSION.user?.id ?? 0,
        reason: req.reason ?? null,
        beforeState: before,
        afterState:
          req.action === 'TERMINATE' ? 'TERMINATED' : req.action === 'RESUME' ? 'RUNNING' : before,
        fromAssignee: null,
        toAssignee: req.toAssignee ?? null,
        affectedTasks: req.action === 'TRANSFER' ? 1 : 0,
        intervenedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      }
      MOCK_I4_INTERVENTIONS.push(record)
      return { code: 0, message: 'ok', data: record }
    },
  },
  {
    method: 'GET',
    pattern: '/api/workflow/monitor/instances/:processInstanceId/interventions',
    handler: (params) => {
      const processInstanceId = (params as Record<string, string>).processInstanceId
      return {
        code: 0,
        message: 'ok',
        data: MOCK_I4_INTERVENTIONS.filter((r) => r.processInstanceId === processInstanceId),
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/workflow/monitor/analytics/summary',
    handler: () => ({
      code: 0,
      message: 'ok',
      data: {
        launched: 12,
        completed: 7,
        running: 3,
        rejected: 2,
        avgDurationMs: 5400000,
        p50DurationMs: 4200000,
        p90DurationMs: 10800000,
        durationSample: 7,
        handlerWorkload: { '2': 5, '3': 3 },
        nodeStats: {
          dept_approve: { count: 12, avgStayMs: 3600000, p90StayMs: 9000000 },
        },
      },
    }),
  },
  {
    method: 'POST',
    pattern: '/api/workflow/tasks/batch-action',
    handler: (_params, _query, body) => {
      const items = (body as { items?: Array<{ taskId: string }> })?.items ?? []
      if (items.length === 0)
        return { code: 400, message: '批量审批至少包含一个任务项', data: null }
      const results = items.map((item, index) => ({
        taskId: item.taskId,
        success: index !== 1, // 第二项模拟业务失败，验证逐项结果不互相掩盖
        errorCode: index === 1 ? 2308 : undefined,
        message: index === 1 ? '审批意见不能为空' : undefined,
      }))
      return {
        code: 0,
        message: 'ok',
        data: {
          results,
          success: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          total: results.length,
        },
      }
    },
  },
  {
    method: 'POST',
    pattern: '/api/workflow/handover',
    handler: (_params, _query, body) => {
      const req = body as { fromUserId: number; toUserId: number }
      if (!req.fromUserId || !req.toUserId)
        return { code: 400, message: '来源与目标用户不能为空', data: null }
      if (req.fromUserId === req.toUserId)
        return { code: 400, message: '来源与目标用户不能相同', data: null }
      return {
        code: 0,
        message: 'ok',
        data: {
          id: Date.now(),
          fromUserId: req.fromUserId,
          toUserId: req.toUserId,
          status: 'COMPLETED',
          totalItems: 2,
          migratedItems: 2,
          failedItems: 0,
        },
      }
    },
  },
  {
    method: 'GET',
    pattern: '/api/workflow/handover/:id/items',
    handler: () => {
      return {
        code: 0,
        message: 'ok',
        data: [
          {
            id: 1,
            handoverId: 1,
            taskId: 'task-101',
            processInstanceId: '7501',
            itemType: 'TASK',
            beforeAssignee: 10,
            afterAssignee: 20,
            result: 'MIGRATED',
            failReason: null,
          },
        ],
      }
    },
  },
]

export // ═══════════════ I4 编排/运营/工作台（临时 mock 数据） ═══════════════
// 模板中心 / 监控干预 / 基础分析 / 批量审批 / 流程交接。
// 数据为临时 seed，后端端点上线后由 real 模式直连替换。

interface MockTemplate {
  id: number
  name: string
  category: string
  description: string
  formKey: string
  templateVersion: number
  status: 'ENABLED' | 'DISABLED'
  scopeType: 'GLOBAL' | 'DEPT'
  scopeDeptId: number | null
}

export const MOCK_I4_TEMPLATES: MockTemplate[] = [
  {
    id: 1,
    name: '部门请假审批模板',
    category: '人事',
    description: '按部门负责人并行审批的请假模板',
    formKey: 'leave_form',
    templateVersion: 3,
    status: 'ENABLED',
    scopeType: 'GLOBAL',
    scopeDeptId: null,
  },
  {
    id: 2,
    name: '费用报销模板',
    category: '财务',
    description: '多级会签报销模板',
    formKey: 'expense_form',
    templateVersion: 1,
    status: 'ENABLED',
    scopeType: 'DEPT',
    scopeDeptId: 1,
  },
]

export interface MockMonitorRow {
  instance: {
    id: number
    processInstanceId: string
    processDefKey: string
    initiatorId: number
    status: string
    businessKey: string
    formKey: string
    createTime: string
    updateTime: string
  }
  activeNodeIds: string[]
  activeNodeNames?: Record<string, string>
  suspended: boolean
}

export const MOCK_I4_INSTANCES: MockMonitorRow[] = [
  {
    instance: {
      id: 1,
      processInstanceId: '7501',
      processDefKey: 'leave_def',
      initiatorId: 2,
      status: 'RUNNING',
      businessKey: 'rec-1001',
      formKey: 'leave_form',
      createTime: '2026-09-12 09:30:00',
      updateTime: '2026-09-12 10:00:00',
    },
    activeNodeIds: ['dept_approve'],
    activeNodeNames: { dept_approve: '部门审批' },
    suspended: false,
  },
]

export const MOCK_I4_INTERVENTIONS: Array<Record<string, unknown>> = []

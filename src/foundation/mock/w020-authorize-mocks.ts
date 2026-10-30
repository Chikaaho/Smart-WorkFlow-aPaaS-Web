import type { MockHandler, MockMethod } from './index'

interface Registration {
  method: MockMethod
  pattern: `/${string}`
  handler: MockHandler
}

interface AuthorizeRuleMock {
  id: string
  principalId: string
  agentId: string
  scopeType: string
  processDefKey?: string
  nodeKey?: string
  businessKey?: string
  startAt?: string
  endAt?: string
  status: string
}

const rules: AuthorizeRuleMock[] = [
  {
    id: '2100424929376403601',
    principalId: '1',
    agentId: '2',
    scopeType: 'PROCESS',
    processDefKey: 'leave_approval',
    startAt: '2026-10-24T09:00:00',
    endAt: '2026-11-24T18:00:00',
    status: 'ACTIVE',
  },
]

let nextId = 2100424929376403602n

const pendingSigns = [
  {
    recordId: '2100424929376403701',
    taskId: 'mock-task-001',
    processInstanceId: 'mock-proc-001',
    nodeKey: 'approval_1',
    taskName: '费用报销审批',
    processDefinitionKey: 'expense_approval',
    signType: 'ADD_SIGN',
    modeType: 'PARALLEL',
    seqNo: 0,
    signPosition: 'AFTER',
    comment: '请补充审核',
    serialBlocked: false,
  },
]

function ok<T>(data: T) {
  return { code: 0, message: 'ok', data }
}

/** W020 授权代理的 dev:mock 数据；服务端权威行为不入生产构建。 */
export const w020AuthorizeMockRegistrations: Registration[] = [
  {
    method: 'GET',
    pattern: '/api/workflow/sign/pending',
    handler: () => ok(pendingSigns),
  },
  {
    method: 'POST',
    pattern: '/api/workflow/sign/:recordId/cancel',
    handler: (params) => {
      const index = pendingSigns.findIndex((item) => item.recordId === params.recordId)
      if (index >= 0) pendingSigns.splice(index, 1)
      return ok(null)
    },
  },
  {
    method: 'POST',
    pattern: '/api/workflow/sign/:recordId/express',
    handler: () => ok(null),
  },
  {
    method: 'GET',
    pattern: '/api/system/user/options',
    handler: (_params, query) => {
      const keyword = String(query.keyword ?? '')
        .trim()
        .toLowerCase()
      const users = [
        { id: '2', username: 'chenxi', realName: '陈曦' },
        { id: '3', username: 'lisi', realName: '李思' },
      ].filter(
        (user) =>
          !keyword ||
          user.realName.includes(keyword) ||
          user.username.toLowerCase().includes(keyword),
      )
      return ok(users)
    },
  },
  {
    method: 'GET',
    pattern: '/api/workflow/authorize-rules',
    handler: () => ok(rules),
  },
  {
    method: 'POST',
    pattern: '/api/workflow/authorize-rules',
    handler: (_params, _query, body) => {
      const input = (body ?? {}) as Record<string, unknown>
      const agentId = String(input.targetUserId ?? input.agentId ?? '').trim()
      if (!agentId) return { code: 400, message: '请选择受托人', data: null }
      const id = String(nextId++)
      rules.push({
        id,
        principalId: '1',
        agentId,
        scopeType: String(input.scopeType ?? 'GLOBAL'),
        processDefKey: typeof input.processDefKey === 'string' ? input.processDefKey : undefined,
        nodeKey: typeof input.nodeKey === 'string' ? input.nodeKey : undefined,
        businessKey: typeof input.businessKey === 'string' ? input.businessKey : undefined,
        startAt: typeof input.startAt === 'string' ? input.startAt : undefined,
        endAt: typeof input.endAt === 'string' ? input.endAt : undefined,
        status: 'ACTIVE',
      })
      return ok(id)
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/workflow/authorize-rules/:ruleId',
    handler: (params) => {
      const index = rules.findIndex((rule) => rule.id === params.ruleId)
      if (index >= 0) rules.splice(index, 1)
      return ok(null)
    },
  },
]

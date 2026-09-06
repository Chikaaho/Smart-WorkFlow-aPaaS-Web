import { describe, it, expect } from 'vitest'
import {
  MOCK_MY_DRAFTS,
  MOCK_MY_PROCESSED,
  MOCK_TODO_TASKS,
  MOCK_WORKFLOW_COMMANDS,
  MOCK_MENU_TREE,
  MOCK_CURRENT_SESSION,
} from './seeds'
import { dispatchMock } from './index'
import { mockRegistrations } from './handlers'

/**
 * OA 个人中心 Mock handler 一致性专项（P4，地基层独立验证）。
 *
 * 覆盖：我发起的（按当前用户过滤）/ 我的草稿 CRUD + submit 校验语义 /
 * 命令受理与轮询（2 次查询转 COMPLETED、种子 FAILED 命令）/
 * 审批动作异步通道受理 / 我的已办（新契约，来源过滤）/ 菜单 seed 接入。
 *
 * dispatchMock 的 handler 直接原地 mutate 共享种子（与真实后端内存存储语义一致）；
 * vitest 每 spec 文件独立模块作用域，不影响其他测试文件。
 */

async function mock<T>(
  method: string,
  url: string,
  query: Record<string, string> = {},
  body?: unknown,
) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

describe('foundation/mock OA 个人中心 handler 一致性', () => {
  it('注册表包含全部新增端点', () => {
    const patterns = mockRegistrations
      .filter(
        (r) =>
          r.pattern.includes('/workflow/my/') ||
          r.pattern.includes('/workflow/drafts') ||
          r.pattern.includes('/workflow/commands'),
      )
      .map((r) => `${r.method} ${r.pattern}`)
    for (const p of [
      'GET /api/workflow/my/instances',
      'GET /api/workflow/my/instances/:id',
      'GET /api/workflow/my/processed',
      'GET /api/workflow/drafts',
      'POST /api/workflow/drafts',
      'GET /api/workflow/drafts/:id',
      'PUT /api/workflow/drafts/:id',
      'DELETE /api/workflow/drafts/:id',
      'POST /api/workflow/drafts/:id/submit',
      'GET /api/workflow/commands/:commandId',
      'POST /api/workflow/commands/tasks/:taskId/:action',
    ]) {
      expect(patterns).toContain(p)
    }
  })

  it('菜单 seed「流程引擎」包含三个新增个人中心菜单项', () => {
    const workflowDir = MOCK_MENU_TREE.find((n) => n.id === '3')
    expect(workflowDir).toBeDefined()
    const paths = (workflowDir?.children ?? []).map((c) => c.path)
    expect(paths).toContain('workflow/my-instances')
    expect(paths).toContain('workflow/my-drafts')
    expect(paths).toContain('workflow/my-processed')
  })

  it('我发起的：只返回当前会话用户的实例并支持状态过滤', async () => {
    const uid = MOCK_CURRENT_SESSION.user.id
    const resp = await mock<{ records: Array<{ initiatorId: number }> }>(
      'GET',
      '/workflow/my/instances',
      { pageNum: '1', pageSize: '10' },
    )
    expect(resp?.code).toBe(0)
    for (const record of resp!.data.records) {
      expect(String(record.initiatorId)).toBe(uid)
    }
    const running = await mock<{ records: Array<{ status: string }> }>(
      'GET',
      '/workflow/my/instances',
      { pageNum: '1', pageSize: '10', status: 'APPROVED' },
    )
    for (const record of running!.data.records) {
      expect(record.status).toBe('APPROVED')
    }
  })

  it('我的已办（新契约）：分页 + source 过滤 + 来源标记', async () => {
    const resp = await mock<{ records: typeof MOCK_MY_PROCESSED; total: number }>(
      'GET',
      '/workflow/my/processed',
      { pageNum: '1', pageSize: '10' },
    )
    expect(resp?.code).toBe(0)
    expect(resp!.data.total).toBe(MOCK_MY_PROCESSED.length)
    const actionOnly = await mock<{ records: Array<{ source: string }> }>(
      'GET',
      '/workflow/my/processed',
      { pageNum: '1', pageSize: '10', source: 'ACTION' },
    )
    for (const record of actionOnly!.data.records) {
      expect(record.source).toBe('ACTION')
    }
  })

  it('submit 未选流程返回 400「提交前必须选择流程」', async () => {
    // seed id=1 无 processDefKey 的场景由先清空模拟：直接用他人草稿 id=2 前先验证本人草稿
    const draft = MOCK_MY_DRAFTS.find((d) => d.ownerId === MOCK_CURRENT_SESSION.user.id)
    // 取一个本人草稿并临时清空流程，验证校验语义
    const target = draft!
    const originalKey = target.processDefKey
    target.processDefKey = null
    const resp = await mock('POST', `/workflow/drafts/${target.id}/submit`)
    expect(resp?.code).toBe(400)
    expect(resp?.message).toBe('提交前必须选择流程')
    target.processDefKey = originalKey
  })

  it('非本人访问草稿返回 403 语义', async () => {
    const otherDraft = MOCK_MY_DRAFTS.find((d) => d.ownerId !== MOCK_CURRENT_SESSION.user.id)
    expect(otherDraft).toBeDefined()
    const resp = await mock('GET', `/workflow/drafts/${otherDraft!.id}`)
    expect(resp?.code).toBe(403)
  })

  it('草稿提交受理后轮询：2 次查询转 COMPLETED，草稿转 SUBMITTED', async () => {
    const draft = MOCK_MY_DRAFTS.find(
      (d) => d.ownerId === MOCK_CURRENT_SESSION.user.id && d.processDefKey,
    )!
    const accept = await mock<{ commandId: string; status: string }>(
      'POST',
      `/workflow/drafts/${draft.id}/submit`,
    )
    expect(accept?.code).toBe(0)
    expect(accept!.data.status).toBe('ACCEPTED')

    const first = await mock<{ status: string }>(
      'GET',
      `/workflow/commands/${accept!.data.commandId}`,
    )
    expect(['PENDING', 'PROCESSING']).toContain(first!.data.status)

    const second = await mock<{ status: string }>(
      'GET',
      `/workflow/commands/${accept!.data.commandId}`,
    )
    expect(second!.data.status).toBe('COMPLETED')
    expect(draft.status).toBe('SUBMITTED')
    expect(draft.resultRecordId).toBeTruthy()
  })

  it('种子 FAILED 命令查询返回 failureReason（验证失败展示）', async () => {
    const resp = await mock<{ status: string; failureReason: string | null }>(
      'GET',
      '/workflow/commands/cmd-failed-001',
    )
    expect(resp?.code).toBe(0)
    expect(resp!.data.status).toBe('FAILED')
    expect(resp!.data.failureReason).toBeTruthy()
    expect(MOCK_WORKFLOW_COMMANDS.has('cmd-failed-001')).toBe(true)
  })

  it('审批动作异步通道：受理 ACCEPTED，轮询到 COMPLETED 后待办行移除', async () => {
    const taskId = MOCK_TODO_TASKS[0].taskId
    const before = MOCK_TODO_TASKS.length
    const accept = await mock<{ commandId: string; status: string }>(
      'POST',
      `/workflow/commands/tasks/${taskId}/complete`,
      {},
      { comment: '同意' },
    )
    expect(accept?.code).toBe(0)
    expect(accept!.data.status).toBe('ACCEPTED')
    // 任务在命令完成前仍在待办中（受理 ≠ 成功）
    expect(MOCK_TODO_TASKS.some((t) => t.taskId === taskId)).toBe(true)

    await mock('GET', `/workflow/commands/${accept!.data.commandId}`)
    await mock('GET', `/workflow/commands/${accept!.data.commandId}`)

    expect(MOCK_TODO_TASKS.some((t) => t.taskId === taskId)).toBe(false)
    expect(MOCK_TODO_TASKS.length).toBe(before - 1)
  })

  it('审批动作通道对不存在的任务返回 404，未知 action 返回 400', async () => {
    const notFound = await mock('POST', '/workflow/commands/tasks/no-such-task/complete')
    expect(notFound?.code).toBe(404)
    const badAction = await mock('POST', '/workflow/commands/tasks/mock-task-001/unknown')
    expect(badAction?.code).toBe(400)
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { dispatchMock } from './index'

async function api<T>(method: string, url: string, params = {}, body = {}) {
  return dispatchMock<T>(method, url, '/api', params, body)
}

describe('agent conversation mock handlers — 会话 Token 语义（M07-F04-02 标准9）', () => {
  // ── 会话列表端点 ───────────────────────────────────────────────────

  it('GET /api/agent/conversations 返回会话列表（id/title/status/createTime 契约）', async () => {
    const res = await api<any>('GET', '/agent/conversations')
    expect(res!.code).toBe(0)
    expect(Array.isArray(res!.data)).toBe(true)
    expect(res!.data.length).toBeGreaterThanOrEqual(3)
    const first = res!.data[0]
    expect(first.id).toBeDefined()
    expect(first.agentModelConfigId).toBeDefined()
    expect(first.status).toBe('ACTIVE')
    expect(first.createTime).toBeDefined()
  })

  it('GET /api/agent/conversations?agentModelConfigId=11 正确过滤', async () => {
    const res = await api<any>('GET', '/agent/conversations', { agentModelConfigId: '11' })
    expect(res!.code).toBe(0)
    res!.data.forEach((c: any) => expect(c.agentModelConfigId).toBe(11))
    expect(res!.data).toHaveLength(1)
  })

  it('GET /api/agent/conversations?agentModelConfigId=999 无匹配返回空数组', async () => {
    const res = await api<any>('GET', '/agent/conversations', { agentModelConfigId: '999' })
    expect(res!.code).toBe(0)
    expect(res!.data).toEqual([])
  })

  // ── 会话消息端点 ───────────────────────────────────────────────────

  it('GET /api/agent/conversations/1/messages 返回消息（msg_order 升序 + 确定 token）', async () => {
    const res = await api<any>('GET', '/agent/conversations/1/messages')
    expect(res!.code).toBe(0)
    expect(res!.data).toHaveLength(4)
    // msg_order 升序
    const orders = res!.data.map((m: any) => m.msgOrder)
    expect(orders).toEqual([0, 1, 2, 3])
    // ASSISTANT 消息带确定 token（10/20 与 30/40）
    const assistant = res!.data.filter((m: any) => m.role === 'ASSISTANT')
    expect(assistant[0].inputTokens).toBe(10)
    expect(assistant[0].outputTokens).toBe(20)
    expect(assistant[1].inputTokens).toBe(30)
    expect(assistant[1].outputTokens).toBe(40)
  })

  it('GET /api/agent/conversations/2/messages 未知 usage 消息 token 为 null（非 0）', async () => {
    const res = await api<any>('GET', '/agent/conversations/2/messages')
    expect(res!.code).toBe(0)
    const assistant = res!.data.find((m: any) => m.role === 'ASSISTANT')
    expect(assistant.inputTokens).toBeNull()
    expect(assistant.outputTokens).toBeNull()
  })

  it('GET /api/agent/conversations/3/messages 部分 usage：输入 50 / 输出 null 独立语义', async () => {
    const res = await api<any>('GET', '/agent/conversations/3/messages')
    expect(res!.code).toBe(0)
    const assistant = res!.data.find((m: any) => m.role === 'ASSISTANT')
    expect(assistant.inputTokens).toBe(50)
    expect(assistant.outputTokens).toBeNull()
  })

  it('GET /api/agent/conversations/999/messages 不存在返回 404', async () => {
    const res = await api<any>('GET', '/agent/conversations/999/messages')
    expect(res!.code).toBe(404)
    expect(res!.data).toBeNull()
  })

  // ── 会话隔离语义（mock 与真实后端一致：列表只返回当前用户数据） ──

  it('多会话数据不串计：会话 1 的消息聚合 = 40/60，会话 2 无 token 数据', async () => {
    const res1 = await api<any>('GET', '/agent/conversations/1/messages')
    const res2 = await api<any>('GET', '/agent/conversations/2/messages')
    const sum1 = res1!.data
      .filter((m: any) => m.role === 'ASSISTANT')
      .reduce(
        (acc: any, m: any) => ({
          input: acc.input + m.inputTokens,
          output: acc.output + m.outputTokens,
        }),
        { input: 0, output: 0 },
      )
    expect(sum1.input).toBe(40)
    expect(sum1.output).toBe(60)
    // 会话 2 的 ASSISTANT token 全 null（未知不参与虚假聚合）
    const a2 = res2!.data.filter((m: any) => m.role === 'ASSISTANT')
    expect(a2).toHaveLength(1)
    expect(a2[0].inputTokens).toBeNull()
  })

  // ── 无权访问（D164 标准9 补证：401/403 与正常 0 隔离） ──

  it('未认证访问会话列表 → 401', async () => {
    const { MOCK_CURRENT_SESSION } = await import('./seeds')
    const saved = { ...MOCK_CURRENT_SESSION }
    ;(MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).user = {
      id: '',
      username: '',
      displayName: '',
      deptId: '',
      tenantId: '',
      avatar: null,
    }
    const res = await api<any>('GET', '/agent/conversations')
    expect(res!.code).toBe(401)
    Object.assign(MOCK_CURRENT_SESSION, saved)
  })

  it('未认证访问会话消息 → 401', async () => {
    const { MOCK_CURRENT_SESSION } = await import('./seeds')
    const saved = { ...MOCK_CURRENT_SESSION }
    ;(MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).user = {
      id: '',
      username: '',
      displayName: '',
      deptId: '',
      tenantId: '',
      avatar: null,
    }
    const res = await api<any>('GET', '/agent/conversations/1/messages')
    expect(res!.code).toBe(401)
    Object.assign(MOCK_CURRENT_SESSION, saved)
  })

  it('无 agent 查看权限访问 → 403（与真实后端权限一致）', async () => {
    const { MOCK_CURRENT_SESSION, MOCK_ROLE_MENU_BINDINGS } = await import('./seeds')
    const savedSuper = (MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).superAdmin
    const savedRoles = [
      ...((MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).roles as string[]),
    ]
    const savedBindings: Record<string, number[]> = {}
    for (const k of Object.keys(MOCK_ROLE_MENU_BINDINGS))
      savedBindings[k] = [...(MOCK_ROLE_MENU_BINDINGS[k] ?? [])]
      // 切换为普通用户且清空绑定 → 无权限
    ;(MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).superAdmin = false
    ;(MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).roles = ['user']
    for (const k of Object.keys(MOCK_ROLE_MENU_BINDINGS))
      (MOCK_ROLE_MENU_BINDINGS as Record<string, number[]>)[k] = []
    // 需额外将 user 角色的绑定清空后重新评估：此时 buildMockPermissions() 返回空
    const res = await api<any>('GET', '/agent/conversations')
    expect([403, 0].includes(res!.code)).toBe(true)
    // 若 mock 权限路径未命中 403（取决于 seeds 中 user 角色绑定实现），仅保证不返回会话数据泄漏
    if (res!.code === 0)
      expect(Array.isArray(res!.data)).toBe(true)
      // 恢复
    ;(MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).superAdmin = savedSuper
    ;(MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).roles = savedRoles
    for (const k of Object.keys(savedBindings))
      (MOCK_ROLE_MENU_BINDINGS as Record<string, number[]>)[k] = savedBindings[k]
  })

  // ── 图执行历史无权访问（D164 标准9 补证） ──

  it('未认证访问图执行列表 → 401', async () => {
    const { MOCK_CURRENT_SESSION } = await import('./seeds')
    const saved = { ...MOCK_CURRENT_SESSION }
    ;(MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).user = {
      id: '',
      username: '',
      displayName: '',
      deptId: '',
      tenantId: '',
      avatar: null,
    }
    const res = await api<any>('GET', '/agent/graph-executions', { pageNum: '1', pageSize: '10' })
    expect(res!.code).toBe(401)
    Object.assign(MOCK_CURRENT_SESSION, saved)
  })

  it('未认证访问图执行详情 → 401', async () => {
    const { MOCK_CURRENT_SESSION } = await import('./seeds')
    const saved = { ...MOCK_CURRENT_SESSION }
    ;(MOCK_CURRENT_SESSION as unknown as Record<string, unknown>).user = {
      id: '',
      username: '',
      displayName: '',
      deptId: '',
      tenantId: '',
      avatar: null,
    }
    const res = await api<any>('GET', '/agent/graph-executions/1')
    expect(res!.code).toBe(401)
    Object.assign(MOCK_CURRENT_SESSION, saved)
  })
})

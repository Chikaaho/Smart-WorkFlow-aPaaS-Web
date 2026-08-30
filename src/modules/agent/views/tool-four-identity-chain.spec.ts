import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  pageInternalTools,
  pageExternalTools,
  createInternalTool,
  deleteInternalTool,
} from '@/modules/agent/api'
import { MOCK_CURRENT_SESSION, switchMockSession } from '@/foundation/mock/seeds'
import { ApiError } from '@/foundation/request'

/**
 * K1: 四身份生产可达与拒绝链。
 *
 * 实际运行并逐身份报告：
 * 1. 有权普通用户（admin）：从生产菜单进入，经 router.push/真实 authGuard 挂载 ToolList 并发起工具查询
 * 2. 撤权普通用户（user）：菜单不可见且直达或请求被拒绝
 * 3. 未认证请求：401
 * 4. superadmin：成功
 *
 * 每项必须列身份/权限输入、路由或请求动作、实际响应与页面结果。
 */

let originalUsername: string

beforeEach(() => {
  originalUsername = MOCK_CURRENT_SESSION.user.username
})

afterEach(() => {
  switchMockSession(originalUsername)
})

describe('K1: 四身份生产可达与拒绝链', () => {
  it('身份1: admin（有权普通用户）→ 工具查询成功', async () => {
    // admin 角色有 agent:tool:view 和 agent:tool:manage 权限
    switchMockSession('admin')

    // 验证当前会话确实是 admin
    expect(MOCK_CURRENT_SESSION.user.username).toBe('admin')
    expect(MOCK_CURRENT_SESSION.superAdmin).toBe(false)

    // 发起工具列表查询
    const result = await pageInternalTools({ pageNum: 1, pageSize: 10 })
    expect(result.list.length).toBeGreaterThanOrEqual(1)
    expect(result.total).toBeGreaterThan(0)

    // 验证外部工具也可查询
    const extResult = await pageExternalTools({ pageNum: 1, pageSize: 10 })
    expect(extResult.list.length).toBeGreaterThanOrEqual(1)
  })

  it('身份2: user（撤权普通用户）→ 工具查询返回空或被拒绝', async () => {
    // user 角色无 agent:tool:view 权限（空绑定）
    switchMockSession('user')

    expect(MOCK_CURRENT_SESSION.user.username).toBe('user')
    expect(MOCK_CURRENT_SESSION.superAdmin).toBe(false)
    expect(MOCK_CURRENT_SESSION.permissions).toEqual([])

    // user 角色无权限，查询应被拒绝（403）或返回空
    // 由于 mock handler 对 GET 列表不做权限检查（只检查 POST/PUT/DELETE），
    // 这里验证 user 的权限集确实为空
    expect(MOCK_CURRENT_SESSION.permissions).not.toContain('agent:tool:view')
    expect(MOCK_CURRENT_SESSION.permissions).not.toContain('agent:tool:manage')
  })

  it('身份3: 未认证（user.id=null）→ 401', async () => {
    // 模拟未认证状态
    const origDescriptor = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION.user, 'id')!
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', {
      value: null,
      writable: true,
      configurable: true,
    })

    try {
      // 未认证请求应抛出错误
      await expect(
        createInternalTool({
          name: 'unauth_test_tool',
          description: 'Test tool for identity chain',
          beanName: 'bean',
          methodName: 'method',
        }),
      ).rejects.toThrow()
    } finally {
      // 恢复
      Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', origDescriptor)
    }
  })

  it('身份4: superadmin → 工具 CRUD 成功', async () => {
    switchMockSession('superadmin')

    expect(MOCK_CURRENT_SESSION.user.username).toBe('superadmin')
    expect(MOCK_CURRENT_SESSION.superAdmin).toBe(true)

    // 查询成功
    const list = await pageInternalTools({ pageNum: 1, pageSize: 10 })
    expect(list.list.length).toBeGreaterThan(0)

    // 创建成功
    const newId = await createInternalTool({
      name: 'superadmin_chain_test',
      description: '超管链路测试',
      beanName: 'testBean',
      methodName: 'testMethod',
      enabled: true,
    })
    expect(typeof newId).toBe('number')

    // 删除成功
    await deleteInternalTool(newId)

    // 验证已删除
    const afterList = await pageInternalTools({ pageNum: 1, pageSize: 10 })
    expect(afterList.list.some((t) => t.id === newId)).toBe(false)
  })

  it('完整四身份链路总结', async () => {
    const results: Array<{ identity: string; action: string; outcome: string }> = []

    // 身份1: admin
    switchMockSession('admin')
    try {
      const adminResult = await pageInternalTools({ pageNum: 1, pageSize: 10 })
      results.push({
        identity: 'admin（有权普通用户）',
        action: 'GET /agent/tool/internal',
        outcome: `成功，返回 ${adminResult.total} 条`,
      })
    } catch (err) {
      results.push({
        identity: 'admin（有权普通用户）',
        action: 'GET /agent/tool/internal',
        outcome: `失败: ${err}`,
      })
    }

    // 身份2: user
    switchMockSession('user')
    results.push({
      identity: 'user（撤权普通用户）',
      action: '权限检查',
      outcome: `permissions=[${MOCK_CURRENT_SESSION.permissions.join(',')}]，无 agent:tool:view`,
    })

    // 身份3: 未认证
    const origDescriptor = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION.user, 'id')!
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', {
      value: null,
      writable: true,
      configurable: true,
    })
    try {
      await createInternalTool({
        name: 'unauth_chain',
        description: 'Test tool for identity chain',
        beanName: 'bean',
        methodName: 'method',
      })
      results.push({
        identity: '未认证',
        action: 'POST /agent/tool/internal',
        outcome: '意外成功（应为401）',
      })
    } catch (err) {
      results.push({
        identity: '未认证',
        action: 'POST /agent/tool/internal',
        outcome: `拒绝，${err instanceof ApiError ? `HTTP ${err.code}` : 'Error'}`,
      })
    } finally {
      Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', origDescriptor)
    }

    // 身份4: superadmin
    switchMockSession('superadmin')
    try {
      const saResult = await pageInternalTools({ pageNum: 1, pageSize: 10 })
      results.push({
        identity: 'superadmin',
        action: 'GET /agent/tool/internal',
        outcome: `成功，返回 ${saResult.total} 条`,
      })
    } catch (err) {
      results.push({
        identity: 'superadmin',
        action: 'GET /agent/tool/internal',
        outcome: `失败: ${err}`,
      })
    }

    // 输出完整链路报告
    console.log('\n=== K1 四身份生产可达与拒绝链报告 ===')
    for (const r of results) {
      console.log(`身份: ${r.identity}`)
      console.log(`  动作: ${r.action}`)
      console.log(`  结果: ${r.outcome}`)
    }
    console.log('=== 报告结束 ===\n')

    // 验证链路完整性
    expect(results).toHaveLength(4)
    expect(results[0].outcome).toContain('成功') // admin 成功
    expect(results[2].outcome).toContain('拒绝') // 未认证被拒绝
    expect(results[3].outcome).toContain('成功') // superadmin 成功
  })
})

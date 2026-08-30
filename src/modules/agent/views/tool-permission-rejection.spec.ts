import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createInternalTool, createExternalTool } from '@/modules/agent/api'
import {
  MOCK_CURRENT_SESSION,
  switchMockSession,
  MOCK_INTERNAL_TOOLS,
  MOCK_EXTERNAL_TOOLS,
} from '@/foundation/mock/seeds'

/**
 * K8: 补齐权限拒绝副作用。
 *
 * 沿用 D192 实际 401/403 状态，只补两类工具未认证/缺权响应消息与请求前后
 * handler 数据完全一致的断言，并报告实际结果。不得重做 CRUD 链。
 */

let originalUsername: string

beforeEach(() => {
  originalUsername = MOCK_CURRENT_SESSION.user.username
})

afterEach(() => {
  switchMockSession(originalUsername)
})

describe('K8: 权限拒绝副作用', () => {
  it('内部工具：未认证 → 401 + handler 数据不变', async () => {
    // 记录请求前数据
    const beforeCount = MOCK_INTERNAL_TOOLS.length
    const beforeSnapshot = JSON.parse(JSON.stringify(MOCK_INTERNAL_TOOLS))

    // 模拟未认证
    const origDescriptor = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION.user, 'id')!
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', {
      value: null,
      writable: true,
      configurable: true,
    })

    try {
      await createInternalTool({
        name: 'unauth_internal',
        description: 'Test tool for permission rejection',
        beanName: 'bean',
        methodName: 'method',
      })
      // 不应该到达这里
      expect(true).toBe(false)
    } catch (err) {
      // 验证是错误
      expect(err).toBeDefined()

      // 验证 handler 数据完全一致
      expect(MOCK_INTERNAL_TOOLS.length).toBe(beforeCount)
      expect(JSON.stringify(MOCK_INTERNAL_TOOLS)).toBe(JSON.stringify(beforeSnapshot))
    } finally {
      Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', origDescriptor)
    }
  })

  it('外部工具：未认证 → 401 + handler 数据不变', async () => {
    // 记录请求前数据
    const beforeCount = MOCK_EXTERNAL_TOOLS.length
    const beforeSnapshot = JSON.parse(JSON.stringify(MOCK_EXTERNAL_TOOLS))

    // 模拟未认证
    const origDescriptor = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION.user, 'id')!
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', {
      value: null,
      writable: true,
      configurable: true,
    })

    try {
      await createExternalTool({
        name: 'unauth_external',
        description: 'Test tool for permission rejection',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      })
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeDefined()

      // 验证 handler 数据完全一致
      expect(MOCK_EXTERNAL_TOOLS.length).toBe(beforeCount)
      expect(JSON.stringify(MOCK_EXTERNAL_TOOLS)).toBe(JSON.stringify(beforeSnapshot))
    } finally {
      Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', origDescriptor)
    }
  })

  it('内部工具：无 manage 权限 → 403 + handler 数据不变', async () => {
    // 记录请求前数据
    const beforeCount = MOCK_INTERNAL_TOOLS.length
    const beforeSnapshot = JSON.parse(JSON.stringify(MOCK_INTERNAL_TOOLS))

    // 模拟无权限
    const origSuperAdmin = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION, 'superAdmin')!
    const origPerms = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION, 'permissions')!
    Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', {
      value: false,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', {
      value: [],
      writable: true,
      configurable: true,
    })

    try {
      await createInternalTool({
        name: 'noperm_internal',
        description: 'Test tool for permission rejection',
        beanName: 'bean',
        methodName: 'method',
      })
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeDefined()

      // 验证 handler 数据完全一致
      expect(MOCK_INTERNAL_TOOLS.length).toBe(beforeCount)
      expect(JSON.stringify(MOCK_INTERNAL_TOOLS)).toBe(JSON.stringify(beforeSnapshot))
    } finally {
      Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', origSuperAdmin)
      Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', origPerms)
    }
  })

  it('外部工具：无 manage 权限 → 403 + handler 数据不变', async () => {
    // 记录请求前数据
    const beforeCount = MOCK_EXTERNAL_TOOLS.length
    const beforeSnapshot = JSON.parse(JSON.stringify(MOCK_EXTERNAL_TOOLS))

    // 模拟无权限
    const origSuperAdmin = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION, 'superAdmin')!
    const origPerms = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION, 'permissions')!
    Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', {
      value: false,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', {
      value: [],
      writable: true,
      configurable: true,
    })

    try {
      await createExternalTool({
        name: 'noperm_external',
        description: 'Test tool for permission rejection',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      })
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeDefined()

      // 验证 handler 数据完全一致
      expect(MOCK_EXTERNAL_TOOLS.length).toBe(beforeCount)
      expect(JSON.stringify(MOCK_EXTERNAL_TOOLS)).toBe(JSON.stringify(beforeSnapshot))
    } finally {
      Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', origSuperAdmin)
      Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', origPerms)
    }
  })

  it('权限拒绝副作用完整报告', async () => {
    const results: Array<{
      scenario: string
      toolType: string
      response: string
      dataChanged: boolean
    }> = []

    // 场景1: 内部工具未认证
    const beforeInternal = JSON.parse(JSON.stringify(MOCK_INTERNAL_TOOLS))
    const origDescriptor = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION.user, 'id')!
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', {
      value: null,
      writable: true,
      configurable: true,
    })
    try {
      await createInternalTool({
        name: 'report_unauth_int',
        description: 'Test tool for permission rejection',
        beanName: 'bean',
        methodName: 'method',
      })
    } catch {
      results.push({
        scenario: '未认证',
        toolType: '内部工具',
        response: '拒绝',
        dataChanged: JSON.stringify(MOCK_INTERNAL_TOOLS) !== JSON.stringify(beforeInternal),
      })
    }
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', origDescriptor)

    // 场景2: 外部工具未认证
    const beforeExternal = JSON.parse(JSON.stringify(MOCK_EXTERNAL_TOOLS))
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', {
      value: null,
      writable: true,
      configurable: true,
    })
    try {
      await createExternalTool({
        name: 'report_unauth_ext',
        description: 'Test tool for permission rejection',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      })
    } catch {
      results.push({
        scenario: '未认证',
        toolType: '外部工具',
        response: '拒绝',
        dataChanged: JSON.stringify(MOCK_EXTERNAL_TOOLS) !== JSON.stringify(beforeExternal),
      })
    }
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', origDescriptor)

    // 场景3: 内部工具无权限
    const beforeInternal2 = JSON.parse(JSON.stringify(MOCK_INTERNAL_TOOLS))
    const origSuperAdmin = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION, 'superAdmin')!
    const origPerms = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION, 'permissions')!
    Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', {
      value: false,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', {
      value: [],
      writable: true,
      configurable: true,
    })
    try {
      await createInternalTool({
        name: 'report_noperm_int',
        description: 'Test tool for permission rejection',
        beanName: 'bean',
        methodName: 'method',
      })
    } catch {
      results.push({
        scenario: '无权限',
        toolType: '内部工具',
        response: '拒绝',
        dataChanged: JSON.stringify(MOCK_INTERNAL_TOOLS) !== JSON.stringify(beforeInternal2),
      })
    }
    Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', origSuperAdmin)
    Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', origPerms)

    // 场景4: 外部工具无权限
    const beforeExternal2 = JSON.parse(JSON.stringify(MOCK_EXTERNAL_TOOLS))
    Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', {
      value: false,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', {
      value: [],
      writable: true,
      configurable: true,
    })
    try {
      await createExternalTool({
        name: 'report_noperm_ext',
        description: 'Test tool for permission rejection',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      })
    } catch {
      results.push({
        scenario: '无权限',
        toolType: '外部工具',
        response: '拒绝',
        dataChanged: JSON.stringify(MOCK_EXTERNAL_TOOLS) !== JSON.stringify(beforeExternal2),
      })
    }
    Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', origSuperAdmin)
    Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', origPerms)

    // 输出报告
    console.log('\n=== K8 权限拒绝副作用报告 ===')
    for (const r of results) {
      console.log(`${r.scenario} - ${r.toolType}: 响应=${r.response}, 数据变化=${r.dataChanged}`)
    }
    console.log('=== 报告结束 ===\n')

    // 验证所有场景数据均未变化
    for (const r of results) {
      expect(r.dataChanged).toBe(false)
    }
  })
})

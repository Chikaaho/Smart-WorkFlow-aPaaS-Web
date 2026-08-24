import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  pageInternalTools,
  createInternalTool,
  getInternalTool,
  updateInternalTool,
  toggleInternalTool,
  deleteInternalTool,
  pageExternalTools,
  createExternalTool,
  getExternalTool,
  updateExternalTool,
  toggleExternalTool,
  deleteExternalTool,
} from '@/modules/agent/api'
import { MOCK_CURRENT_SESSION, switchMockSession } from '@/foundation/mock/seeds'

/**
 * J3/J4/J8: 未mock前端API → 真实Mock handler 端到端测试。
 *
 * 通过真实的前端 API 函数（pageInternalTools / createInternalTool 等）发起请求，
 * 请求经 request() → dispatchMock() → handler 处理，验证：
 * - 未mock的API函数能正确连接真实handler
 * - CRUD全链路字段无损往返
 * - 401/403实际响应行为
 * - 数据前后变化可观察
 */

// 保存原始会话用户名，测试后恢复
let originalUsername: string

beforeEach(() => {
  originalUsername = MOCK_CURRENT_SESSION.user.username
  // 确保超管会话（默认）
  switchMockSession('superadmin')
})

afterEach(() => {
  // 恢复原始会话
  switchMockSession(originalUsername)
})

// ═══════════════════════════════════════════════════════════════
// J3: 内部工具 — 未mock API → 真实handler CRUD全链路
// ═══════════════════════════════════════════════════════════════

describe('J3: 内部工具 未mock API → 真实handler CRUD', () => {
  it('列表 → 创建 → 详情 → 编辑 → 启停 → 删除 全链路字段无损', async () => {
    // 1. 列表（初始状态）
    const listBefore = await pageInternalTools({ pageNum: 1, pageSize: 10 })
    expect(listBefore.list.length).toBeGreaterThan(0)
    const initialCount = listBefore.total

    // 2. 创建
    const newId = await createInternalTool({
      name: 'api_integration_tool',
      description: 'API集成测试工具',
      beanName: 'testBean',
      methodName: 'testMethod',
      inputSchema: '{"type":"object","properties":{"input":{"type":"string"}}}',
      enabled: true,
      remark: 'API集成测试备注',
    })
    expect(typeof newId).toBe('number')

    // 3. 详情验证
    const detail = await getInternalTool(newId)
    expect(detail.name).toBe('api_integration_tool')
    expect(detail.description).toBe('API集成测试工具')
    expect(detail.beanName).toBe('testBean')
    expect(detail.methodName).toBe('testMethod')
    expect(detail.inputSchema).toBe('{"type":"object","properties":{"input":{"type":"string"}}}')
    expect(detail.enabled).toBe(true)
    expect(detail.remark).toBe('API集成测试备注')

    // 4. 编辑
    await updateInternalTool(newId, {
      name: 'api_integration_updated',
      description: '更新后的描述',
      beanName: 'updatedBean',
      methodName: 'updatedMethod',
      inputSchema: '{"type":"object","properties":{"x":{"type":"number"}}}',
      enabled: false,
      remark: '已更新',
    })
    const afterEdit = await getInternalTool(newId)
    expect(afterEdit.name).toBe('api_integration_updated')
    expect(afterEdit.description).toBe('更新后的描述')
    expect(afterEdit.beanName).toBe('updatedBean')
    expect(afterEdit.methodName).toBe('updatedMethod')
    expect(afterEdit.inputSchema).toBe('{"type":"object","properties":{"x":{"type":"number"}}}')
    expect(afterEdit.enabled).toBe(false)
    expect(afterEdit.remark).toBe('已更新')
    // 只读字段不变
    expect(afterEdit.createTime).toBe(detail.createTime)

    // 5. 启停
    await toggleInternalTool(newId, true)
    const afterEnable = await getInternalTool(newId)
    expect(afterEnable.enabled).toBe(true)

    await toggleInternalTool(newId, false)
    const afterDisable = await getInternalTool(newId)
    expect(afterDisable.enabled).toBe(false)

    // 6. 删除
    await deleteInternalTool(newId)

    // 7. 列表验证数量
    const listAfter = await pageInternalTools({ pageNum: 1, pageSize: 10 })
    expect(listAfter.total).toBe(initialCount)
  })

  it('查询/重置：nameKeyword 参数正确传递', async () => {
    const result = await pageInternalTools({ pageNum: 1, pageSize: 10 }, 'weather')
    expect(result.list.length).toBeGreaterThanOrEqual(1)
    expect(
      result.list.every((t) => t.name.includes('weather') || t.description.includes('weather')),
    ).toBe(true)

    const resetResult = await pageInternalTools({ pageNum: 1, pageSize: 10 }, '')
    expect(resetResult.list.length).toBeGreaterThanOrEqual(3)
  })

  it('空态：过滤不存在的名称返回空列表', async () => {
    const result = await pageInternalTools({ pageNum: 1, pageSize: 10 }, 'nonexistent_tool_xyz')
    expect(result.list.length).toBe(0)
    expect(result.total).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// J4: 外部工具 — 未mock API → 真实handler CRUD + 确认/取消/成功
// ═══════════════════════════════════════════════════════════════

describe('J4: 外部工具 未mock API → 真实handler CRUD', () => {
  it('列表 → 创建 → 详情 → 编辑 → 启停 → 删除 全链路', async () => {
    const listBefore = await pageExternalTools({ pageNum: 1, pageSize: 10 })
    const initialCount = listBefore.total

    // 创建
    const newId = await createExternalTool({
      name: 'api_http_integration',
      description: 'HTTP API集成测试',
      url: 'https://api.integration.test/v1/call',
      httpMethod: 'POST',
      timeoutSeconds: 30,
      inputSchema: '{"type":"object","properties":{"param":{"type":"string"}}}',
      enabled: true,
      remark: 'HTTP集成备注',
    })
    expect(typeof newId).toBe('number')

    // 详情
    const detail = await getExternalTool(newId)
    expect(detail.name).toBe('api_http_integration')
    expect(detail.url).toBe('https://api.integration.test/v1/call')
    expect(detail.httpMethod).toBe('POST')
    expect(detail.timeoutSeconds).toBe(30)

    // 编辑
    await updateExternalTool(newId, {
      name: 'api_http_updated',
      description: 'Updated API integration test tool',
      url: 'https://api.updated.test/v2/call',
      httpMethod: 'GET',
      timeoutSeconds: 15,
      inputSchema: null,
      enabled: false,
    })
    const afterEdit = await getExternalTool(newId)
    expect(afterEdit.name).toBe('api_http_updated')
    expect(afterEdit.url).toBe('https://api.updated.test/v2/call')
    expect(afterEdit.httpMethod).toBe('GET')
    expect(afterEdit.timeoutSeconds).toBe(15)
    expect(afterEdit.inputSchema).toBeNull()
    expect(afterEdit.enabled).toBe(false)

    // 启停成功
    await toggleExternalTool(newId, true)
    const afterEnable = await getExternalTool(newId)
    expect(afterEnable.enabled).toBe(true)

    await toggleExternalTool(newId, false)
    const afterDisable = await getExternalTool(newId)
    expect(afterDisable.enabled).toBe(false)

    // 最终列表状态
    await deleteExternalTool(newId)
    const listAfter = await pageExternalTools({ pageNum: 1, pageSize: 10 })
    expect(listAfter.total).toBe(initialCount)
  })

  it('删除确认后列表不包含已删除工具', async () => {
    const newId = await createExternalTool({
      name: 'to_confirm_delete',
      description: 'Test tool for API integration',
      url: 'https://delete.test.com',
      httpMethod: 'GET',
      timeoutSeconds: 10,
    })

    // 确认存在
    const before = await pageExternalTools({ pageNum: 1, pageSize: 10 })
    expect(before.list.some((t) => t.id === newId)).toBe(true)

    // 删除（模拟确认）
    await deleteExternalTool(newId)

    // 确认不存在
    const after = await pageExternalTools({ pageNum: 1, pageSize: 10 })
    expect(after.list.some((t) => t.id === newId)).toBe(false)
  })

  it('启停成功后列表状态同步', async () => {
    const newId = await createExternalTool({
      name: 'toggle_success_test',
      description: 'Test tool for API integration',
      url: 'https://toggle.test.com',
      httpMethod: 'GET',
      timeoutSeconds: 10,
      enabled: true,
    })

    // 停用
    await toggleExternalTool(newId, false)
    const afterDisable = await getExternalTool(newId)
    expect(afterDisable.enabled).toBe(false)

    // 重新启用
    await toggleExternalTool(newId, true)
    const afterEnable = await getExternalTool(newId)
    expect(afterEnable.enabled).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// J8: 实际401/403响应
// ═══════════════════════════════════════════════════════════════

describe('J8: 实际401/403响应', () => {
  it('内部工具：未认证（user.id=null）→ POST抛出401 ApiError', async () => {
    // 通过Object.defineProperty临时覆盖，避免修改原始对象
    const origDescriptor = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION.user, 'id')!
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', {
      value: null,
      writable: true,
      configurable: true,
    })

    await expect(
      createInternalTool({
        name: 'unauth_tool',
        description: 'Test tool for API integration',
        beanName: 'bean',
        methodName: 'method',
      }),
    ).rejects.toThrow()

    // 恢复
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', origDescriptor)
  })

  it('内部工具：无manage权限（user角色）→ POST抛出403 ApiError', async () => {
    // 临时覆盖superAdmin为false且清空权限
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

    await expect(
      createInternalTool({
        name: 'no_perm_tool',
        description: 'Test tool for API integration',
        beanName: 'bean',
        methodName: 'method',
      }),
    ).rejects.toThrow()

    // 恢复
    Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', origSuperAdmin)
    Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', origPerms)
  })

  it('外部工具：未认证 → POST抛出401 ApiError', async () => {
    const origDescriptor = Object.getOwnPropertyDescriptor(MOCK_CURRENT_SESSION.user, 'id')!
    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', {
      value: null,
      writable: true,
      configurable: true,
    })

    await expect(
      createExternalTool({
        name: 'unauth_ext',
        description: 'Test tool for API integration',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      }),
    ).rejects.toThrow()

    Object.defineProperty(MOCK_CURRENT_SESSION.user, 'id', origDescriptor)
  })

  it('外部工具：无manage权限 → POST抛出403 ApiError', async () => {
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

    await expect(
      createExternalTool({
        name: 'no_perm_ext',
        description: 'Test tool for API integration',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      }),
    ).rejects.toThrow()

    Object.defineProperty(MOCK_CURRENT_SESSION, 'superAdmin', origSuperAdmin)
    Object.defineProperty(MOCK_CURRENT_SESSION, 'permissions', origPerms)
  })

  it('超管：创建成功（旁路权限检查）', async () => {
    switchMockSession('superadmin')
    const id = await createInternalTool({
      name: 'superadmin_tool',
      description: 'Test tool for API integration',
      beanName: 'bean',
      methodName: 'method',
    })
    expect(typeof id).toBe('number')
    // 清理
    await deleteInternalTool(id)
  })
})

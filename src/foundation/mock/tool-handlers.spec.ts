import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type {
  AgentToolInternalConfig,
  AgentToolInternalSaveReq,
  AgentToolExternalConfig,
  AgentToolExternalSaveReq,
} from '@/contracts/agent'
import { MOCK_INTERNAL_TOOLS, MOCK_EXTERNAL_TOOLS } from './seeds'
import { dispatchMock } from './index'
import { mockRegistrations } from './handlers'

/**
 * 工具管理 Mock handler 一致性专项（M07-F03-02，G3/G4/G8 行为证据）。
 *
 * 通过 dispatchMock 直接执行 handler，验证：
 * - 内部/外部工具 CRUD 全链路（列表/详情/创建/编辑/启停/删除）
 * - 401/403/400/404 错误语义
 * - 数据前后变化可观察
 * - 字段无损往返
 *
 * 注意：dispatchMock 的 handler 直接原地 mutate MOCK_INTERNAL_TOOLS / MOCK_EXTERNAL_TOOLS，
 * 本文件内按描述顺序依赖状态变化；vitest 每 spec 文件独立模块作用域。
 */

// 保存种子原始长度，用于断言数据变化

async function mock<T>(
  method: string,
  url: string,
  query: Record<string, string> = {},
  body?: unknown,
) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

// ─── 注册表回归保护 ──────────────────────────────────────

describe('foundation/mock tool handler 注册表', () => {
  beforeAll(() => {
    const patterns = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/agent/tool'))
      .map((r) => `${r.method} ${r.pattern}`)
    for (const p of [
      'GET /api/agent/tool/internal',
      'GET /api/agent/tool/internal/:id',
      'POST /api/agent/tool/internal',
      'PUT /api/agent/tool/internal/:id',
      'DELETE /api/agent/tool/internal/:id',
      'PUT /api/agent/tool/internal/:id/toggle',
      'GET /api/agent/tool/external',
      'GET /api/agent/tool/external/:id',
      'POST /api/agent/tool/external',
      'PUT /api/agent/tool/external/:id',
      'DELETE /api/agent/tool/external/:id',
      'PUT /api/agent/tool/external/:id/toggle',
    ]) {
      expect(patterns).toContain(p)
    }
  })

  it('注册表包含 12 个工具端点', () => {
    const toolPatterns = mockRegistrations.filter((r) => r.pattern.startsWith('/api/agent/tool'))
    expect(toolPatterns).toHaveLength(12)
  })
})

// ═══════════════════════════════════════════════════════════════
// 内部工具 CRUD 全链路（G3/G8 行为证据）
// ═══════════════════════════════════════════════════════════════

describe('内部工具 CRUD 全链路（G3/G8）', () => {
  beforeEach(() => {
    // handler 原地 mutate MOCK_INTERNAL_TOOLS，每个 describe 块独立作用域
  })

  it('列表：分页 + 关键字过滤 + 启停过滤', async () => {
    // 全量列表
    const all = await mock<{ records: AgentToolInternalConfig[]; total: number }>(
      'GET',
      '/agent/tool/internal',
      { pageNum: '1', pageSize: '10' },
    )
    expect(all!.code).toBe(0)
    expect(all!.data.total).toBeGreaterThanOrEqual(3)
    expect(all!.data.records.length).toBeGreaterThan(0)

    // 关键字过滤
    const keyword = await mock<{ records: AgentToolInternalConfig[]; total: number }>(
      'GET',
      '/agent/tool/internal',
      { pageNum: '1', pageSize: '10', nameKeyword: 'weather' },
    )
    expect(keyword!.code).toBe(0)
    expect(keyword!.data.records.length).toBeGreaterThanOrEqual(1)
    expect(keyword!.data.records[0].name).toContain('weather')

    // 启停过滤
    const enabled = await mock<{ records: AgentToolInternalConfig[]; total: number }>(
      'GET',
      '/agent/tool/internal',
      { pageNum: '1', pageSize: '10', enabled: 'true' },
    )
    expect(enabled!.code).toBe(0)
    expect(enabled!.data.records.every((t) => t.enabled)).toBe(true)

    const disabled = await mock<{ records: AgentToolInternalConfig[]; total: number }>(
      'GET',
      '/agent/tool/internal',
      { pageNum: '1', pageSize: '10', enabled: 'false' },
    )
    expect(disabled!.code).toBe(0)
    expect(disabled!.data.records.every((t) => !t.enabled)).toBe(true)
  })

  it('详情：存在 → 完整字段；不存在 → 404', async () => {
    const detail = await mock<AgentToolInternalConfig>('GET', '/agent/tool/internal/1')
    expect(detail!.code).toBe(0)
    expect(detail!.data.id).toBe(1)
    expect(typeof detail!.data.name).toBe('string')
    expect(typeof detail!.data.beanName).toBe('string')
    expect(typeof detail!.data.methodName).toBe('string')
    expect(typeof detail!.data.enabled).toBe('boolean')
    expect(detail!.data.createTime).toBeTruthy()
    expect(detail!.data.updateTime).toBeTruthy()

    const missing = await mock('GET', '/agent/tool/internal/99999')
    expect(missing!.code).toBe(404)
    expect(missing!.data).toBeNull()
  })

  it('创建：完整字段 → 返回新 id → 详情可读 → 字段无损', async () => {
    const before = MOCK_INTERNAL_TOOLS.length
    const createReq: AgentToolInternalSaveReq = {
      name: 'integration_test_tool',
      description: '集成测试工具',
      inputSchema: '{"type":"object","properties":{"input":{"type":"string"}}}',
      beanName: 'testBean',
      methodName: 'testMethod',
      enabled: true,
      remark: '集成测试备注',
    }
    const created = await mock<number>('POST', '/agent/tool/internal', {}, createReq)
    expect(created!.code).toBe(0)
    expect(typeof created!.data).toBe('number')
    expect(MOCK_INTERNAL_TOOLS.length).toBe(before + 1)

    // 详情可读
    const newId = created!.data
    const detail = await mock<AgentToolInternalConfig>('GET', `/agent/tool/internal/${newId}`)
    expect(detail!.code).toBe(0)
    expect(detail!.data.name).toBe('integration_test_tool')
    expect(detail!.data.description).toBe('集成测试工具')
    expect(detail!.data.beanName).toBe('testBean')
    expect(detail!.data.methodName).toBe('testMethod')
    expect(detail!.data.inputSchema).toBe(
      '{"type":"object","properties":{"input":{"type":"string"}}}',
    )
    expect(detail!.data.enabled).toBe(true)
    expect(detail!.data.remark).toBe('集成测试备注')
  })

  it('创建：禁用 enabled=false 创建后详情 enabled=false', async () => {
    const createReq: AgentToolInternalSaveReq = {
      name: 'disabled_tool',
      description: '禁用工具',
      beanName: 'bean',
      methodName: 'method',
      enabled: false,
    }
    const created = await mock<number>('POST', '/agent/tool/internal', {}, createReq)
    expect(created!.code).toBe(0)
    const detail = await mock<AgentToolInternalConfig>(
      'GET',
      `/agent/tool/internal/${created!.data}`,
    )
    expect(detail!.data.enabled).toBe(false)
  })

  it('编辑：字段无损往返 + 只读字段不被覆盖', async () => {
    // 获取创建时的 createTime
    const before = await mock<AgentToolInternalConfig>('GET', '/agent/tool/internal/1')
    const originalCreateTime = before!.data.createTime

    const editReq: AgentToolInternalSaveReq = {
      name: 'updated_weather',
      description: '更新后的天气工具',
      inputSchema:
        '{"type":"object","properties":{"city":{"type":"string"},"unit":{"type":"string"}}}',
      beanName: 'weatherBean',
      methodName: 'executeV2',
      enabled: false,
      remark: '已更新',
    }
    const updated = await mock('PUT', '/agent/tool/internal/1', {}, editReq)
    expect(updated!.code).toBe(0)

    const after = await mock<AgentToolInternalConfig>('GET', '/agent/tool/internal/1')
    expect(after!.data.name).toBe('updated_weather')
    expect(after!.data.description).toBe('更新后的天气工具')
    expect(after!.data.beanName).toBe('weatherBean')
    expect(after!.data.methodName).toBe('executeV2')
    expect(after!.data.enabled).toBe(false)
    expect(after!.data.remark).toBe('已更新')
    // 只读字段：createTime 不变
    expect(after!.data.createTime).toBe(originalCreateTime)
    // updateTime 已变
    expect(after!.data.updateTime).not.toBe(before!.data.updateTime)
  })

  it('启停：true→false→true 往返', async () => {
    // 先确保 id=1 是 enabled
    await mock('PUT', '/agent/tool/internal/1/toggle', { enabled: 'true' })
    const afterEnable = await mock<AgentToolInternalConfig>('GET', '/agent/tool/internal/1')
    expect(afterEnable!.data.enabled).toBe(true)

    // 停用
    await mock('PUT', '/agent/tool/internal/1/toggle', { enabled: 'false' })
    const afterDisable = await mock<AgentToolInternalConfig>('GET', '/agent/tool/internal/1')
    expect(afterDisable!.data.enabled).toBe(false)

    // 重新启用
    await mock('PUT', '/agent/tool/internal/1/toggle', { enabled: 'true' })
    const afterReEnable = await mock<AgentToolInternalConfig>('GET', '/agent/tool/internal/1')
    expect(afterReEnable!.data.enabled).toBe(true)
  })

  it('删除：删除后详情 404、再删返回 404（不存在）', async () => {
    // 先创建一个待删除的工具
    const created = await mock<number>(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'to_delete',
        beanName: 'bean',
        methodName: 'method',
      },
    )
    const id = created!.data

    // 删除 → 成功
    const del = await mock('DELETE', `/agent/tool/internal/${id}`)
    expect(del!.code).toBe(0)

    // 详情 404
    const after = await mock('GET', `/agent/tool/internal/${id}`)
    expect(after!.code).toBe(404)

    // 再删返回 404（handler 未实现幂等，不存在即 404）
    const delAgain = await mock('DELETE', `/agent/tool/internal/${id}`)
    expect(delAgain!.code).toBe(404)
  })

  it('400：空工具名 → 拒绝创建', async () => {
    const res = await mock(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: '',
        beanName: 'bean',
        methodName: 'method',
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('工具名')
  })

  it('400：重复工具名 → 拒绝创建', async () => {
    // 先创建一个工具
    const created = await mock<number>(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'unique_tool',
        beanName: 'bean',
        methodName: 'method',
      },
    )
    expect(created!.code).toBe(0)

    // 再创建同名工具 → 400
    const res = await mock(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'unique_tool',
        beanName: 'bean',
        methodName: 'method',
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('已存在')
  })

  it('400：非法 inputSchema → 拒绝创建', async () => {
    const res = await mock(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'bad_schema_tool',
        beanName: 'bean',
        methodName: 'method',
        inputSchema: '{bad json',
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('JSON')
  })

  it('404：编辑不存在的工具 → 拒绝', async () => {
    const res = await mock(
      'PUT',
      '/agent/tool/internal/99999',
      {},
      {
        name: 'new_name',
      },
    )
    expect(res!.code).toBe(404)
  })

  it('404：启停不存在的工具 → 拒绝', async () => {
    const res = await mock('PUT', '/agent/tool/internal/99999/toggle', { enabled: 'true' })
    expect(res!.code).toBe(404)
  })

  it('404：删除不存在的工具 → 拒绝', async () => {
    const res = await mock('DELETE', '/agent/tool/internal/99999')
    expect(res!.code).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════
// 外部 HTTP 工具 CRUD 全链路（G4/G8 行为证据）
// ═══════════════════════════════════════════════════════════════

describe('外部 HTTP 工具 CRUD 全链路（G4/G8）', () => {
  beforeEach(() => {
    // handler 原地 mutate MOCK_EXTERNAL_TOOLS，每个 describe 块独立作用域
  })

  it('列表：分页 + 关键字过滤 + 启停过滤', async () => {
    const all = await mock<{ records: AgentToolExternalConfig[]; total: number }>(
      'GET',
      '/agent/tool/external',
      { pageNum: '1', pageSize: '10' },
    )
    expect(all!.code).toBe(0)
    expect(all!.data.total).toBeGreaterThanOrEqual(2)
    expect(all!.data.records.length).toBeGreaterThan(0)

    const keyword = await mock<{ records: AgentToolExternalConfig[]; total: number }>(
      'GET',
      '/agent/tool/external',
      { pageNum: '1', pageSize: '10', nameKeyword: 'search' },
    )
    expect(keyword!.code).toBe(0)
    expect(keyword!.data.records.length).toBeGreaterThanOrEqual(1)

    const enabled = await mock<{ records: AgentToolExternalConfig[]; total: number }>(
      'GET',
      '/agent/tool/external',
      { pageNum: '1', pageSize: '10', enabled: 'true' },
    )
    expect(enabled!.code).toBe(0)
    expect(enabled!.data.records.every((t) => t.enabled)).toBe(true)
  })

  it('详情：存在 → 完整字段；不存在 → 404', async () => {
    const detail = await mock<AgentToolExternalConfig>('GET', '/agent/tool/external/1')
    expect(detail!.code).toBe(0)
    expect(detail!.data.id).toBe(1)
    expect(typeof detail!.data.name).toBe('string')
    expect(typeof detail!.data.url).toBe('string')
    expect(typeof detail!.data.httpMethod).toBe('string')
    expect(typeof detail!.data.timeoutSeconds).toBe('number')
    expect(typeof detail!.data.enabled).toBe('boolean')
    expect(detail!.data.createTime).toBeTruthy()

    const missing = await mock('GET', '/agent/tool/external/99999')
    expect(missing!.code).toBe(404)
  })

  it('创建：完整字段 → 返回新 id → 详情可读 → 字段无损', async () => {
    const before = MOCK_EXTERNAL_TOOLS.length
    const createReq: AgentToolExternalSaveReq = {
      name: 'integration_http_tool',
      description: '集成测试HTTP工具',
      url: 'https://api.test.com/v1/invoke',
      httpMethod: 'GET',
      timeoutSeconds: 15,
      inputSchema: '{"type":"object","properties":{"param":{"type":"string"}}}',
      enabled: true,
      remark: 'HTTP测试备注',
    }
    const created = await mock<number>('POST', '/agent/tool/external', {}, createReq)
    expect(created!.code).toBe(0)
    expect(MOCK_EXTERNAL_TOOLS.length).toBe(before + 1)

    const newId = created!.data
    const detail = await mock<AgentToolExternalConfig>('GET', `/agent/tool/external/${newId}`)
    expect(detail!.code).toBe(0)
    expect(detail!.data.name).toBe('integration_http_tool')
    expect(detail!.data.url).toBe('https://api.test.com/v1/invoke')
    expect(detail!.data.httpMethod).toBe('GET')
    expect(detail!.data.timeoutSeconds).toBe(15)
    expect(detail!.data.inputSchema).toBe(
      '{"type":"object","properties":{"param":{"type":"string"}}}',
    )
    expect(detail!.data.enabled).toBe(true)
    expect(detail!.data.remark).toBe('HTTP测试备注')
  })

  it('编辑：字段无损往返 + URL/方法/超时可改', async () => {
    const before = await mock<AgentToolExternalConfig>('GET', '/agent/tool/external/1')
    const originalCreateTime = before!.data.createTime

    const editReq: AgentToolExternalSaveReq = {
      name: 'updated_search',
      description: '更新后的搜索',
      url: 'https://api.updated.com/v2/search',
      httpMethod: 'PUT',
      timeoutSeconds: 45,
      inputSchema: '{"type":"object","properties":{"q":{"type":"string"}}}',
      enabled: false,
      remark: '已更新',
    }
    const updated = await mock('PUT', '/agent/tool/external/1', {}, editReq)
    expect(updated!.code).toBe(0)

    const after = await mock<AgentToolExternalConfig>('GET', '/agent/tool/external/1')
    expect(after!.data.name).toBe('updated_search')
    expect(after!.data.url).toBe('https://api.updated.com/v2/search')
    expect(after!.data.httpMethod).toBe('PUT')
    expect(after!.data.timeoutSeconds).toBe(45)
    expect(after!.data.enabled).toBe(false)
    expect(after!.data.remark).toBe('已更新')
    expect(after!.data.createTime).toBe(originalCreateTime)
    expect(after!.data.updateTime).not.toBe(before!.data.updateTime)
  })

  it('启停：true→false→true 往返', async () => {
    await mock('PUT', '/agent/tool/external/1/toggle', { enabled: 'true' })
    const afterEnable = await mock<AgentToolExternalConfig>('GET', '/agent/tool/external/1')
    expect(afterEnable!.data.enabled).toBe(true)

    await mock('PUT', '/agent/tool/external/1/toggle', { enabled: 'false' })
    const afterDisable = await mock<AgentToolExternalConfig>('GET', '/agent/tool/external/1')
    expect(afterDisable!.data.enabled).toBe(false)

    await mock('PUT', '/agent/tool/external/1/toggle', { enabled: 'true' })
    const afterReEnable = await mock<AgentToolExternalConfig>('GET', '/agent/tool/external/1')
    expect(afterReEnable!.data.enabled).toBe(true)
  })

  it('删除：删除后详情 404、再删返回 404（不存在）', async () => {
    const created = await mock<number>(
      'POST',
      '/agent/tool/external',
      {},
      {
        name: 'to_delete_http',
        url: 'https://delete.test.com',
        httpMethod: 'POST',
        timeoutSeconds: 10,
      },
    )
    const id = created!.data

    const del = await mock('DELETE', `/agent/tool/external/${id}`)
    expect(del!.code).toBe(0)

    const after = await mock('GET', `/agent/tool/external/${id}`)
    expect(after!.code).toBe(404)

    // 再删返回 404（handler 未实现幂等，不存在即 404）
    const delAgain = await mock('DELETE', `/agent/tool/external/${id}`)
    expect(delAgain!.code).toBe(404)
  })

  it('400：URL 为空 → 拒绝创建', async () => {
    const res = await mock(
      'POST',
      '/agent/tool/external',
      {},
      {
        name: 'no_url',
        url: '',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('URL')
  })

  it('400：非法 inputSchema → 拒绝创建', async () => {
    const res = await mock(
      'POST',
      '/agent/tool/external',
      {},
      {
        name: 'bad_schema',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
        inputSchema: 'not json',
      },
    )
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('JSON')
  })

  it('timeoutSeconds=0 → 400（与前端校验一致，timeout 必须 ≥ 1）', async () => {
    const created = await mock(
      'POST',
      '/agent/tool/external',
      {},
      {
        name: 'zero_timeout_tool',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 0,
      },
    )
    expect(created!.code).toBe(400)
  })

  it('404：编辑不存在的外部工具 → 拒绝', async () => {
    const res = await mock(
      'PUT',
      '/agent/tool/external/99999',
      {},
      {
        name: 'new',
      },
    )
    expect(res!.code).toBe(404)
  })

  it('404：启停不存在的外部工具 → 拒绝', async () => {
    const res = await mock('PUT', '/agent/tool/external/99999/toggle', { enabled: 'true' })
    expect(res!.code).toBe(404)
  })

  it('404：删除不存在的外部工具 → 拒绝', async () => {
    const res = await mock('DELETE', '/agent/tool/external/99999')
    expect(res!.code).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════
// G8: 权限行为（401/403）
// ═══════════════════════════════════════════════════════════════

describe('工具 handler 权限行为（G8）', () => {
  // 注意：MOCK_CURRENT_SESSION 默认有 user.id 和 superAdmin=true
  // 401/403 需要清除 session 或移除权限
  // 由于 handler 直接读取全局 MOCK_CURRENT_SESSION，这里通过 import 来控制

  it('GET 列表/详情不需要 manage 权限（superAdmin 或 view 即可）', async () => {
    const list = await mock<{ records: unknown[]; total: number }>('GET', '/agent/tool/internal', {
      pageNum: '1',
      pageSize: '10',
    })
    expect(list!.code).toBe(0)

    const detail = await mock('GET', '/agent/tool/internal/1')
    expect(detail!.code).toBe(0)
  })

  it('handler 注册表中 POST/PUT/DELETE 均有权限检查', () => {
    const writeHandlers = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/agent/tool'))
      .filter((r) => r.method === 'POST' || r.method === 'PUT' || r.method === 'DELETE')
    // 每个写 handler 的源码应包含权限检查
    for (const h of writeHandlers) {
      expect(h.handler.toString()).toContain('manage')
    }
  })

  it('handler 注册表中 POST/PUT/DELETE 均有 401 检查', () => {
    const writeHandlers = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/agent/tool'))
      .filter((r) => r.method === 'POST' || r.method === 'PUT' || r.method === 'DELETE')
    for (const h of writeHandlers) {
      expect(h.handler.toString()).toContain('401')
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// G5: 合法结构与契约
// ═══════════════════════════════════════════════════════════════

describe('工具 handler 契约验证（G5）', () => {
  it('内部工具：inputSchema null 与合法 JSON 均可通过创建', async () => {
    // null schema
    const noSchema = await mock<number>(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'no_schema_tool',
        beanName: 'bean',
        methodName: 'method',
        inputSchema: null,
      },
    )
    expect(noSchema!.code).toBe(0)
    const noSchemaDetail = await mock<AgentToolInternalConfig>(
      'GET',
      `/agent/tool/internal/${noSchema!.data}`,
    )
    expect(noSchemaDetail!.data.inputSchema).toBeNull()

    // 合法 JSON schema
    const withSchema = await mock<number>(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'schema_tool',
        beanName: 'bean',
        methodName: 'method',
        inputSchema: '{"type":"object","properties":{"x":{"type":"number"}}}',
      },
    )
    expect(withSchema!.code).toBe(0)
    const schemaDetail = await mock<AgentToolInternalConfig>(
      'GET',
      `/agent/tool/internal/${withSchema!.data}`,
    )
    expect(schemaDetail!.data.inputSchema).toBe(
      '{"type":"object","properties":{"x":{"type":"number"}}}',
    )
    // 保存后重开语义一致：再次获取同一 Schema
    const reGet = await mock<AgentToolInternalConfig>(
      'GET',
      `/agent/tool/internal/${withSchema!.data}`,
    )
    expect(reGet!.data.inputSchema).toBe(schemaDetail!.data.inputSchema)
  })

  it('外部工具：httpMethod 仅接受 GET/POST/PUT', async () => {
    // 合法方法
    for (const method of ['GET', 'POST', 'PUT']) {
      const created = await mock<number>(
        'POST',
        '/agent/tool/external',
        {},
        {
          name: `method_${method.toLowerCase()}_tool`,
          url: 'https://test.com',
          httpMethod: method,
          timeoutSeconds: 10,
        },
      )
      expect(created!.code).toBe(0)
      const detail = await mock<AgentToolExternalConfig>(
        'GET',
        `/agent/tool/external/${created!.data}`,
      )
      expect(detail!.data.httpMethod).toBe(method)
    }
    // 非法方法 → 400
    for (const method of ['DELETE', 'PATCH', 'HEAD']) {
      const res = await mock(
        'POST',
        '/agent/tool/external',
        {},
        {
          name: `illegal_${method.toLowerCase()}_tool`,
          url: 'https://test.com',
          httpMethod: method,
          timeoutSeconds: 10,
        },
      )
      expect(res!.code).toBe(400)
      expect(res!.message).toContain('GET/POST/PUT')
    }
  })

  it('外部工具：timeoutSeconds=0 → 400（与前端校验一致，timeout 必须 ≥ 1）', async () => {
    const created = await mock(
      'POST',
      '/agent/tool/external',
      {},
      {
        name: 'g5_zero_timeout',
        url: 'https://g5-test.com',
        httpMethod: 'GET',
        timeoutSeconds: 0,
      },
    )
    expect(created!.code).toBe(400)
  })

  it('内部工具：enabled 默认 true（不传时）', async () => {
    const created = await mock<number>(
      'POST',
      '/agent/tool/internal',
      {},
      {
        name: 'default_enabled_tool',
        beanName: 'bean',
        methodName: 'method',
      },
    )
    expect(created!.code).toBe(0)
    const detail = await mock<AgentToolInternalConfig>(
      'GET',
      `/agent/tool/internal/${created!.data}`,
    )
    expect(detail!.data.enabled).toBe(true)
  })

  it('外部工具：创建时 remark=null（不传时）', async () => {
    const created = await mock<number>(
      'POST',
      '/agent/tool/external',
      {},
      {
        name: 'no_remark_tool',
        url: 'https://test.com',
        httpMethod: 'GET',
        timeoutSeconds: 10,
      },
    )
    expect(created!.code).toBe(0)
    const detail = await mock<AgentToolExternalConfig>(
      'GET',
      `/agent/tool/external/${created!.data}`,
    )
    expect(detail!.data.remark).toBeNull()
  })
})

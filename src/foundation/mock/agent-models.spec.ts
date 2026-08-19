import { describe, it, expect, beforeAll } from 'vitest'
import type { AgentModelConfig, AgentModelSaveReq } from '@/contracts/agent'
import { MOCK_AGENT_MODELS, MOCK_MENU_TREE } from './seeds'
import { dispatchMock } from './index'
import { mockRegistrations } from './handlers'

/**
 * 大模型管理 Mock handler 一致性专项（M07-F01，地基层独立验证）。
 *
 * 覆盖：分页 / 名称关键字过滤 / 详情 / 创建 / 更新空 Key 保留 / 删除 /
 * 连通性测试结构，以及安全硬边界：
 *   - 任何 mock 响应（含 seeds 与 handler 输出）不得出现 apiKeyCipher 与明文 key 字段
 *   - 空 Key 更新后 apiKeyMasked 保留旧脱敏值
 *   - 菜单 tree 包含「智能体 → 大模型管理」节点
 *
 * 注意：dispatchMock 的 handler 直接原地 mutate MOCK_AGENT_MODELS（与真实后端
 * 内存存储语义一致），本文件内按描述顺序依赖状态变化；vitest 每 spec 文件
 * 独立模块作用域，不影响其他测试文件。
 */

async function mock<T>(
  method: string,
  url: string,
  query: Record<string, string> = {},
  body?: unknown,
) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

describe('foundation/mock agent-models handler 一致性', () => {
  // 可测试的确定性 id：lockedUntil 过去时间（未锁定）
  const TEST_ID = 5

  beforeAll(() => {
    // 回归保护：路由注册表必须包含全部 6 个模型端点
    const patterns = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/agent/models'))
      .map((r) => `${r.method} ${r.pattern}`)
    for (const p of [
      'GET /api/agent/models',
      'GET /api/agent/models/:id',
      'POST /api/agent/models',
      'PUT /api/agent/models/:id',
      'DELETE /api/agent/models/:id',
      'POST /api/agent/models/:id/test-connection',
    ]) {
      expect(patterns).toContain(p)
    }
  })

  // ── 安全硬边界：种子与响应不含明文/密文 ─────────────────

  it('seeds 只含 apiKeyMasked 脱敏值，不含明文 Key 与 apiKeyCipher', () => {
    const plaintext = MOCK_AGENT_MODELS.map((m) => m as unknown as Record<string, unknown>)
    const keys = new Set(plaintext.flatMap((m) => Object.keys(m)))
    expect(keys.has('apiKeyCipher')).toBe(false)
    expect(keys.has('apiKey')).toBe(false)
    for (const m of plaintext) {
      const masked = m.apiKeyMasked
      if (masked === null || masked === undefined) continue
      // 脱敏形态：前 2 + **** + 后 2 及以上（maskApiKey 实现为 slice(0,2)+'****'+slice(-2)，
      // 种子形态 sk****abcd / sk****dcba 等；无明文可比对，仅断言形态成立）
      expect(typeof masked).toBe('string')
      expect(masked).toMatch(/^..\*{4}..{2,}$/)
    }
    // 覆盖矩阵抽查
    const ids = MOCK_AGENT_MODELS.map((m) => m.id)
    expect(ids).toContain(1) // openai 带 Key
    expect(ids).toContain(2) // ollama 无 Key
    expect(ids).toContain(3) // other
    expect(ids).toContain(4) // 同 groupKey 多条 + lockedUntil 未来
    expect(ids).toContain(5) // 同 groupKey 多条 + lockedUntil 过去
    expect(ids).toContain(6) // enabled=false
    const pool = MOCK_AGENT_MODELS.filter((m) => m.groupKey === 'gpt4o-pool')
    expect(pool.length).toBeGreaterThanOrEqual(2)
    // 同 groupKey 多条且 sort 互不相同（轮询优先级可区分）
    expect(new Set(pool.map((m) => m.sort)).size).toBe(pool.length)
    const future = MOCK_AGENT_MODELS.find(
      (m) => m.lockedUntil && m.lockedUntil > new Date().toISOString(),
    )
    expect(future).toBeDefined()
    expect(MOCK_AGENT_MODELS.some((m) => m.enabled)).toBe(true)
    expect(MOCK_AGENT_MODELS.some((m) => !m.enabled)).toBe(true)
  })

  it('注册表中不存在任何引用 apiKeyCipher/明文 key 的 handler 实现', () => {
    const sources = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/agent/models'))
      .map((r) => r.handler.toString())
      .join('\n')
    expect(sources).not.toMatch(/apiKeyCipher|apiKeyCipher/i)
    // 允许出现 "apiKey" 字样（SaveReq 入参字段名与 maskApiKey 计算），
    // 但不得把 apiKey 直接写入任何出参对象（不含 .data = { apiKey: } 形态）
    expect(sources).not.toMatch(/apiKey\s*:\s*[^,}]+/i)
  })

  it('分页 + nameKeyword 过滤：关键字命中、分页切片、total 正确', async () => {
    const all = await mock<{ records: AgentModelConfig[]; total: number }>('GET', '/agent/models', {
      pageNum: '1',
      pageSize: '10',
    })
    expect(all!.code).toBe(0)
    expect(all!.data.total).toBe(MOCK_AGENT_MODELS.length)
    expect(all!.data.records).toHaveLength(MOCK_AGENT_MODELS.length)

    const keyword = await mock<{ records: AgentModelConfig[]; total: number }>(
      'GET',
      '/agent/models',
      { pageNum: '1', pageSize: '10', nameKeyword: '轮询' },
    )
    expect(keyword!.code).toBe(0)
    expect(keyword!.data.total).toBe(2)
    expect(keyword!.data.records.every((r) => r.name.includes('轮询'))).toBe(true)

    const page2 = await mock<{ records: AgentModelConfig[]; total: number }>(
      'GET',
      '/agent/models',
      { pageNum: '2', pageSize: '4' },
    )
    expect(page2!.code).toBe(0)
    expect(page2!.data.total).toBe(MOCK_AGENT_MODELS.length)
    expect(page2!.data.records.length).toBe(Math.max(0, MOCK_AGENT_MODELS.length - 4))

    // 列表响应同样不含明文/密文
    const listRecords = all!.data.records
    const listKeys = new Set(listRecords.flatMap((r) => Object.keys(r)))
    expect(listKeys.has('apiKeyCipher')).toBe(false)
    expect(listKeys.has('apiKey')).toBe(false)
  })

  it('详情：可测试 id 返回完整契约字段，不存在的 id 返回 404 业务码', async () => {
    const detail = await mock<AgentModelConfig>('GET', `/agent/models/${TEST_ID}`)
    expect(detail!.code).toBe(0)
    const d = detail!.data
    expect(d.id).toBe(TEST_ID)
    expect(typeof d.name).toBe('string')
    expect(typeof d.protocolType).toBe('string')
    expect(typeof d.baseUrl).toBe('string')
    expect(typeof d.modelName).toBe('string')
    expect(d.apiKeyMasked === null || typeof d.apiKeyMasked === 'string').toBe(true)
    expect(typeof d.timeoutSeconds).toBe('number')
    expect(typeof d.retryCount).toBe('number')
    expect(typeof d.enabled).toBe('boolean')
    expect(d.groupKey === null || typeof d.groupKey === 'string').toBe(true)
    expect(typeof d.sort).toBe('number')
    expect(typeof d.quotaCooldownSeconds).toBe('number')
    expect(d.createTime).toBeTruthy()
    expect(d.updateTime).toBeTruthy()
    expect(d).not.toHaveProperty('apiKeyCipher')
    expect(d).not.toHaveProperty('apiKey')

    const missing = await mock('GET', '/agent/models/99999')
    expect(missing!.code).toBe(404)
    expect(missing!.data).toBeNull()
  })

  it('创建：返回新 id，新模型含脱敏值（传 Key 时）或 apiKeyMasked=null（不传时）', async () => {
    const before = MOCK_AGENT_MODELS.length
    const createReq: AgentModelSaveReq = {
      name: '创建测试模型',
      protocolType: 'openai',
      baseUrl: 'https://api.test.com/v1',
      modelName: 'test-model',
      apiKey: 'sk-testcreate-secret-key',
      temperature: 0.8,
      timeoutSeconds: 45,
      enabled: true,
    }
    const created = await mock<number>('POST', '/agent/models', {}, createReq)
    expect(created!.code).toBe(0)
    const newId = created!.data
    expect(typeof newId).toBe('number')
    expect(MOCK_AGENT_MODELS).toHaveLength(before + 1)
    const createdModel = MOCK_AGENT_MODELS.find((m) => m.id === newId)!
    expect(createdModel.apiKeyMasked).toMatch(/^..\*{4}..$/)
    expect(createdModel.apiKeyMasked).toBe('sk****ey') // 前2+****+后2
    expect(createdModel.lockedUntil).toBeNull()
    expect((createdModel as unknown as Record<string, unknown>)['apiKeyCipher']).toBeUndefined()
    expect((createdModel as unknown as Record<string, unknown>)['apiKey']).toBeUndefined()
    // 系统运行态字段不可写
    expect(createdModel.lockedUntil).toBeNull()

    const noKeyReq: AgentModelSaveReq = {
      name: '创建无Key模型',
      protocolType: 'ollama',
      baseUrl: 'http://localhost:11434',
      modelName: 'llama3',
    }
    const noKey = await mock<number>('POST', '/agent/models', {}, noKeyReq)
    expect(noKey!.code).toBe(0)
    const noKeyModel = MOCK_AGENT_MODELS.find((m) => m.id === noKey!.data)!
    expect(noKeyModel.apiKeyMasked).toBeNull()
  })

  it('更新空 Key 保留旧脱敏值；传新 Key 只替换脱敏值', async () => {
    const detail = await mock<AgentModelConfig>('GET', `/agent/models/${TEST_ID}`)
    const oldMasked = detail!.data.apiKeyMasked

    // 空 Key（'' 与缺省）→ 保留旧脱敏值
    const emptyReq: AgentModelSaveReq = {
      name: '多Key轮询-备Key',
      protocolType: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelName: 'gpt-4o',
      apiKey: '',
    }
    const emptyUpdate = await mock('PUT', `/agent/models/${TEST_ID}`, {}, emptyReq)
    expect(emptyUpdate!.code).toBe(0)
    const afterEmpty = await mock<AgentModelConfig>('GET', `/agent/models/${TEST_ID}`)
    expect(afterEmpty!.data.apiKeyMasked).toBe(oldMasked)

    const noKeyUpdate: AgentModelSaveReq = {
      name: '多Key轮询-备Key',
      protocolType: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelName: 'gpt-4o',
    }
    const noKeyUpdateRes = await mock('PUT', `/agent/models/${TEST_ID}`, {}, noKeyUpdate)
    expect(noKeyUpdateRes!.code).toBe(0)
    const afterNoKey = await mock<AgentModelConfig>('GET', `/agent/models/${TEST_ID}`)
    expect(afterNoKey!.data.apiKeyMasked).toBe(oldMasked)

    // 传新 Key → 只生成新脱敏值（mock 内部不存明文）
    const newKeyReq: AgentModelSaveReq = {
      name: '多Key轮询-备Key',
      protocolType: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelName: 'gpt-4o',
      apiKey: 'sk-br-and-new-zz',
    }
    const newKeyUpdate = await mock('PUT', `/agent/models/${TEST_ID}`, {}, newKeyReq)
    expect(newKeyUpdate!.code).toBe(0)
    const afterNewKey = await mock<AgentModelConfig>('GET', `/agent/models/${TEST_ID}`)
    expect(afterNewKey!.data.apiKeyMasked).toBe('sk****zz')
    expect(afterNewKey!.data.apiKeyMasked).not.toBe('sk-br-and-new-zz')
    expect((afterNewKey!.data as unknown as Record<string, unknown>)['apiKey']).toBeUndefined()

    // 不存在的 id 更新 → 404
    const missing = await mock('PUT', '/agent/models/99999', {}, emptyReq)
    expect(missing!.code).toBe(404)
  })

  it('删除幂等：删除后详情 404、再删仍 code 0；运行态字段不受删除影响', async () => {
    const del = await mock('DELETE', `/agent/models/${TEST_ID}`)
    expect(del!.code).toBe(0)
    const after = await mock('GET', `/agent/models/${TEST_ID}`)
    expect(after!.code).toBe(404)

    const delAgain = await mock('DELETE', `/agent/models/${TEST_ID}`)
    expect(delAgain!.code).toBe(0) // 幂等：不存在也返回 code 0
  })

  it('连通性测试：存在即 success=true，不读取 enabled/lockedUntil；不存在返回 404 业务码', async () => {
    // 普通可达模型（ollama，id=2）→ success=true 带 message 与 latencyMs
    const ok = await mock<{ success: boolean; message: string; latencyMs: number }>(
      'POST',
      '/agent/models/2/test-connection',
    )
    expect(ok!.code).toBe(0)
    expect(ok!.data.success).toBe(true)
    expect(typeof ok!.data.message).toBe('string')
    expect(typeof ok!.data.latencyMs).toBe('number')

    // disabled=true 模型（id=6）→ 仍 success=true：连通性为纯网络探测，不读取 enabled（对照后端 testConnection）
    const disabled = await mock<{ success: boolean; message: string; latencyMs: number }>(
      'POST',
      '/agent/models/6/test-connection',
    )
    expect(disabled!.code).toBe(0)
    expect(disabled!.data.success).toBe(true)
    expect(typeof disabled!.data.message).toBe('string')
    expect(typeof disabled!.data.latencyMs).toBe('number')

    // other 协议且 disabled 模型（id=3）→ success=true：other 协议 GET baseUrl 根路径，200/404 均可达
    const other = await mock<{ success: boolean; message: string; latencyMs: number }>(
      'POST',
      '/agent/models/3/test-connection',
    )
    expect(other!.code).toBe(0)
    expect(other!.data.success).toBe(true)

    // lockedUntil 未来时间（id=4）→ 仍 success=true：连通性不读取 lockedUntil，与锁定无关
    const locked = await mock<{ success: boolean; message: string; latencyMs: number }>(
      'POST',
      '/agent/models/4/test-connection',
    )
    expect(locked!.code).toBe(0)
    expect(locked!.data.success).toBe(true)
    expect(typeof locked!.data.message).toBe('string')
    expect(typeof locked!.data.latencyMs).toBe('number')

    // 不存在 id → 404 业务码（配置不存在，非连通性语义）
    const missing = await mock('POST', '/agent/models/99999/test-connection')
    expect(missing!.code).toBe(404)
    expect(missing!.data).toBeNull()
  })

  // ── 菜单 tree：大模型管理可达 ────────────────────────────

  it('MOCK_MENU_TREE 中「智能体」为目录且含「大模型管理」二级菜单（对齐 V26 形态）', () => {
    const agent = (MOCK_MENU_TREE as Array<Record<string, unknown>>).find((n) => n.name === 'agent')
    expect(agent).toBeDefined()
    expect(agent!.menuType).toBe(0)
    expect(agent!.component).toBeNull()
    const children = agent!.children as Array<Record<string, unknown>>
    const graphDef = children.find((c) => c.name === 'AgentGraphDef')
    expect(graphDef).toBeDefined()
    expect(graphDef!.path).toBe('agent/graph-def')
    expect(graphDef!.component).toBe('agent/views/GraphDefList')
    expect(graphDef!.permission).toBe('agent:model:view')

    const model = children.find((c) => c.name === 'AgentModelList')
    expect(model).toBeDefined()
    expect(model!.path).toBe('agent/model')
    expect(model!.component).toBe('agent/views/ModelList')
    expect(model!.permission).toBe('agent:model:view')
    expect(model!.menuType).toBe(1)
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import type {
  AgentModel,
  AgentModelSaveReq,
  AgentProvider,
  AgentProviderSaveReq,
} from '@/contracts/agent'
import { MOCK_AGENT_MODELS, MOCK_AGENT_PROVIDERS, MOCK_MENU_TREE } from './seeds'
import { dispatchMock } from './index'
import { mockRegistrations } from './handlers'

/**
 * 供应商/模型两级管理 Mock handler 一致性专项（F1 D022-02，地基层独立验证）。
 *
 * 覆盖：供应商与模型的分页 / 关键字过滤 / 详情 / 创建 / 更新空 Key 保留（供应商侧）/
 * 删除 / 连通性测试结构，以及安全硬边界：
 *   - 任何 mock 响应（含 seeds 与 handler 输出）不得出现密文与明文 key 字段
 *   - 供应商空 Key 更新后 apiKeyMasked 保留旧脱敏值
 *   - 菜单 tree 包含「智能体 → 大模型管理」节点
 *
 * 注意：dispatchMock 的 handler 直接原地 mutate mock 数组（与真实后端内存存储
 * 语义一致），本文件内按描述顺序依赖状态变化；vitest 每 spec 文件独立模块
 * 作用域，不影响其他测试文件。
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
  const PROVIDER_TEST_ID = 101

  beforeAll(() => {
    // 回归保护：路由注册表必须包含全部两级管理端点
    const modelPatterns = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/agent/models'))
      .map((r) => `${r.method} ${r.pattern}`)
    for (const p of [
      'GET /api/agent/models',
      'GET /api/agent/models/enabled',
      'GET /api/agent/models/:id',
      'POST /api/agent/models',
      'PUT /api/agent/models/:id',
      'DELETE /api/agent/models/:id',
      'POST /api/agent/models/:id/test-connection',
    ]) {
      expect(modelPatterns).toContain(p)
    }
    const providerPatterns = mockRegistrations
      .filter((r) => r.pattern.startsWith('/api/agent/providers'))
      .map((r) => `${r.method} ${r.pattern}`)
    for (const p of [
      'GET /api/agent/providers',
      'GET /api/agent/providers/enabled',
      'GET /api/agent/providers/:id',
      'POST /api/agent/providers',
      'PUT /api/agent/providers/:id',
      'DELETE /api/agent/providers/:id',
    ]) {
      expect(providerPatterns).toContain(p)
    }
  })

  // ── 安全硬边界：种子与响应不含明文/密文 ─────────────────

  it('供应商种子只含 apiKeyMasked 脱敏值，不含明文 Key 与密文字段', () => {
    const providers = MOCK_AGENT_PROVIDERS.map((p) => p as unknown as Record<string, unknown>)
    const keys = new Set(providers.flatMap((p) => Object.keys(p)))
    expect(keys.has('apiKeyCipher')).toBe(false)
    expect(keys.has('apiKey')).toBe(false)
    for (const p of providers) {
      const masked = p.apiKeyMasked
      if (masked === null || masked === undefined) continue
      expect(typeof masked).toBe('string')
      expect(masked).toMatch(/^..\*{4}..{2,}$/)
    }
    // 覆盖矩阵抽查：三格式 + 无 Key + 停用
    const formats = MOCK_AGENT_PROVIDERS.map((p) => p.apiFormat)
    expect(formats).toContain('OPENAI_CHAT')
    expect(formats).toContain('OPENAI_RESPONSES')
    expect(formats).toContain('ANTHROPIC')
    expect(MOCK_AGENT_PROVIDERS.some((p) => p.apiKeyMasked === null)).toBe(true)
    expect(MOCK_AGENT_PROVIDERS.some((p) => !p.enabled)).toBe(true)
  })

  it('模型种子挂在供应商下且覆盖轮询/锁定矩阵；模型不含任何 Key 字段', () => {
    const models = MOCK_AGENT_MODELS.map((m) => m as unknown as Record<string, unknown>)
    const keys = new Set(models.flatMap((m) => Object.keys(m)))
    expect(keys.has('apiKeyCipher')).toBe(false)
    expect(keys.has('apiKey')).toBe(false)
    expect(keys.has('apiKeyMasked')).toBe(false)
    for (const m of models) {
      expect(MOCK_AGENT_PROVIDERS.some((p) => p.id === m.providerId)).toBe(true)
    }
    const pool = MOCK_AGENT_MODELS.filter((m) => m.groupKey === 'gpt4o-pool')
    expect(pool.length).toBeGreaterThanOrEqual(2)
    expect(new Set(pool.map((m) => m.sort)).size).toBe(pool.length)
    const future = MOCK_AGENT_MODELS.find(
      (m) => m.lockedUntil && m.lockedUntil > new Date().toISOString(),
    )
    expect(future).toBeDefined()
    expect(MOCK_AGENT_MODELS.some((m) => m.enabled)).toBe(true)
    expect(MOCK_AGENT_MODELS.some((m) => !m.enabled)).toBe(true)
  })

  it('注册表中不存在任何引用密文/明文 key 的 handler 实现', () => {
    const sources = mockRegistrations
      .filter(
        (r) =>
          r.pattern.startsWith('/api/agent/models') || r.pattern.startsWith('/api/agent/providers'),
      )
      .map((r) => r.handler.toString())
      .join('\n')
    expect(sources).not.toMatch(/apiKeyCipher/i)
    // 允许出现 "apiKey" 字样（SaveReq 入参字段名与 maskApiKey 计算），
    // 但不得把 apiKey 直接写入任何出参对象
    expect(sources).not.toMatch(/apiKey\s*:\s*[^,}]+/i)
  })

  it('模型分页 + nameKeyword/providerId 过滤：关键字命中、分页切片、total 正确', async () => {
    const all = await mock<{ records: AgentModel[]; total: number }>('GET', '/agent/models', {
      pageNum: '1',
      pageSize: '10',
    })
    expect(all!.code).toBe(0)
    expect(all!.data.total).toBe(MOCK_AGENT_MODELS.length)
    expect(all!.data.records).toHaveLength(MOCK_AGENT_MODELS.length)

    const keyword = await mock<{ records: AgentModel[]; total: number }>('GET', '/agent/models', {
      pageNum: '1',
      pageSize: '10',
      nameKeyword: '轮询',
    })
    expect(keyword!.code).toBe(0)
    expect(keyword!.data.total).toBe(2)
    expect(keyword!.data.records.every((r) => r.name.includes('轮询'))).toBe(true)

    const byProvider = await mock<{ records: AgentModel[]; total: number }>(
      'GET',
      '/agent/models',
      { pageNum: '1', pageSize: '10', providerId: String(PROVIDER_TEST_ID) },
    )
    expect(byProvider!.code).toBe(0)
    expect(byProvider!.data.total).toBeGreaterThan(0)
    expect(byProvider!.data.records.every((r) => r.providerId === PROVIDER_TEST_ID)).toBe(true)

    const page2 = await mock<{ records: AgentModel[]; total: number }>('GET', '/agent/models', {
      pageNum: '2',
      pageSize: '4',
    })
    expect(page2!.code).toBe(0)
    expect(page2!.data.total).toBe(MOCK_AGENT_MODELS.length)
    expect(page2!.data.records.length).toBe(Math.max(0, MOCK_AGENT_MODELS.length - 4))

    // 列表响应不含明文/密文，且带供应商名称/格式回填
    const listRecords = all!.data.records
    const listKeys = new Set(listRecords.flatMap((r) => Object.keys(r)))
    expect(listKeys.has('apiKeyCipher')).toBe(false)
    expect(listKeys.has('apiKey')).toBe(false)
    expect(
      listRecords.every((r) => typeof r.providerName === 'string' || r.providerName === null),
    ).toBe(true)
  })

  it('enabled 端点：仅启用模型，capability 过滤生效', async () => {
    const chat = await mock<AgentModel[]>('GET', '/agent/models/enabled', { capability: 'CHAT' })
    expect(chat!.code).toBe(0)
    expect(chat!.data.length).toBeGreaterThan(0)
    expect(chat!.data.every((m) => m.enabled)).toBe(true)
    expect(chat!.data.every((m) => m.capabilities.includes('CHAT'))).toBe(true)

    const none = await mock<AgentModel[]>('GET', '/agent/models/enabled', {
      capability: 'EMBEDDING',
    })
    expect(none!.code).toBe(0)
    expect(none!.data).toHaveLength(0) // 种子无 EMBEDDING 能力模型
  })

  it('模型详情：可测试 id 返回完整契约字段（含供应商回填），不存在的 id 返回 404 业务码', async () => {
    const detail = await mock<AgentModel>('GET', `/agent/models/${TEST_ID}`)
    expect(detail!.code).toBe(0)
    const d = detail!.data
    expect(d.id).toBe(TEST_ID)
    expect(typeof d.providerId).toBe('number')
    expect(typeof d.providerName).toBe('string')
    expect(typeof d.providerApiFormat).toBe('string')
    expect(typeof d.name).toBe('string')
    expect(typeof d.modelName).toBe('string')
    expect(typeof d.capabilities).toBe('string')
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

  it('供应商 CRUD：创建带 Key 出脱敏值、空 Key 保留旧脱敏值、非法格式 400', async () => {
    const before = MOCK_AGENT_PROVIDERS.length
    const createReq: AgentProviderSaveReq = {
      name: '创建测试供应商',
      apiFormat: 'OPENAI_CHAT',
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'sk-testcreate-secret-key',
      enabled: true,
    }
    const created = await mock<number>('POST', '/agent/providers', {}, createReq)
    expect(created!.code).toBe(0)
    const newId = created!.data
    expect(typeof newId).toBe('number')
    expect(MOCK_AGENT_PROVIDERS).toHaveLength(before + 1)
    const createdProvider = MOCK_AGENT_PROVIDERS.find((p) => p.id === newId)!
    expect(createdProvider.apiKeyMasked).toBe('sk****ey') // 前2+****+后2
    expect((createdProvider as unknown as Record<string, unknown>)['apiKeyCipher']).toBeUndefined()
    expect((createdProvider as unknown as Record<string, unknown>)['apiKey']).toBeUndefined()

    // 非法格式 → 400
    const bad = await mock('POST', '/agent/providers', {}, { ...createReq, apiFormat: 'GRAVITON' })
    expect(bad!.code).toBe(400)

    // 空 Key 更新 → 保留旧脱敏值
    const emptyReq: AgentProviderSaveReq = {
      name: 'OpenAI 官方',
      apiFormat: 'OPENAI_CHAT',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
    }
    const oldMasked = MOCK_AGENT_PROVIDERS.find((p) => p.id === PROVIDER_TEST_ID)!.apiKeyMasked
    const emptyUpdate = await mock('PUT', `/agent/providers/${PROVIDER_TEST_ID}`, {}, emptyReq)
    expect(emptyUpdate!.code).toBe(0)
    expect(MOCK_AGENT_PROVIDERS.find((p) => p.id === PROVIDER_TEST_ID)!.apiKeyMasked).toBe(
      oldMasked,
    )

    // 新 Key → 只替换脱敏值
    const newKeyUpdate = await mock(
      'PUT',
      `/agent/providers/${PROVIDER_TEST_ID}`,
      {},
      { ...emptyReq, apiKey: 'sk-br-and-new-zz' },
    )
    expect(newKeyUpdate!.code).toBe(0)
    expect(MOCK_AGENT_PROVIDERS.find((p) => p.id === PROVIDER_TEST_ID)!.apiKeyMasked).toBe(
      'sk****zz',
    )

    // enabled 端点只返回启用供应商
    const enabled = await mock<AgentProvider[]>('GET', '/agent/providers/enabled')
    expect(enabled!.code).toBe(0)
    expect(enabled!.data.every((p) => p.enabled)).toBe(true)

    // 删除幂等
    const del = await mock('DELETE', `/agent/providers/${newId}`)
    expect(del!.code).toBe(0)
    const after = await mock('GET', `/agent/providers/${newId}`)
    expect(after!.code).toBe(404)
  })

  it('模型创建：挂在供应商下、不存在的供应商 404；lockedUntil 运行态不可写', async () => {
    const before = MOCK_AGENT_MODELS.length
    const createReq: AgentModelSaveReq = {
      providerId: PROVIDER_TEST_ID,
      name: '创建测试模型',
      modelName: 'test-model',
      temperature: 0.8,
      timeoutSeconds: 45,
      enabled: true,
    }
    const created = await mock<number>('POST', '/agent/models', {}, createReq)
    expect(created!.code).toBe(0)
    const newId = created!.data
    expect(MOCK_AGENT_MODELS).toHaveLength(before + 1)
    const createdModel = MOCK_AGENT_MODELS.find((m) => m.id === newId)!
    expect(createdModel.providerId).toBe(PROVIDER_TEST_ID)
    expect(createdModel.lockedUntil).toBeNull()
    expect((createdModel as unknown as Record<string, unknown>)['apiKeyCipher']).toBeUndefined()
    expect((createdModel as unknown as Record<string, unknown>)['apiKey']).toBeUndefined()

    // 不存在的供应商 → 404（密钥在供应商侧，模型不再带 Key 字段）
    const badProvider = await mock('POST', '/agent/models', {}, { ...createReq, providerId: 99999 })
    expect(badProvider!.code).toBe(404)

    // 清理（保持后续用例状态稳定）
    await mock('DELETE', `/agent/models/${newId}`)
  })

  it('删除幂等：删除后详情 404、再删仍 code 0', async () => {
    const del = await mock('DELETE', `/agent/models/${TEST_ID}`)
    expect(del!.code).toBe(0)
    const after = await mock('GET', `/agent/models/${TEST_ID}`)
    expect(after!.code).toBe(404)

    const delAgain = await mock('DELETE', `/agent/models/${TEST_ID}`)
    expect(delAgain!.code).toBe(0) // 幂等：不存在也返回 code 0
  })

  it('连通性测试：存在即 success=true，不读取 enabled/lockedUntil；不存在返回 404 业务码', async () => {
    // 普通可达模型（id=2）→ success=true 带 message 与 latencyMs
    const ok = await mock<{ success: boolean; message: string; latencyMs: number }>(
      'POST',
      '/agent/models/2/test-connection',
    )
    expect(ok!.code).toBe(0)
    expect(ok!.data.success).toBe(true)
    expect(typeof ok!.data.message).toBe('string')
    expect(typeof ok!.data.latencyMs).toBe('number')

    // disabled 模型（id=6）→ 仍 success=true：测试为真实最小调用，不读取 enabled
    const disabled = await mock<{ success: boolean; message: string; latencyMs: number }>(
      'POST',
      '/agent/models/6/test-connection',
    )
    expect(disabled!.code).toBe(0)
    expect(disabled!.data.success).toBe(true)

    // lockedUntil 未来时间（id=4）→ 仍 success=true：与锁定无关
    const locked = await mock<{ success: boolean; message: string; latencyMs: number }>(
      'POST',
      '/agent/models/4/test-connection',
    )
    expect(locked!.code).toBe(0)
    expect(locked!.data.success).toBe(true)

    // 不存在 id → 404 业务码
    const missing = await mock('POST', '/agent/models/99999/test-connection')
    expect(missing!.code).toBe(404)
    expect(missing!.data).toBeNull()
  })

  // ── 菜单 tree：大模型管理可达 ────────────────────────────

  it('MOCK_MENU_TREE 中「智能体」为目录且含「大模型管理」二级菜单（对齐 V26 形态）', () => {
    const agent = (MOCK_MENU_TREE as unknown as Array<Record<string, unknown>>).find(
      (n) => n.name === 'agent',
    )
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

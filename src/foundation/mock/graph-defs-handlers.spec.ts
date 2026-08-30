/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { dispatchMock } from './index'

async function api<T>(method: string, url: string, params = {}, body = {}) {
  return dispatchMock<T>(method, url, '/api', params, body)
}

describe('graph-defs mock handlers — prompt config semantics (M07-F02-02)', () => {
  // ── GET /api/agent/graph-defs/:id（图详情，含 prompt 配置键） ──

  it('GET /api/agent/graph-defs/:id returns graph with systemPrompt in LLM config', async () => {
    const res = await api<any>('GET', '/agent/graph-defs/1002')
    expect(res!.code).toBe(0)
    const data = res!.data
    // 响应含 ProcessGraph 元素 + 元数据
    expect(data.id).toBe(1002)
    expect(data.defVersion).toBe(1)
    expect(data.status).toBe('PUBLISHED')
    expect(Array.isArray(data.elements)).toBe(true)
    // LLM 节点 config 包含 systemPrompt 键
    const llmNode = data.elements.find((e: any) => e.kind === 'node' && e.type === 'LLM')
    expect(llmNode).toBeDefined()
    expect(llmNode!.config).toBeDefined()
    expect(llmNode!.config.systemPrompt).toBe('你是一名专业的中文翻译助手。')
  })

  it('GET /api/agent/graph-defs/:id 404 when def not found', async () => {
    const res = await api<any>('GET', '/agent/graph-defs/9999')
    expect(res!.code).toBe(404)
  })

  // ── POST /api/agent/graph-defs/:id/execute（图执行，演示 prompt 语义） ──
  // 注意：fixture 读取测试放在修改测试之前，避免内存状态相互影响。

  it('execute: historical graph without prompt config returns input as output (default fallback)', async () => {
    // fixture 1001：LLM 节点无 systemPrompt / userPromptTemplate，应回退到 input 变量
    const res = await api<any>('POST', '/agent/graph-defs/1001/execute', {}, { input: 'hello' })
    expect(res!.code).toBe(0)
    expect(res!.data.success).toBe(true)
    expect(res!.data.output).toBe('hello')
    expect(res!.data.latencyMs).toBeGreaterThan(0)
  })

  it('execute: graph with systemPrompt only falls back to input variable', async () => {
    // fixture 1002：LLM 节点仅有 systemPrompt，无 userPromptTemplate → 回退 input 穿透
    const res = await api<any>(
      'POST',
      '/agent/graph-defs/1002/execute',
      {},
      {
        input: 'hello world',
      },
    )
    expect(res!.code).toBe(0)
    expect(res!.data.success).toBe(true)
    expect(res!.data.output).toBe('hello world')
  })

  it('execute: undefined variable fails with UNDEFINED_VARIABLE-style message', async () => {
    // fixture 1004：LLM 节点引用 {{undefinedVar}}，变量表只有 { input } → 失败
    const res = await api<any>(
      'POST',
      '/agent/graph-defs/1004/execute',
      {},
      {
        input: 'anything',
      },
    )
    expect(res!.code).toBe(0) // HTTP 200，业务失败
    expect(res!.data.success).toBe(false)
    expect(res!.data.errorMessage).toContain('引用了未定义的变量')
    expect(res!.data.errorMessage).toContain('undefinedVar')
    expect(res!.data.errorMessage).toContain('llm_1')
    expect(res!.data.latencyMs).toBeGreaterThan(0)
  })

  it('execute: response fields match AgentGraphExecuteResp contract exactly', async () => {
    // 验证响应字段命名与 AgentGraphExecuteResp 契约完全一致
    // 使用 fixture 1002（不会被本测试套件修改）
    const res = await api<any>('POST', '/agent/graph-defs/1002/execute', {}, { input: 'test' })
    expect(res!.code).toBe(0)
    const data = res!.data
    // 必须字段
    expect(typeof data.success).toBe('boolean')
    expect(typeof data.latencyMs).toBe('number')
    // 可选字段（成功时存在）
    expect(typeof data.output).toBe('string')
    expect(typeof data.executionId).toBe('number')
    // 不应有额外字段
    const allowedKeys = new Set(['success', 'output', 'errorMessage', 'latencyMs', 'executionId'])
    for (const key of Object.keys(data)) {
      expect(allowedKeys.has(key)).toBe(true)
    }
  })

  it('execute: 404 when graph def not found', async () => {
    const res = await api<any>('POST', '/agent/graph-defs/9999/execute', {}, { input: 'test' })
    expect(res!.code).toBe(404)
  })

  // ── 以下测试会修改 fixture 1001 内存状态，放在最后 ──

  it('execute: template value containing braces is not second-pass interpolated', async () => {
    // 通过 PUT 把 fixture 1001 改为模板 {{input}}，然后执行 input="{{y}}"。
    // 插值后 output = "{{y}}"，不二次解析为变量 y。
    const simpleTemplate = {
      elements: [
        { id: 'start_1', kind: 'node', type: 'START' },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: {
            agentModelConfigId: 1,
            userPromptTemplate: '{{input}}',
          },
        },
        { id: 'end_1', kind: 'node', type: 'END' },
        { id: 'e1', kind: 'edge', source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', source: 'llm_1', target: 'end_1' },
      ],
    }
    await api<any>('PUT', '/agent/graph-defs/1001/graph', {}, simpleTemplate)
    const res = await api<any>(
      'POST',
      '/agent/graph-defs/1001/execute',
      {},
      {
        input: '{{y}}',
      },
    )
    expect(res!.code).toBe(0)
    expect(res!.data.success).toBe(true)
    // 输出应为 "{{y}}"（input 变量的值原样传递），不二次解析为变量 y
    expect(res!.data.output).toBe('{{y}}')
  })

  it('PUT /api/agent/graph-defs/:id/graph updates elements in memory', async () => {
    const res = await api<any>(
      'PUT',
      '/agent/graph-defs/1001/graph',
      {},
      {
        elements: [
          { id: 'start_1', kind: 'node', type: 'START' },
          { id: 'end_1', kind: 'node', type: 'END' },
          { id: 'e1', kind: 'edge', source: 'start_1', target: 'end_1' },
        ],
      },
    )
    expect(res!.code).toBe(0)
    // 验证内存中已更新
    const detail = await api<any>('GET', '/agent/graph-defs/1001')
    expect(detail!.data.elements).toHaveLength(3)
  })
})

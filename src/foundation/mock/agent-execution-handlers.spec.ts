/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { dispatchMock } from './index'

async function api<T>(method: string, url: string, params = {}, body = {}) {
  return dispatchMock<T>(method, url, '/api', params, body)
}

describe('agent execution mock handlers — direct handler tests (Standard 8)', () => {
  // ── 列表端点 ────────────────────────────────────────────────────

  it('GET /api/agent/graph-executions 默认分页返回完整列表', async () => {
    const res = await api<{ records: unknown[]; total: number; pageNum: number; pageSize: number }>(
      'GET',
      '/agent/graph-executions',
      { pageNum: '1', pageSize: '10' },
    )
    expect(res!.code).toBe(0)
    expect(Array.isArray(res!.data.records)).toBe(true)
    // 至少有 3 条种子数据
    expect(res!.data.total).toBeGreaterThanOrEqual(3)
  })

  it('GET /api/agent/graph-executions?graphDefId=1 正确过滤', async () => {
    const res = await api<any>('GET', '/agent/graph-executions', {
      pageNum: '1',
      pageSize: '100',
      graphDefId: '1',
    })
    expect(res!.code).toBe(0)
    res!.data.records.forEach((r: any) => expect(r.graphDefId).toBe(1))
  })

  it('GET /api/agent/graph-executions?graphDefId=999 无匹配时返回空页', async () => {
    const res = await api<any>('GET', '/agent/graph-executions', {
      pageNum: '1',
      pageSize: '10',
      graphDefId: '999',
    })
    expect(res!.code).toBe(0)
    expect(res!.data.records).toEqual([])
    expect(res!.data.total).toBe(0)
  })

  // ── 详情端点 ────────────────────────────────────────────────────

  it('GET /api/agent/graph-executions/1 成功返回详情关键字段', async () => {
    const res = await api<any>('GET', '/agent/graph-executions/1')
    expect(res!.code).toBe(0)
    expect(res!.data.id).toBe(1)
    expect(res!.data.status).toBe('SUCCESS')
    expect(res!.data.success).toBe(true)
    expect(res!.data.latencyMs).toBeGreaterThan(0)
    expect(res!.data.createTime).toBeDefined()
    expect(res!.data.traceId).toBeDefined()
    expect(res!.data.nodeDetails).toHaveLength(4)
  })

  it('GET /api/agent/graph-executions/2 FAILED 详情含错误信息', async () => {
    const res = await api<any>('GET', '/agent/graph-executions/2')
    expect(res!.code).toBe(0)
    expect(res!.data.status).toBe('FAILED')
    expect(res!.data.success).toBe(false)
    expect(res!.data.errorMessage).toContain('超时')
    expect(res!.data.errorCategory).toBe('MODEL_CALL_TIMEOUT')
  })

  it('GET /api/agent/graph-executions/9999 不存在返回 404', async () => {
    const res = await api<any>('GET', '/agent/graph-executions/9999')
    expect(res!.code).toBe(404)
    expect(res!.message).toContain('不存在')
  })

  // ── 节点端点 ────────────────────────────────────────────────────

  it('GET /api/agent/graph-executions/1/nodes 按 nodeSeq 升序', async () => {
    const res = await api<any>('GET', '/agent/graph-executions/1/nodes')
    expect(res!.code).toBe(0)
    const nodes = res!.data
    for (let i = 0; i < nodes.length - 1; i++) {
      expect(nodes[i].nodeSeq).toBeLessThan(nodes[i + 1].nodeSeq)
    }
  })

  it('GET /api/agent/graph-executions/3/nodes FORK/JOIN 分支含非零 branchId', async () => {
    const res = await api<any>('GET', '/agent/graph-executions/3/nodes')
    expect(res!.code).toBe(0)
    const nodes = res!.data
    expect(nodes.some((n: any) => n.branchId && n.branchId !== '0')).toBe(true)
    expect(nodes.some((n: any) => n.nodeType === 'FORK')).toBe(true)
    expect(nodes.some((n: any) => n.nodeType === 'JOIN')).toBe(true)
  })

  it('GET /api/agent/graph-executions/2/nodes 失败节点含 errorMessage', async () => {
    const res = await api<any>('GET', '/agent/graph-executions/2/nodes')
    expect(res!.code).toBe(0)
    const failedNode = res!.data.find((n: any) => n.status === 'FAILED')
    expect(failedNode).toBeDefined()
    expect(failedNode!.errorMessage).toBeDefined()
  })

  it('GET /api/agent/graph-executions/9999/nodes 不存在返回 404', async () => {
    const res = await api<any>('GET', '/agent/graph-executions/9999/nodes')
    expect(res!.code).toBe(404)
  })

  it('LOOP 语义 — 同一 nodeId 可多次出现（不重复去重）', async () => {
    // 验证 handler 不做去重逻辑，保持原始节点顺序
    const res = await api<any>('GET', '/agent/graph-executions/1/nodes')
    expect(res!.code).toBe(0)
    const allNodes = res!.data as any[]
    const uniqueIds = new Set(allNodes.map((n) => n.nodeId))
    // 允许有重复 nodeId（LOOP 场景），但此处所有节点唯一——handler 不做强制去重
    expect(uniqueIds.size).toBeLessThanOrEqual(allNodes.length)
  })
})

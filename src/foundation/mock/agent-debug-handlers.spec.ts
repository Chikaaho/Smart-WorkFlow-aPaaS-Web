/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { dispatchMock } from './index'
import {
  MOCK_DEBUG_SESSIONS,
  MOCK_GRAPH_DEFS,
  MOCK_CURRENT_SESSION,
  switchMockSession,
} from './seeds'

async function api<T>(
  method: string,
  url: string,
  params: Record<string, string> = {},
  body: unknown = {},
) {
  return dispatchMock<T>(method, url, '/api', params, body as any)
}

describe('agent debug mock handlers — direct handler tests (P7/M07-F02-04)', () => {
  beforeEach(() => {
    // Ensure superadmin authenticated before each test
    switchMockSession('superadmin')
  })

  // ── 1: POST create succeeds with PAUSED and expiresAt ──────────────
  it('POST /api/agent/graph-debug-sessions succeeds with PAUSED and expiresAt', async () => {
    const res = await api<any>(
      'POST',
      '/agent/graph-debug-sessions',
      {},
      { graphDefId: 1001, input: 'hello debug' },
    )
    expect(res!.code).toBe(0)
    expect(res!.data.status).toBe('PAUSED')
    expect(res!.data.expiresAt).toBeDefined()
    expect(typeof res!.data.expiresAt).toBe('string')
    expect(res!.data.version).toBe(0)
    expect(res!.data.nextNodeId).toBeDefined()
  })

  // ── 2: POST create fails for DRAFT ─────────────────────────────────
  it('POST /api/agent/graph-debug-sessions fails 400 when graphDef is DRAFT', async () => {
    const draftId = 99999
    MOCK_GRAPH_DEFS.push({
      id: draftId,
      name: '草稿图',
      graphKey: 'draft-graph',
      defVersion: 1,
      status: 'DRAFT',
      graphJson: {
        graphKey: 'draft-graph',
        name: '草稿图',
        version: 1,
        canvas: {},
        elements: [
          { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
          { id: 'end_1', kind: 'node', type: 'END', style: { x: 100, y: 0 } },
          { id: 'e1', kind: 'edge', source: 'start_1', target: 'end_1' },
        ],
      },
    } as any)
    try {
      const res = await api<any>(
        'POST',
        '/agent/graph-debug-sessions',
        {},
        { graphDefId: draftId, input: 'test' },
      )
      expect(res!.code).toBe(400)
      expect(res!.message).toContain('仅已发布')
    } finally {
      const idx = MOCK_GRAPH_DEFS.findIndex((d) => d.id === draftId)
      if (idx >= 0) MOCK_GRAPH_DEFS.splice(idx, 1)
    }
  })

  // ── 3: GET detail returns session ──────────────────────────────────
  it('GET /api/agent/graph-debug-sessions/:id returns session detail', async () => {
    const created = await api<any>(
      'POST',
      '/agent/graph-debug-sessions',
      {},
      { graphDefId: 1001, input: 'detail-test' },
    )
    const id = created!.data.id as number
    const res = await api<any>('GET', `/agent/graph-debug-sessions/${id}`)
    expect(res!.code).toBe(0)
    expect(res!.data.id).toBe(id)
    expect(res!.data.graphDefId).toBe(1001)
    expect(res!.data.input).toBe('detail-test')
  })

  // ── 4: GET nodes sorted by nodeSeq ─────────────────────────────────
  it('GET /api/agent/graph-debug-sessions/:id/nodes returns nodes sorted by nodeSeq', async () => {
    // Use seed session 2 which has 3 nodes
    const res = await api<any>('GET', '/agent/graph-debug-sessions/2/nodes')
    expect(res!.code).toBe(0)
    const nodes = res!.data as any[]
    expect(nodes.length).toBe(3)
    for (let i = 0; i < nodes.length - 1; i++) {
      expect(nodes[i].nodeSeq).toBeLessThan(nodes[i + 1].nodeSeq)
    }
  })

  // ── 5: POST step advances one trace ────────────────────────────────
  it('POST /api/agent/graph-debug-sessions/:id/step advances one trace entry', async () => {
    const created = await api<any>(
      'POST',
      '/agent/graph-debug-sessions',
      {},
      { graphDefId: 1001, input: 'step-test' },
    )
    const id = created!.data.id as number
    const before = await api<any>('GET', `/agent/graph-debug-sessions/${id}/nodes`)
    const beforeLen = (before!.data as any[]).length

    const stepRes = await api<any>('POST', `/agent/graph-debug-sessions/${id}/step`, {}, {})
    expect(stepRes!.code).toBe(0)

    const after = await api<any>('GET', `/agent/graph-debug-sessions/${id}/nodes`)
    expect((after!.data as any[]).length).toBe(beforeLen + 1)
    // version should have incremented
    expect(stepRes!.data.version).toBeGreaterThan(created!.data.version)
  })

  // ── 6: POST step fails when not PAUSED ─────────────────────────────
  it('POST /api/agent/graph-debug-sessions/:id/step fails 400 when not PAUSED (COMPLETED)', async () => {
    // Seed session 2 is COMPLETED
    const res = await api<any>('POST', '/agent/graph-debug-sessions/2/step', {}, {})
    expect(res!.code).toBe(400)
    expect(res!.message).toContain('终结')
  })

  // ── 7: PUT breakpoints validates node existence ────────────────────
  it('PUT /api/agent/graph-debug-sessions/:id/breakpoints validates node existence (invalid node → 400)', async () => {
    const created = await api<any>(
      'POST',
      '/agent/graph-debug-sessions',
      {},
      { graphDefId: 1001, input: 'bp-test' },
    )
    const id = created!.data.id as number

    const bad = await api<any>(
      'PUT',
      `/agent/graph-debug-sessions/${id}/breakpoints`,
      {},
      { breakpoints: ['__no_such_node__'] },
    )
    expect(bad!.code).toBe(400)
    expect(bad!.message).toContain('不存在')

    const good = await api<any>(
      'PUT',
      `/agent/graph-debug-sessions/${id}/breakpoints`,
      {},
      { breakpoints: ['llm_1'] },
    )
    expect(good!.code).toBe(0)
    expect(good!.data.breakpoints).toContain('llm_1')
  })

  // ── 8: POST continue stops at breakpoint ───────────────────────────
  it('POST /api/agent/graph-debug-sessions/:id/continue stops at breakpoint', async () => {
    // Create a new session based on graph 1003 which has START→LLM→END, set breakpoint at end_1
    // Use 1001 (START→LLM→END) as well; breakpoint at llm_1 should cause continue to stop before llm_1
    const created = await api<any>(
      'POST',
      '/agent/graph-debug-sessions',
      {},
      { graphDefId: 1001, input: 'continue-bp-test' },
    )
    const id = created!.data.id as number

    // Set breakpoint at llm_1
    const bpRes = await api<any>(
      'PUT',
      `/agent/graph-debug-sessions/${id}/breakpoints`,
      {},
      { breakpoints: ['llm_1'] },
    )
    expect(bpRes!.code).toBe(0)

    // Advance one step to have at least one trace, so continue's alreadyTraced guard allows breakpoint stop
    await api<any>('POST', `/agent/graph-debug-sessions/${id}/step`, {}, {})

    // Now nextNodeId should be llm_1 or end_1 depending on graph; set breakpoint at nextNode and continue should stop
    const sessBefore = await api<any>('GET', `/agent/graph-debug-sessions/${id}`)
    const nextId = sessBefore!.data.nextNodeId as string | null
    if (nextId) {
      await api<any>(
        'PUT',
        `/agent/graph-debug-sessions/${id}/breakpoints`,
        {},
        { breakpoints: [nextId] },
      )
      const contRes = await api<any>('POST', `/agent/graph-debug-sessions/${id}/continue`, {}, {})
      expect(contRes!.code).toBe(0)
      // Should be paused at breakpoint (still PAUSED, nextNodeId is the breakpoint)
      expect(contRes!.data.nextNodeId).toBe(nextId)
      expect(contRes!.data.status).toBe('PAUSED')
    } else {
      // If already completed, continue should fail
      const contRes = await api<any>('POST', `/agent/graph-debug-sessions/${id}/continue`, {}, {})
      // Either 400 (terminated) or 0 with COMPLETED
      expect([0, 400]).toContain(contRes!.code)
    }
  })

  // ── 9: POST stop transitions to STOPPED ────────────────────────────
  it('POST /api/agent/graph-debug-sessions/:id/stop transitions PAUSED → STOPPED', async () => {
    const created = await api<any>(
      'POST',
      '/agent/graph-debug-sessions',
      {},
      { graphDefId: 1001, input: 'stop-test' },
    )
    const id = created!.data.id as number

    const stopRes = await api<any>('POST', `/agent/graph-debug-sessions/${id}/stop`, {}, {})
    expect(stopRes!.code).toBe(0)
    expect(stopRes!.data.status).toBe('STOPPED')
    expect(stopRes!.data.nextNodeId).toBeNull()

    // Further stop should fail 400
    const second = await api<any>('POST', `/agent/graph-debug-sessions/${id}/stop`, {}, {})
    expect(second!.code).toBe(400)
  })

  // ── 10: Expired PAUSED becomes EXPIRED ─────────────────────────────
  it('GET detail for expired PAUSED session returns EXPIRED', async () => {
    const created = await api<any>(
      'POST',
      '/agent/graph-debug-sessions',
      {},
      { graphDefId: 1001, input: 'expired-test' },
    )
    const id = created!.data.id as number
    // Mutate expiresAt to past
    const sess = MOCK_DEBUG_SESSIONS.find((s) => s.id === id)!
    const originalExpires = sess.expiresAt
    sess.expiresAt = '2000-01-01 00:00:00'
    try {
      const res = await api<any>('GET', `/agent/graph-debug-sessions/${id}`)
      expect(res!.code).toBe(0)
      expect(res!.data.status).toBe('EXPIRED')
      expect(res!.data.nextNodeId).toBeNull()
    } finally {
      // Restore to avoid polluting other tests (status already EXPIRED, keep as is for isolation)
      sess.expiresAt = originalExpires
    }
  })

  // ── 11: 401 when not authenticated ─────────────────────────────────
  it('GET /api/agent/graph-debug-sessions/:id returns 401 when not authenticated', async () => {
    const originalId = MOCK_CURRENT_SESSION.user.id
    // Mutate to unauthenticated
    ;(MOCK_CURRENT_SESSION.user as any).id = ''
    try {
      const res = await api<any>('GET', '/agent/graph-debug-sessions/1')
      expect(res!.code).toBe(401)
    } finally {
      ;(MOCK_CURRENT_SESSION.user as any).id = originalId
    }
  })

  // ── 12: 409 when version mismatch ──────────────────────────────────
  it('POST /api/agent/graph-debug-sessions/:id/step returns 409 when expectedVersion mismatches', async () => {
    const created = await api<any>(
      'POST',
      '/agent/graph-debug-sessions',
      {},
      { graphDefId: 1001, input: 'conflict-test' },
    )
    const id = created!.data.id as number
    const wrongVersion = 9999
    const res = await api<any>(
      'POST',
      `/agent/graph-debug-sessions/${id}/step`,
      { expectedVersion: String(wrongVersion) },
      {},
    )
    expect(res!.code).toBe(409)
  })

  // ── 13: 404 for nonexistent session ────────────────────────────────
  it('GET /api/agent/graph-debug-sessions/99999 returns 404 when not found', async () => {
    const res = await api<any>('GET', '/agent/graph-debug-sessions/99999')
    expect(res!.code).toBe(404)
  })

  // ── 14: 403 when lacking permission ────────────────────────────────
  it('POST /api/agent/graph-debug-sessions returns 403 when user lacks manage permission', async () => {
    switchMockSession('user')
    try {
      const res = await api<any>(
        'POST',
        '/agent/graph-debug-sessions',
        {},
        { graphDefId: 1001, input: 'forbidden' },
      )
      expect(res!.code).toBe(403)
    } finally {
      switchMockSession('superadmin')
    }
  })

  // ── 15: step nodes 404 for nonexistent session ─────────────────────
  it('GET /api/agent/graph-debug-sessions/99999/nodes returns 404', async () => {
    const res = await api<any>('GET', '/agent/graph-debug-sessions/99999/nodes')
    expect(res!.code).toBe(404)
  })
})

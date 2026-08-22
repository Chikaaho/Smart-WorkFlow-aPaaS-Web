/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type RouteRecordRaw } from 'vue-router'

// ─── mock agent api (must be before importing DebugSessionView) ───
vi.mock('@/modules/agent/api', () => ({
  getDebugSession: vi.fn(),
  listDebugNodes: vi.fn(),
  stepDebugSession: vi.fn(),
  continueDebugSession: vi.fn(),
  stopDebugSession: vi.fn(),
  updateDebugBreakpoints: vi.fn(),
  pageGraphExecutions: vi.fn(),
  pageGraphExecutionsWithVersion: vi.fn(),
  pageDebugSessions: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import { getDebugSession, listDebugNodes } from '@/modules/agent/api'
import type { AgentGraphDebugSession, AgentGraphDebugNode } from '@/contracts/agent'
import DebugSessionView from '@/modules/agent/views/DebugSessionView.vue'

// ─── stubs (same minimal set as DebugSessionView.spec) ───
const STUBS = {
  'el-button': {
    props: ['disabled', 'loading', 'type', 'size'],
    template: '<button :disabled="disabled"><slot/></button>',
  },
  'el-icon': { template: '<i><slot/></i>' },
  ArrowLeft: { template: '<i>arrow</i>' },
  'el-tag': {
    props: ['type', 'size'],
    template: '<span :class="type"><slot/></span>',
  },
  'el-skeleton': { template: '<div class="el-skeleton">loading</div>' },
  'el-alert': {
    props: ['title', 'type'],
    template: '<div class="el-alert" :class="type">{{ title }}</div>',
  },
  'el-card': { template: '<div class="el-card"><slot name="header"/><slot/></div>' },
  'el-empty': { template: '<div class="el-empty">empty</div>' },
  'el-input': {
    props: ['modelValue', 'placeholder', 'disabled', 'size'],
    template: '<input :value="modelValue" />',
  },
  'el-checkbox': {
    props: ['modelValue', 'disabled'],
    template: '<input type="checkbox" :checked="modelValue" :disabled="disabled" />',
  },
  NodeTrajectory: {
    props: ['nodes'],
    template: '<div class="node-trajectory-stub">{{ JSON.stringify(nodes) }}</div>',
  },
  SafeHtml: {
    props: ['html'],
    template: '<div class="safe-html">{{ html }}</div>',
  },
}

// ─── mock data for two server states ───
const SESSION_FIRST: AgentGraphDebugSession = {
  id: 1,
  graphDefId: 1001,
  graphDefVersion: 1,
  status: 'PAUSED',
  input: 'hello debug first',
  breakpoints: ['llm_1'],
  variables: { input: 'hello debug first' } as any,
  traceCount: 1,
  nextNodeId: 'llm_1',
  nextBranchId: '0',
  resultText: null,
  errorCategory: null,
  errorMessage: null,
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
  expiresAt: '2030-08-22 10:30:00',
  createTime: '2026-08-22 09:00:00',
  updateTime: '2026-08-22 09:00:05',
  version: 1,
}

const SESSION_SECOND: AgentGraphDebugSession = {
  id: 1,
  graphDefId: 1001,
  graphDefVersion: 1,
  status: 'PAUSED',
  input: 'hello debug second',
  breakpoints: ['llm_1'],
  variables: { input: 'hello debug second', result: 'hello debug second -> [llm_1 output]' } as any,
  traceCount: 3,
  nextNodeId: 'end_1',
  nextBranchId: '0',
  resultText: null,
  errorCategory: null,
  errorMessage: null,
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
  expiresAt: '2030-08-22 10:30:00',
  createTime: '2026-08-22 09:00:00',
  updateTime: '2026-08-22 09:05:05',
  version: 3,
}

const NODES_FIRST: AgentGraphDebugNode[] = [
  {
    id: 101,
    debugSessionId: 1,
    nodeSeq: 1,
    branchId: '0',
    nodeId: 'start_1',
    nodeType: 'START',
    nodeLatencyMs: 5,
    variableSnapshot: JSON.stringify({ input: 'hello debug first' }),
    inputTokens: null,
    outputTokens: null,
  },
]

const NODES_SECOND: AgentGraphDebugNode[] = [
  {
    id: 101,
    debugSessionId: 1,
    nodeSeq: 1,
    branchId: '0',
    nodeId: 'start_1',
    nodeType: 'START',
    nodeLatencyMs: 5,
    variableSnapshot: JSON.stringify({ input: 'hello debug second' }),
    inputTokens: null,
    outputTokens: null,
  },
  {
    id: 102,
    debugSessionId: 1,
    nodeSeq: 2,
    branchId: '0',
    nodeId: 'llm_1',
    nodeType: 'LLM',
    nodeLatencyMs: 80,
    variableSnapshot: JSON.stringify({
      input: 'hello debug second',
      result: 'hello debug second -> [llm_1 output]',
    }),
    inputTokens: 10,
    outputTokens: 20,
  },
  {
    id: 103,
    debugSessionId: 1,
    nodeSeq: 3,
    branchId: '0',
    nodeId: 'end_1',
    nodeType: 'END',
    nodeLatencyMs: 2,
    variableSnapshot: JSON.stringify({
      input: 'hello debug second',
      result: 'hello debug second -> [llm_1 output]',
    }),
    inputTokens: null,
    outputTokens: null,
  },
]

function createDebugRouter() {
  const routes: RouteRecordRaw[] = [
    {
      path: '/agent/debug/:sessionId',
      name: 'agent-debug-session',
      component: DebugSessionView,
    },
    {
      path: '/404',
      name: 'not-found',
      component: { template: '<div>404</div>' },
    },
  ]
  return createRouter({
    history: createMemoryHistory(),
    routes,
  })
}

describe('agent/debug  真实路由刷新恢复  G6', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('G6 真实路由刷新 — 首次导航拉取服务端首态，销毁后以新路由器同 URL 重建拉取服务端新态（服务端为真源）', async () => {
    // ── 第一次挂载：服务端首态 traceCount=1 / llm_1 ──
    vi.mocked(getDebugSession).mockResolvedValueOnce(SESSION_FIRST)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(NODES_FIRST)

    const router1 = createDebugRouter()
    await router1.push('/agent/debug/1')
    await router1.isReady()

    const wrapper1 = mount(DebugSessionView, {
      global: {
        plugins: [router1, createPinia()],
        stubs: STUBS,
      },
    })
    await flushPromises()
    await nextTick()
    await nextTick()

    // 触发真实 useRoute 参数绑定 + onMounted 并发拉取
    expect(getDebugSession).toHaveBeenCalledTimes(1)
    expect(getDebugSession).toHaveBeenCalledWith(1)
    expect(listDebugNodes).toHaveBeenCalledWith(1)
    const text1 = wrapper1.text()
    expect(text1).toContain('trace 1')
    expect(text1).toContain('llm_1')
    expect(text1).toContain('hello debug first')
    // 未使用 localStorage/sessionStorage
    expect(wrapper1.text()).not.toContain('localStorage')

    wrapper1.unmount()

    // ── 模拟刷新：新建 Router 实例 + 新挂载，同 URL 再次直达服务端 ──
    // 服务端在此期间已推进到第二态 traceCount=3 / end_1
    vi.mocked(getDebugSession).mockResolvedValueOnce(SESSION_SECOND)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(NODES_SECOND)

    const router2 = createDebugRouter()
    await router2.push('/agent/debug/1')
    await router2.isReady()

    const wrapper2 = mount(DebugSessionView, {
      global: {
        plugins: [router2, createPinia()],
        stubs: STUBS,
      },
    })
    await flushPromises()
    await nextTick()
    await nextTick()

    // 第二次挂载必须触发第二次服务端拉取（计数递增证明非缓存）
    expect(vi.mocked(getDebugSession).mock.calls.length).toBe(2)
    expect(vi.mocked(getDebugSession).mock.calls[1][0]).toBe(1)
    expect(vi.mocked(listDebugNodes).mock.calls.length).toBe(2)

    const text2 = wrapper2.text()
    // 新态渲染 — 来自第二次服务端响应而非首次缓存
    expect(text2).toContain('trace 3')
    expect(text2).toContain('end_1')
    expect(text2).toContain('hello debug second')
    // 轨迹数量随服务端更新
    const traj = wrapper2.find('.node-trajectory-stub')
    expect(traj.exists()).toBe(true)
    const parsed = JSON.parse(traj.text()) as any[]
    expect(parsed.length).toBe(3)
    expect(parsed[2].nodeId).toBe('end_1')

    wrapper2.unmount()
  })
})

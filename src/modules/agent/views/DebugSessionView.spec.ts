/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'
import { ApiError } from '@/foundation/request'

// ─── hoisted router mocks ──────────────────────────────────────
const { routeParamsMock, pushMock, replaceMock } = vi.hoisted(() => ({
  routeParamsMock: { sessionId: '1' } as any,
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: routeParamsMock, query: {} }),
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

vi.mock('@/modules/agent/api', () => ({
  getDebugSession: vi.fn(),
  listDebugNodes: vi.fn(),
  stepDebugSession: vi.fn(),
  continueDebugSession: vi.fn(),
  stopDebugSession: vi.fn(),
  updateDebugBreakpoints: vi.fn(),
  pageGraphExecutions: vi.fn(),
  pageGraphExecutionsWithVersion: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import {
  getDebugSession,
  listDebugNodes,
  stepDebugSession,
  updateDebugBreakpoints,
} from '@/modules/agent/api'
import type { AgentGraphDebugSession, AgentGraphDebugNode } from '@/contracts/agent'
import DebugSessionView from './DebugSessionView.vue'

// ─── stubs ─────────────────────────────────────────────────────
const STUBS_DEBUG = {
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

// ─── mock data ─────────────────────────────────────────────────
const MOCK_PAUSED: AgentGraphDebugSession = {
  id: 1,
  graphDefId: 1001,
  graphDefVersion: 1,
  status: 'PAUSED',
  input: 'hello debug',
  breakpoints: ['llm_1'],
  variables: { input: 'hello debug' } as any,
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

const MOCK_COMPLETED: AgentGraphDebugSession = {
  id: 2,
  graphDefId: 1002,
  graphDefVersion: 1,
  status: 'COMPLETED',
  input: 'completed input',
  breakpoints: [],
  variables: { input: 'completed input', result: 'completed input -> [llm_1 output]' } as any,
  traceCount: 3,
  nextNodeId: null,
  nextBranchId: null,
  resultText: 'completed input -> [llm_1 output]',
  errorCategory: null,
  errorMessage: null,
  latencyMs: 95,
  inputTokens: 10,
  outputTokens: 20,
  expiresAt: '2030-08-22 11:00:00',
  createTime: '2026-08-22 08:00:00',
  updateTime: '2026-08-22 08:00:10',
  version: 3,
}

const MOCK_PAUSED_NODES: AgentGraphDebugNode[] = [
  {
    id: 101,
    debugSessionId: 1,
    nodeSeq: 1,
    branchId: '0',
    nodeId: 'start_1',
    nodeType: 'START',
    nodeLatencyMs: 5,
    variableSnapshot: JSON.stringify({ input: 'hello debug' }),
    inputTokens: null,
    outputTokens: null,
  },
]

const MOCK_COMPLETED_NODES: AgentGraphDebugNode[] = [
  {
    id: 201,
    debugSessionId: 2,
    nodeSeq: 1,
    branchId: '0',
    nodeId: 'start_1',
    nodeType: 'START',
    nodeLatencyMs: 5,
    variableSnapshot: JSON.stringify({ input: 'completed input' }),
    inputTokens: null,
    outputTokens: null,
  },
  {
    id: 202,
    debugSessionId: 2,
    nodeSeq: 2,
    branchId: '0',
    nodeId: 'llm_1',
    nodeType: 'LLM',
    nodeLatencyMs: 80,
    variableSnapshot: JSON.stringify({
      input: 'completed input',
      result: 'completed input -> [llm_1 output]',
    }),
    inputTokens: 10,
    outputTokens: 20,
  },
]

async function createWrapper(sessionId: string = '1') {
  vi.clearAllMocks()
  Object.keys(routeParamsMock).forEach((k) => delete (routeParamsMock as any)[k])
  Object.assign(routeParamsMock, { sessionId })
  return mount(DebugSessionView, {
    global: {
      plugins: [createPinia()],
      stubs: STUBS_DEBUG,
    },
  })
}

describe('DebugSessionView.vue — P7/M07-F02-04 图单步调试视图测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pushMock.mockClear()
    replaceMock.mockClear()
  })

  // ── 1: PAUSED 渲染 ─────────────────────────────────────────
  it('D-F02-04-01: PAUSED 状态正确渲染 — 显示已暂停、nextNodeId 与变量', async () => {
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_PAUSED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()
    await nextTick()

    expect(getDebugSession).toHaveBeenCalledWith(1)
    expect(listDebugNodes).toHaveBeenCalledWith(1)
    const text = wrapper.text()
    expect(text).toContain('已暂停')
    expect(text).toContain('llm_1')
    expect(text).toContain('hello debug')
    wrapper.unmount()
  })

  // ── 2: variables 与节点轨迹 ────────────────────────────────
  it('D-F02-04-02: 变量与节点轨迹 — variables 预览与 NodeTrajectory 接收映射后节点', async () => {
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_PAUSED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()

    // variables JSON 美化包含 input 键
    expect(wrapper.text()).toContain('input')
    // NodeTrajectory stub 存在且收到节点
    const trajStub = wrapper.find('.node-trajectory-stub')
    expect(trajStub.exists()).toBe(true)
    expect(trajStub.text()).toContain('start_1')
    wrapper.unmount()
  })

  // ── 3: 节点按 nodeSeq 排序并映射 ───────────────────────────
  it('D-F02-04-03: 节点轨迹 — nodes 按 nodeSeq 排序映射为 trajectoryNodes 传给 NodeTrajectory', async () => {
    const shuffled: AgentGraphDebugNode[] = [MOCK_COMPLETED_NODES[1], MOCK_COMPLETED_NODES[0]]
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_COMPLETED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(shuffled as any)

    const wrapper = await createWrapper('2')
    await flushPromises()
    await nextTick()

    const trajStub = wrapper.find('.node-trajectory-stub')
    const parsed = JSON.parse(trajStub.text()) as any[]
    expect(parsed[0].nodeSeq).toBe(1)
    expect(parsed[1].nodeSeq).toBe(2)
    wrapper.unmount()
  })

  // ── 4: 非 PAUSED 时按钮禁用 ───────────────────────────────
  it('D-F02-04-04: 非 PAUSED 时调试按钮禁用 — COMPLETED 状态下单步/继续/停止均 disabled', async () => {
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_COMPLETED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_COMPLETED_NODES)

    const wrapper = await createWrapper('2')
    await flushPromises()
    await nextTick()

    const buttons = wrapper.findAll('button')
    // 前三个按钮为 单步/继续/停止，均应 disabled
    const controlButtons = buttons.filter((b) =>
      ['单步', '继续', '停止'].some((t) => b.text().includes(t)),
    )
    expect(controlButtons.length).toBe(3)
    for (const btn of controlButtons) {
      expect(btn.attributes('disabled')).toBeDefined()
    }
    expect(wrapper.text()).toContain('仅 PAUSED 状态可操作')
    wrapper.unmount()
  })

  // ── 5: 单步调用 API 并带 version 重载 ──────────────────────
  it('D-F02-04-05: 单步 — 调用 stepDebugSession(sessionId, version) 并自动重载', async () => {
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_PAUSED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)

    const updated: AgentGraphDebugSession = {
      ...MOCK_PAUSED,
      version: 2,
      traceCount: 2,
      nextNodeId: 'end_1',
    }
    const updatedNodes: AgentGraphDebugNode[] = [
      ...MOCK_PAUSED_NODES,
      {
        id: 102,
        debugSessionId: 1,
        nodeSeq: 2,
        branchId: '0',
        nodeId: 'llm_1',
        nodeType: 'LLM',
        nodeLatencyMs: 80,
        variableSnapshot: JSON.stringify({
          input: 'hello debug',
          result: 'hello debug -> [llm_1 output]',
        }),
        inputTokens: 10,
        outputTokens: 20,
      },
    ]
    vi.mocked(stepDebugSession).mockResolvedValueOnce(updated)
    // reloadAfterAction 的两次并发拉取
    vi.mocked(getDebugSession).mockResolvedValueOnce(updated)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(updatedNodes)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()

    const stepBtn = wrapper.findAll('button').find((b) => b.text().includes('单步'))!
    expect(stepBtn).toBeDefined()
    await stepBtn.trigger('click')
    await flushPromises()
    await nextTick()
    await nextTick()

    expect(stepDebugSession).toHaveBeenCalledWith(1, 1)
    // 重载后 getDebugSession 被调用至少 2 次（初始 + reload）
    expect(vi.mocked(getDebugSession).mock.calls.length).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
  })

  // ── 6: 409 冲突提示 ──────────────────────────────────────
  it('D-F02-04-06: 409 版本冲突 — 展示"版本冲突"警告并自动刷新', async () => {
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_PAUSED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)

    const conflictErr = new ApiError(409, '并发冲突')
    vi.mocked(stepDebugSession).mockRejectedValueOnce(conflictErr)

    const refreshed: AgentGraphDebugSession = { ...MOCK_PAUSED, version: 5 }
    vi.mocked(getDebugSession).mockResolvedValueOnce(refreshed)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()

    const stepBtn = wrapper.findAll('button').find((b) => b.text().includes('单步'))!
    await stepBtn.trigger('click')
    await flushPromises()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('版本冲突')
    wrapper.unmount()
  })

  // ── 7: 刷新恢复 — 重新拉取服务端 ──────────────────────────
  it('D-F02-04-07: 刷新恢复 — 从服务端重拉，无 localStorage 依赖', async () => {
    const first: AgentGraphDebugSession = { ...MOCK_PAUSED, version: 1 }
    const second: AgentGraphDebugSession = { ...MOCK_PAUSED, version: 2, nextNodeId: 'end_1' }
    vi.mocked(getDebugSession).mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    vi.mocked(listDebugNodes)
      .mockResolvedValueOnce(MOCK_PAUSED_NODES)
      .mockResolvedValueOnce(MOCK_PAUSED_NODES)
    vi.mocked(stepDebugSession).mockResolvedValueOnce(second)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()

    // 触发单步以触发 reloadAfterAction（即刷新恢复路径）
    const stepBtn = wrapper.findAll('button').find((b) => b.text().includes('单步'))!
    await stepBtn.trigger('click')
    await flushPromises()
    await nextTick()

    expect(vi.mocked(getDebugSession).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(vi.mocked(listDebugNodes).mock.calls.length).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
  })

  // ── 8: 无 localStorage 使用 ───────────────────────────────
  it('D-F02-04-08: 无本地存储 — 挂载与交互过程不读写 localStorage/sessionStorage', async () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem')
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_PAUSED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()

    expect(getSpy).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()

    getSpy.mockRestore()
    setSpy.mockRestore()
    wrapper.unmount()
  })

  // ── 9: 断点切换 ───────────────────────────────────────────
  it('D-F02-04-09: 断点切换 — toggle 调用 updateDebugBreakpoints', async () => {
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_PAUSED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)
    const toggled: AgentGraphDebugSession = { ...MOCK_PAUSED, breakpoints: [], version: 2 }
    vi.mocked(updateDebugBreakpoints).mockResolvedValueOnce(toggled)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()
    await nextTick()

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)
    await checkboxes[0].trigger('change')
    await flushPromises()
    await nextTick()

    expect(updateDebugBreakpoints).toHaveBeenCalled()
    const calledArg = vi.mocked(updateDebugBreakpoints).mock.calls[0]
    expect(calledArg[0]).toBe(1)
    expect(Array.isArray(calledArg[1])).toBe(true)
    wrapper.unmount()
  })

  // ── 10: 无效 sessionId 错误 ───────────────────────────────
  it('D-F02-04-10: 无效 sessionId — 显示"无效的调试会话 ID"错误', async () => {
    const wrapper = await createWrapper('invalid')
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('无效的调试会话 ID')
    expect(getDebugSession).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // ── 11: 404 跳转 ──────────────────────────────────────────
  it('D-F02-04-11: 404 — 会话不存在时路由到 /404', async () => {
    vi.mocked(getDebugSession).mockRejectedValueOnce(new ApiError(404, '调试会话不存在'))
    vi.mocked(listDebugNodes).mockResolvedValueOnce([])

    const wrapper = await createWrapper('9999')
    await flushPromises()
    await nextTick()
    await nextTick()

    expect(replaceMock).toHaveBeenCalledWith('/404')
    wrapper.unmount()
  })

  // ── 12: 标准6 — 真实路由刷新重挂载（unmount + 换 traceCount + 重新 mount 拉新态） ──
  it('D-F02-04-12 [标准6]: 真实路由刷新重挂载 — unmount 后以不同 traceCount 重挂载，展示服务端新态', async () => {
    const first: AgentGraphDebugSession = { ...MOCK_PAUSED, traceCount: 1, nextNodeId: 'llm_1' }
    const second: AgentGraphDebugSession = { ...MOCK_PAUSED, traceCount: 3, nextNodeId: 'end_1' }

    vi.mocked(getDebugSession).mockResolvedValueOnce(first)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)
    const w1 = await createWrapper('1')
    await flushPromises()
    await nextTick()
    expect(w1.text()).toContain('trace 1')
    w1.unmount()

    // createWrapper 会 clearAllMocks，故第二段需以重置后调用计数判定新鲜拉取
    vi.mocked(getDebugSession).mockResolvedValueOnce(second)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)
    // 手动挂载避免再次 clearAllMocks 吞掉上面的 mockResolvedValueOnce
    Object.assign(routeParamsMock, { sessionId: '1' })
    const w2 = mount(DebugSessionView, {
      global: { plugins: [createPinia()], stubs: STUBS_DEBUG },
    })
    await flushPromises()
    await nextTick()
    expect(w2.text()).toContain('trace 3')
    // 刷新后第二段挂载触发一次新的服务端拉取（重置后计数 >=1 即为新鲜态）
    expect(vi.mocked(getDebugSession)).toHaveBeenCalledWith(1)
    expect(vi.mocked(getDebugSession).mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(vi.mocked(listDebugNodes)).toHaveBeenCalledWith(1)
    // 新态中 nextNodeId 已更新
    expect(w2.text()).toContain('end_1')
    w2.unmount()
  })

  // ── 13: 标准10 — 安全展示降级（超长变量文本 / 非 JSON 快照 / 错误含 HTML 标签） ──
  it('D-F02-04-13 [标准10]: 安全展示降级 — 超长变量/非JSON快照/错误含HTML标签均不崩溃且经 SafeHtml', async () => {
    const longVars = { input: 'x'.repeat(5000), blob: 'y'.repeat(5000) } as any
    const failedWithHtml: AgentGraphDebugSession = {
      id: 1,
      graphDefId: 1001,
      graphDefVersion: 1,
      status: 'FAILED',
      input: 'fail input',
      breakpoints: [],
      variables: longVars,
      traceCount: 2,
      nextNodeId: null,
      nextBranchId: null,
      resultText: null,
      errorCategory: 'LLM_TIMEOUT',
      errorMessage: '<script>alert(1)</script><b>oops</b><img onerror=alert(2) src=x>',
      latencyMs: 120,
      inputTokens: null,
      outputTokens: null,
      expiresAt: '2030-08-22 10:30:00',
      createTime: '2026-08-22 09:00:00',
      updateTime: '2026-08-22 09:00:05',
      version: 2,
    }
    const badSnapshotNodes: AgentGraphDebugNode[] = [
      {
        id: 101,
        debugSessionId: 1,
        nodeSeq: 1,
        branchId: '0',
        nodeId: 'start_1',
        nodeType: 'START',
        nodeLatencyMs: 5,
        variableSnapshot: 'not-json-{{{broken',
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
        variableSnapshot: 'x'.repeat(8000),
        inputTokens: null,
        outputTokens: null,
      },
    ]
    vi.mocked(getDebugSession).mockResolvedValueOnce(failedWithHtml)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(badSnapshotNodes)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()
    await nextTick()

    // 未崩溃，超长变量预览仍渲染（variablesPreview 回落原文，不抛异常）
    const text = wrapper.text()
    expect(text).toContain('LLM_TIMEOUT')
    // 错误经 SafeHtml 渲染：SafeHtml stub 存在即证明走安全组件而非 v-html
    const safeStub = wrapper.find('.safe-html')
    expect(safeStub.exists()).toBe(true)
    // 原始 script 标签文本经 SafeHtml 透传给 stub prop，不应作为真实 DOM script 执行（stub 仅文本渲染）
    expect(wrapper.html()).not.toContain('<script>')
    // 非 JSON 快照节点仍映射进轨迹，不崩溃
    const trajStub = wrapper.find('.node-trajectory-stub')
    expect(trajStub.exists()).toBe(true)
    expect(trajStub.text()).toContain('start_1')
    // 超长快照节点同样存在于轨迹
    expect(trajStub.text()).toContain('llm_1')
    wrapper.unmount()
  })

  // ── 14: 标准10 — 敏感信息未进入 URL ──────────────────────────────────
  it('D-F02-04-14 [标准10]: 敏感信息未进入 URL — variableSnapshot 内容不出现在 window.location', async () => {
    const secret = '__SECRET_variableSnapshot_9f3a7__'
    const sessionWithSecret: AgentGraphDebugSession = {
      ...MOCK_PAUSED,
      variables: { secret, input: secret } as any,
    }
    const nodesWithSecret: AgentGraphDebugNode[] = [
      {
        id: 101,
        debugSessionId: 1,
        nodeSeq: 1,
        branchId: '0',
        nodeId: 'start_1',
        nodeType: 'START',
        nodeLatencyMs: 5,
        variableSnapshot: JSON.stringify({ secret }),
        inputTokens: null,
        outputTokens: null,
      },
    ]
    vi.mocked(getDebugSession).mockResolvedValueOnce(sessionWithSecret)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(nodesWithSecret)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()

    expect(window.location.href).not.toContain(secret)
    expect(window.location.search).not.toContain(secret)
    expect(window.location.hash).not.toContain(secret)
    // 变量仍在页面内可见（证明数据已加载但未泄漏到 URL）
    expect(wrapper.text()).toContain(secret)
    wrapper.unmount()
  })

  // ── 15: 标准11 — 调试不在执行历史的错误混淆（不调用 pageGraphExecutions） ──
  it('D-F02-04-15 [标准11]: 调试不在执行历史的错误混淆 — 调试视图不调用 pageGraphExecutions/pageGraphExecutionsWithVersion', async () => {
    const { pageGraphExecutions, pageGraphExecutionsWithVersion } =
      await import('@/modules/agent/api')
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_PAUSED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_PAUSED_NODES)

    const wrapper = await createWrapper('1')
    await flushPromises()
    await nextTick()

    expect(pageGraphExecutions).not.toHaveBeenCalled()
    expect(pageGraphExecutionsWithVersion).not.toHaveBeenCalled()
    // 正向证据：调试视图仅调调试域 API
    expect(getDebugSession).toHaveBeenCalledWith(1)
    expect(listDebugNodes).toHaveBeenCalledWith(1)
    wrapper.unmount()
  })
})

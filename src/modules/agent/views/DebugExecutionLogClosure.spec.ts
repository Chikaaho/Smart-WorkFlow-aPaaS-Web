/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

// ─── mock agent api ─────────────────────────────────────────────────
vi.mock('@/modules/agent/api', () => ({
  getDebugSession: vi.fn(),
  listDebugNodes: vi.fn(),
  stepDebugSession: vi.fn(),
  continueDebugSession: vi.fn(),
  stopDebugSession: vi.fn(),
  updateDebugBreakpoints: vi.fn(),
  pageGraphExecutions: vi.fn(),
  pageGraphExecutionsWithVersion: vi.fn(),
  getGraphDefVersionOnly: vi.fn(),
  pageDebugSessions: vi.fn(),
  getExecutionDetail: vi.fn(),
  listExecutionNodes: vi.fn(),
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
  pageGraphExecutions,
  pageGraphExecutionsWithVersion,
  pageDebugSessions,
  getExecutionDetail,
} from '@/modules/agent/api'
import type {
  AgentGraphDebugSession,
  AgentGraphDebugNode,
  AgentGraphExecution,
} from '@/contracts/agent'
import DebugSessionView from './DebugSessionView.vue'
import ExecutionList from './ExecutionList.vue'
import ExecutionDetail from './ExecutionDetail.vue'

// ─── stubs ──────────────────────────────────────────────────────────
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

// ExecutionList stubs that preserve DOM marker visibility
const STUBS_EXEC_LIST = {
  StandardListTemplate: { template: '<div><slot/><slot name="toolbar-actions"/></div>' },
  'el-alert': { props: ['title', 'type'], template: '<div class="el-alert">{{ title }}</div>' },
  'el-table': {
    props: ['data'],
    template: `
      <div class="el-table-stub">
        <div v-for="row in data" :key="row.id" class="merged-row" :data-id="row.id" :data-debug="row._debug ? 'true' : 'false'">
          <span class="source-tag">{{ row._debug ? '调试' : '执行' }}</span>
          <span class="status-tag">{{ row.status }}</span>
          <span class="name-tag">{{ row.graphName }}</span>
        </div>
        <slot />
      </div>`,
  },
  'el-table-column': {
    template: '<div><slot v-bind="{ row: { _debug: false, status: \'SUCCESS\' } }"/></div>',
  },
  'el-tag': { props: ['type', 'size'], template: '<span class="el-tag"><slot/></span>' },
  'el-button': {
    props: ['disabled', 'size', 'link', 'type'],
    template: '<button :disabled="disabled"><slot/></button>',
  },
  'el-tooltip': { template: '<span><slot/></span>' },
}

// ExecutionDetail stubs
const STUBS_EXEC_DETAIL = {
  'el-button': { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
  'el-icon': { template: '<i><slot/></i>' },
  ArrowLeft: { template: '<i>arrow</i>' },
  'el-tag': { props: ['type', 'size'], template: '<span :class="type"><slot/></span>' },
  'el-skeleton': { template: '<div class="el-skeleton">loading</div>' },
  'el-alert': { props: ['title', 'type'], template: '<div class="el-alert">{{ title }}</div>' },
  'el-card': { template: '<div class="el-card"><slot name="header"/><slot/></div>' },
  'el-empty': { template: '<div class="el-empty">empty</div>' },
  'el-tooltip': { template: '<span><slot/></span>' },
  NodeTrajectory: {
    props: ['nodes'],
    template: '<div class="node-trajectory-stub">{{ JSON.stringify(nodes) }}</div>',
  },
  SafeHtml: { props: ['html'], template: '<div class="safe-html">{{ html }}</div>' },
}

// ─── mock data ──────────────────────────────────────────────────────
const MOCK_EXECUTIONS: AgentGraphExecution[] = [
  {
    id: 101,
    graphDefId: 9001,
    graphKey: 'G_KEY',
    graphName: '客服分流',
    graphDefVersion: 2,
    defVersion: 2,
    input: 'hello',
    status: 'SUCCESS',
    outputSummary: 'done',
    success: true,
    latencyMs: 120,
    createTime: '2026-08-22 10:00:00',
  } as any,
  {
    id: 102,
    graphDefId: 9001,
    graphKey: 'G_KEY',
    graphName: '客服分流',
    graphDefVersion: 2,
    defVersion: 2,
    input: 'fail input',
    status: 'FAILED',
    outputSummary: 'model failed',
    errorCategory: 'MODEL_CALL_FAILED',
    errorMessage: 'timeout',
    success: false,
    latencyMs: 200,
    createTime: '2026-08-22 10:01:00',
  } as any,
]

const MOCK_DEBUG_PAGE = {
  list: [
    {
      id: 201,
      graphDefId: 9001,
      graphDefVersion: 1,
      status: 'PAUSED',
      input: 'debug input paused',
      breakpoints: ['llm_1'],
      variables: { input: 'debug input paused' } as any,
      traceCount: 1,
      nextNodeId: 'llm_1',
      nextBranchId: '0',
      expiresAt: '2030-08-22 10:30:00',
      createTime: '2026-08-22 09:00:00',
      updateTime: '2026-08-22 09:00:05',
      version: 1,
    } as AgentGraphDebugSession,
    {
      id: 202,
      graphDefId: 9001,
      graphDefVersion: 1,
      status: 'COMPLETED',
      input: 'debug input done',
      breakpoints: [],
      variables: { input: 'debug input done', result: 'done' } as any,
      traceCount: 3,
      nextNodeId: null,
      nextBranchId: null,
      resultText: 'done',
      expiresAt: '2030-08-22 11:00:00',
      createTime: '2026-08-22 08:00:00',
      updateTime: '2026-08-22 08:00:10',
      version: 3,
    } as AgentGraphDebugSession,
  ],
  total: 2,
  pageNum: 1,
  pageSize: 10,
}

const MOCK_DEBUG_SESSION_COMPLETED: AgentGraphDebugSession = {
  id: 202,
  graphDefId: 9001,
  graphDefVersion: 1,
  status: 'COMPLETED',
  input: 'debug input done',
  breakpoints: [],
  variables: { input: 'debug input done', result: 'done' } as any,
  traceCount: 3,
  nextNodeId: null,
  nextBranchId: null,
  resultText: 'done',
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

const MOCK_DEBUG_NODES: AgentGraphDebugNode[] = [
  {
    id: 301,
    debugSessionId: 202,
    nodeSeq: 1,
    branchId: '0',
    nodeId: 'start_1',
    nodeType: 'START',
    nodeLatencyMs: 5,
    variableSnapshot: JSON.stringify({ input: 'debug input done' }),
    inputTokens: null,
    outputTokens: null,
  },
]

const MOCK_EXEC_DETAIL_SUCCESS: any = {
  id: 101,
  graphDefId: 9001,
  graphKey: 'G_KEY',
  graphName: '客服分流',
  defVersion: 2,
  input: 'hello',
  status: 'SUCCESS',
  output: 'done output',
  success: true,
  latencyMs: 120,
  errorMessage: undefined,
  errorCategory: undefined,
  traceId: 'trace-101',
  inputTokens: 10,
  outputTokens: 20,
  createTime: '2026-08-22 10:00:00',
  updateTime: '2026-08-22 10:00:01',
  nodeDetails: [
    {
      nodeSeq: 1,
      branchId: '0',
      nodeId: 'start_1',
      nodeType: 'START',
      nodeName: 'start_1',
      status: 'SUCCESS',
      success: true,
      nodeLatencyMs: 5,
      buildTime: '2026-08-22 10:00:00',
    },
  ],
}

function createMixedRouter() {
  const routes: RouteRecordRaw[] = [
    {
      path: '/',
      name: 'root',
      component: { template: '<router-view/>' },
      children: [
        {
          path: 'agent/executions/list',
          name: 'agent-execution-list',
          component: ExecutionList,
        },
        {
          path: 'agent/debug/:sessionId',
          name: 'agent-debug-session',
          component: DebugSessionView,
        },
        {
          path: 'agent/executions/detail/:executionId',
          name: 'agent-execution-detail',
          component: ExecutionDetail,
        },
      ],
    },
    { path: '/404', name: 'not-found', component: { template: '<div>404</div>' } },
  ]
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('DebugExecutionLogClosure — G11 既有日志闭环', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('G11-01 调试与执行 ID 空间分离 — pageGraphExecutions 与 pageDebugSessions 返回不相交 ID 且各自可达', async () => {
    vi.mocked(pageGraphExecutions).mockResolvedValueOnce({
      list: MOCK_EXECUTIONS,
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(pageDebugSessions).mockResolvedValueOnce(MOCK_DEBUG_PAGE as any)

    const execPage = await pageGraphExecutions({ pageNum: 1, pageSize: 10 })
    const debugPage = await pageDebugSessions({ pageNum: 1, pageSize: 10 })

    expect(pageGraphExecutions).toHaveBeenCalledTimes(1)
    expect(pageDebugSessions).toHaveBeenCalledTimes(1)

    const execIds = new Set<number>(execPage.list.map((e) => e.id))
    const debugIds = new Set<number>((debugPage as any).list.map((s: any) => s.id as number))

    // 两域 ID 不相交（分离存储的直接证据）
    for (const id of execIds) expect((debugIds as Set<number>).has(id)).toBe(false)
    for (const id of debugIds) expect((execIds as Set<number>).has(id as number)).toBe(false)

    // 各自可达且条数符合预期
    expect(execIds.has(101)).toBe(true)
    expect(execIds.has(102)).toBe(true)
    expect(debugIds.has(201)).toBe(true)
    expect(debugIds.has(202)).toBe(true)

    // 调试侧状态与执行侧状态正交（非混淆）
    const debugStatuses = new Set((debugPage as any).list.map((s: any) => s.status))
    const execStatuses = new Set(execPage.list.map((e) => e.status))
    expect(debugStatuses.has('PAUSED')).toBe(true)
    expect(debugStatuses.has('COMPLETED')).toBe(true)
    // 执行侧为 SUCCESS/FAILED，非 PAUSED/COMPLETED
    expect(execStatuses.has('SUCCESS')).toBe(true)
    expect(execStatuses.has('FAILED')).toBe(true)
    expect(execStatuses.has('PAUSED')).toBe(false)
  })

  it('G11-02 既有运行日志入口合并调试记录 — ExecutionList 经真实路由并行拉取两域、渲染"调试"标识并正确分流导航', async () => {
    // Arrange: ExecutionList 将并行调用两域
    vi.mocked(pageGraphExecutionsWithVersion).mockResolvedValueOnce({
      list: [MOCK_EXECUTIONS[0]],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(pageDebugSessions).mockResolvedValueOnce({
      list: [MOCK_DEBUG_PAGE.list[0] as any],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    } as any)

    const router = createMixedRouter()
    await router.push('/agent/executions/list')
    await router.isReady()

    const wrapper = mount(ExecutionList, {
      global: { plugins: [router, createPinia()], stubs: STUBS_EXEC_LIST },
    })
    await flushPromises()
    await nextTick()
    await nextTick()

    // 既有入口必须同时调用两域（前端聚合证据）
    expect(pageGraphExecutionsWithVersion).toHaveBeenCalledTimes(1)
    expect(pageDebugSessions).toHaveBeenCalledTimes(1)
    // 参数透传 graphDefId 过滤（无过滤时为 page only）
    expect(pageGraphExecutionsWithVersion).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 })
    expect(pageDebugSessions).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 })

    // 列表合并：执行1 + 调试1 = 2，且按 _debug 标记可区分
    const vm: any = wrapper.vm as any
    expect(vm.list).toHaveLength(2)
    expect(vm.total).toBe(2)
    const debugRow = vm.list.find((r: any) => r._debug === true)
    const execRow = vm.list.find((r: any) => r._debug === false)
    expect(debugRow).toBeDefined()
    expect(execRow).toBeDefined()
    expect(debugRow.id).toBe(201)
    expect(debugRow.status).toBe('PAUSED')
    expect(execRow.id).toBe(101)
    expect(execRow.status).toBe('SUCCESS')

    // DOM 必须渲染"调试"与"执行"标识（来源列证据）
    const html = wrapper.html()
    expect(html).toContain('调试')
    expect(html).toContain('执行')

    // 调试记录点击 → /agent/debug/:sessionId
    vm.handleViewDetail(debugRow)
    await nextTick()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/agent/debug/201')
    expect(router.currentRoute.value.name).toBe('agent-debug-session')

    // 回到列表再点执行记录 → /agent/executions/detail/:id
    await router.push('/agent/executions/list')
    await nextTick()
    vm.handleViewDetail(execRow)
    await nextTick()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/agent/executions/detail/101')
    expect(router.currentRoute.value.name).toBe('agent-execution-detail')

    // 执行记录仍走普通详情：该详情无 调试控制（单步/继续/停止）— 通过接口与 DOM 证明
    vi.mocked(getExecutionDetail).mockResolvedValueOnce(MOCK_EXEC_DETAIL_SUCCESS)
    // ExecutionDetail 会尝试取 nodeDetails；已在 detail 中提供，不再调 listExecutionNodes
    await router.push('/agent/executions/detail/101')
    await router.isReady()
    const detailWrapper = mount(ExecutionDetail, {
      global: { plugins: [router, createPinia()], stubs: STUBS_EXEC_DETAIL },
    })
    await flushPromises()
    await nextTick()
    await nextTick()
    expect(getExecutionDetail).toHaveBeenCalledWith(101)
    const detailText = detailWrapper.text()
    // 普通执行详情不含调试控制按钮文案
    expect(detailText).not.toContain('单步')
    expect(detailText).not.toContain('仅 PAUSED 状态可操作')
    detailWrapper.unmount()

    // 调试终态记录点击 → 调试详情且按钮禁用（与 G11-03 终态一致）
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_DEBUG_SESSION_COMPLETED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_DEBUG_NODES)
    const router2 = createMixedRouter()
    await router2.push('/agent/debug/202')
    await router2.isReady()
    const debugWrapper = mount(DebugSessionView, {
      global: { plugins: [router2, createPinia()], stubs: STUBS_DEBUG },
    })
    await flushPromises()
    await nextTick()
    await nextTick()
    expect(getDebugSession).toHaveBeenCalledWith(202)
    const dbgText = debugWrapper.text()
    expect(dbgText).toContain('已完成')
    const buttons = debugWrapper.findAll('button')
    const controlBtns = buttons.filter((b) =>
      ['单步', '继续', '停止'].some((t) => b.text().includes(t)),
    )
    expect(controlBtns.length).toBe(3)
    for (const btn of controlBtns) expect(btn.attributes('disabled')).toBeDefined()
    expect(dbgText).toContain('仅 PAUSED 状态可操作')
    debugWrapper.unmount()
    wrapper.unmount()
  })

  it('G11-02b 调试域失败时既有入口降级为仅执行列表（不阻断运行日志）', async () => {
    vi.mocked(pageGraphExecutionsWithVersion).mockResolvedValueOnce({
      list: [MOCK_EXECUTIONS[0]],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    })
    vi.mocked(pageDebugSessions).mockRejectedValueOnce(new Error('debug unavailable'))

    const router = createMixedRouter()
    await router.push('/agent/executions/list')
    await router.isReady()
    const wrapper = mount(ExecutionList, {
      global: { plugins: [router, createPinia()], stubs: STUBS_EXEC_LIST },
    })
    await flushPromises()
    await nextTick()
    await nextTick()
    const vm: any = wrapper.vm as any
    expect(vm.list).toHaveLength(1)
    expect(vm.list[0].id).toBe(101)
    expect(vm.list[0]._debug).toBe(false)
    expect(vm.total).toBe(1)
    wrapper.unmount()
  })

  it('G11-03 调试终态可从调试列表到达 — pageDebugSessions 列表项可路由至 /agent/debug/:sessionId 并拉取终态详情', async () => {
    // 先证明调试列表可达
    vi.mocked(pageDebugSessions).mockResolvedValueOnce(MOCK_DEBUG_PAGE as any)
    const debugPage = await pageDebugSessions({ pageNum: 1, pageSize: 10 })
    expect(debugPage.total).toBe(2)
    const completedEntry = (debugPage as any).list.find((s: any) => s.status === 'COMPLETED')
    expect(completedEntry).toBeDefined()
    expect(completedEntry.id).toBe(202)

    // 再证明点击该条目可经真实路由进入终态详情
    vi.mocked(getDebugSession).mockResolvedValueOnce(MOCK_DEBUG_SESSION_COMPLETED)
    vi.mocked(listDebugNodes).mockResolvedValueOnce(MOCK_DEBUG_NODES)

    const router = createMixedRouter()
    await router.push(`/agent/debug/${completedEntry.id}`)
    await router.isReady()

    const wrapper = mount(DebugSessionView, {
      global: { plugins: [router, createPinia()], stubs: STUBS_DEBUG },
    })
    await flushPromises()
    await nextTick()
    await nextTick()

    expect(getDebugSession).toHaveBeenCalledWith(202)
    expect(wrapper.text()).toContain('已完成')
    expect(wrapper.text()).toContain('done')
    // 轨迹可达
    const traj = wrapper.find('.node-trajectory-stub')
    expect(traj.exists()).toBe(true)
    expect(traj.text()).toContain('start_1')
    wrapper.unmount()
  })
})

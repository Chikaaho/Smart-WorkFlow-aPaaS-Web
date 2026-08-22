import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRouter,
  createMemoryHistory,
  type RouteLocationNormalized,
  type Router,
} from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/foundation/auth/token', () => ({ getAccessToken: vi.fn() }))
vi.mock('@/foundation/auth', () => ({ refresh: vi.fn(), logout: vi.fn() }))
vi.mock('@/foundation/session', () => ({ loadSession: vi.fn() }))
vi.mock('@/foundation/menu', () => ({
  loadMenu: vi.fn(),
  buildRoutesFromMenu: vi.fn(),
  findFirstLeafPath: vi.fn(),
}))
// D169 标准6：真实导航挂载详情组件所需 API mock
vi.mock('@/modules/agent/api', () => ({
  getExecutionDetail: vi.fn(),
  listExecutionNodes: vi.fn(),
  listConversationMessages: vi.fn(),
}))

import { getAccessToken } from '@/foundation/auth/token'
import { refresh, logout } from '@/foundation/auth'
import { loadSession } from '@/foundation/session'
import { loadMenu, buildRoutesFromMenu } from '@/foundation/menu'
import { authGuard, clearDynamicRoutes, ROOT_LAYOUT_NAME } from './guard'
import {
  getExecutionDetail,
  listExecutionNodes,
  listConversationMessages,
} from '@/modules/agent/api'
import type { AgentGraphExecutionDetail, AgentConversationMessage } from '@/contracts/agent'
import ExecutionDetail from '@/modules/agent/views/ExecutionDetail.vue'
import ConversationDetail from '@/modules/agent/views/ConversationDetail.vue'

const Placeholder = { template: '<div>placeholder</div>' }

const EXECUTION_ROUTES = [
  {
    path: 'agent/executions/list',
    name: 'agent-execution-list',
    component: Placeholder,
    meta: { title: '执行历史' },
  },
  {
    path: 'agent/executions/detail/:executionId',
    name: 'agent-execution-detail',
    component: Placeholder,
    meta: { title: '执行详情', authority: ['agent:model:view'] },
  },
]

const placeholderSession = {
  user: { id: 'unknown', username: 'tester', displayName: 'tester', deptId: null, tenantId: null },
  permissions: new Set<string>(),
  roles: new Set<string>(),
  superAdmin: false,
}

function toRoute(partial: Partial<RouteLocationNormalized>): RouteLocationNormalized {
  return { meta: {}, fullPath: '/', path: '/', ...partial } as RouteLocationNormalized
}

describe('execution-detail route resolution', () => {
  let router: Router

  beforeEach(() => {
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          name: ROOT_LAYOUT_NAME,
          component: Placeholder,
          children: EXECUTION_ROUTES,
        },
      ],
    })
  })

  it('resolve 详情 URL 正确解析 :executionId 参数', () => {
    const route = router.resolve('/agent/executions/detail/exec-123')
    expect(route.name).toBe('agent-execution-detail')
    expect(route.params.executionId).toBe('exec-123')
  })

  it('从详情 URL 构造携带 graphDefId query 的返回列表', () => {
    const route = router.resolve({
      name: 'agent-execution-list',
      query: { graphDefId: 'gd-456' },
    })
    expect(route.name).toBe('agent-execution-list')
    expect(route.fullPath).toContain('graphDefId=gd-456')
  })
})

describe('authGuard navigation behavior on execution routes', () => {
  let router: Router

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getAccessToken).mockReset()
    vi.mocked(refresh).mockReset()
    vi.mocked(logout).mockReset().mockResolvedValue(undefined)
    vi.mocked(loadSession).mockReset()
    vi.mocked(loadMenu).mockReset()
    vi.mocked(buildRoutesFromMenu).mockReset()
    router = {
      addRoute: vi.fn(),
      removeRoute: vi.fn(),
      hasRoute: vi.fn(() => true),
    } as unknown as Router
    clearDynamicRoutes(router)
    vi.mocked(router.addRoute).mockClear()

    // Default mocks: loadSession/loadMenu succeed, buildRoutesFromMenu returns a stub child route
    vi.mocked(loadSession).mockResolvedValue(placeholderSession)
    vi.mocked(loadMenu).mockResolvedValue([])
    vi.mocked(buildRoutesFromMenu).mockReturnValue([
      { path: 'agent/executions/list', name: 'agent-execution-list', component: Placeholder },
    ])
  })

  it('无 token + refresh 失败 → 重定向 /login 并携带 redirect 参数', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(refresh).mockRejectedValue(new Error('NOT_IMPLEMENTED'))

    const next = vi.fn()
    const to = toRoute({ fullPath: '/agent/executions/detail/exec-123' })
    await authGuard(router, to, toRoute({}), next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/agent/executions/detail/exec-123' },
    })
  })

  it('有 token + 动态路由已构建 → next() 正常通过', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token-123')

    // First pass on the mock router triggers buildDynamicRoutes, setting
    // dynamicRoutesBuilt = true.
    const buildTo = toRoute({ fullPath: '/agent/executions/list', path: '/agent/executions/list' })
    await authGuard(router, buildTo, toRoute({}), vi.fn())
    vi.mocked(router.addRoute).mockClear()

    // Second pass: use a real router to resolve the detail URL so authGuard sees
    // path !== '/' and calls plain next() instead of the root-redirect branch.
    const realRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: ROOT_LAYOUT_NAME, component: Placeholder, children: EXECUTION_ROUTES },
      ],
    })
    const detailRoute = realRouter.resolve('/agent/executions/detail/exec-123')
    const next = vi.fn()
    await authGuard(
      router,
      toRoute(detailRoute as Partial<RouteLocationNormalized>),
      toRoute({}),
      next,
    )

    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()
    expect(router.addRoute).not.toHaveBeenCalled()
  })

  it('session 构建失败 → logout + 重定向 /login', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token-123')
    vi.mocked(loadSession).mockRejectedValue(new Error('session boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const next = vi.fn()
    const to = toRoute({ fullPath: '/agent/executions/detail/exec-123' })
    await authGuard(router, to, toRoute({}), next)

    expect(logout).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/agent/executions/detail/exec-123' },
    })
    errorSpy.mockRestore()
  })

  it('刷新直达会话详情（D164 标准6 补证：无 token + refresh 失败 → 会话详情直达同样守卫到 /login）', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(refresh).mockRejectedValue(new Error('NOT_IMPLEMENTED'))

    const next = vi.fn()
    const to = toRoute({ fullPath: '/agent/conversations/detail/1' })
    await authGuard(router, to, toRoute({}), next)

    expect(next).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/agent/conversations/detail/1' },
    })
  })

  it('刷新直达执行详情（D164 标准6 补证：无 token 直达执行详情同样守卫到 /login）', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(refresh).mockRejectedValue(new Error('NOT_IMPLEMENTED'))

    const next = vi.fn()
    const to = toRoute({ fullPath: '/agent/executions/detail/99' })
    await authGuard(router, to, toRoute({}), next)

    expect(next).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/agent/executions/detail/99' },
    })
  })

  // D167 标准6 正向直达：有权身份直达详情页 → 首次 next(replace:true) 重放后，次访 next() 直接通过即实际到达
  it('D167-6a: 有权直达会话详情 - 有 token，路由可解析且首访重放后次访到达 ConversationDetail', async () => {
    vi.mocked(getAccessToken).mockReturnValue('valid-token')
    const realRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          name: ROOT_LAYOUT_NAME,
          component: Placeholder,
          children: [
            {
              path: 'agent/conversations/detail/:sessionId',
              name: 'agent-conversation-detail',
              component: Placeholder,
            },
            {
              path: 'agent/conversations/list',
              name: 'agent-conversation-list',
              component: Placeholder,
            },
          ],
        },
      ],
    })
    const resolved = realRouter.resolve('/agent/conversations/detail/42')
    expect(resolved.name).toBe('agent-conversation-detail')
    expect(resolved.params.sessionId).toBe('42')
    const nextFirst = vi.fn()
    await authGuard(
      router,
      toRoute({
        fullPath: '/agent/conversations/detail/42',
        path: '/agent/conversations/detail/42',
      }),
      toRoute({}),
      nextFirst,
    )
    expect(nextFirst).toHaveBeenCalledWith(expect.objectContaining({ replace: true }))
    const nextSecond = vi.fn()
    await authGuard(
      router,
      toRoute({
        fullPath: '/agent/conversations/detail/42',
        path: '/agent/conversations/detail/42',
      }),
      toRoute({}),
      nextSecond,
    )
    expect(nextSecond).toHaveBeenCalledWith()
  })

  it('D167-6b: 有权直达执行详情 - 有 token，路由可解析且构建后次访到达 ExecutionDetail', async () => {
    vi.mocked(getAccessToken).mockReturnValue('valid-token')
    const realRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          name: ROOT_LAYOUT_NAME,
          component: Placeholder,
          children: [
            {
              path: 'agent/executions/detail/:executionId',
              name: 'agent-execution-detail',
              component: Placeholder,
            },
          ],
        },
      ],
    })
    const resolved = realRouter.resolve('/agent/executions/detail/99')
    expect(resolved.name).toBe('agent-execution-detail')
    expect(resolved.params.executionId).toBe('99')
    // 本用例 beforeEach 已重置为未构建 → 首访触发构建重放
    const nextFirst = vi.fn()
    await authGuard(
      router,
      toRoute({ fullPath: '/agent/executions/detail/99', path: '/agent/executions/detail/99' }),
      toRoute({}),
      nextFirst,
    )
    expect(nextFirst).toHaveBeenCalledWith(expect.objectContaining({ replace: true }))
    // 次访：已构建 → 实际到达执行详情页
    const next = vi.fn()
    await authGuard(
      router,
      toRoute({ fullPath: '/agent/executions/detail/99', path: '/agent/executions/detail/99' }),
      toRoute({}),
      next,
    )
    expect(next).toHaveBeenCalledWith()
  })

  it('D167-6c: 有权刷新后直达 - 刷新后有 token 仍能解析并到达会话详情', async () => {
    vi.mocked(getAccessToken).mockReturnValue('valid-token')
    const realRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          name: ROOT_LAYOUT_NAME,
          component: Placeholder,
          children: [
            {
              path: 'agent/conversations/detail/:sessionId',
              name: 'agent-conversation-detail',
              component: Placeholder,
            },
          ],
        },
      ],
    })
    const resolved = realRouter.resolve('/agent/conversations/detail/100')
    expect(resolved.name).toBe('agent-conversation-detail')
    const nextFirst = vi.fn()
    await authGuard(
      router,
      toRoute({
        fullPath: '/agent/conversations/detail/100',
        path: '/agent/conversations/detail/100',
      }),
      toRoute({}),
      nextFirst,
    )
    expect(nextFirst).toHaveBeenCalledWith(expect.objectContaining({ replace: true }))
    const next = vi.fn()
    await authGuard(
      router,
      toRoute({
        fullPath: '/agent/conversations/detail/100',
        path: '/agent/conversations/detail/100',
      }),
      toRoute({}),
      next,
    )
    expect(next).toHaveBeenCalledWith()
  })
})

// ──────────────────────────────────────────────────────────────
// D169 标准6：真实 router 导航生命周期 → 目标详情组件实际挂载
// 不再用 resolve + 手工 authGuard + next() 代替；通过真实 push 走完
// beforeEach 守卫 → 动态路由构建 → 重放 → 组件挂载 → 数据请求全链路。
// ──────────────────────────────────────────────────────────────
describe('D169 标准6：真实 router 导航到页（有权直达/刷新，组件挂载证据）', () => {
  // 根布局用最小 router-view 容器，避免 BasicLayout 真实依赖
  const RootLayout = { template: '<router-view/>' }
  let pinia: ReturnType<typeof createPinia>

  const DETAIL_STUBS = {
    'el-button': { template: '<button><slot/></button>' },
    'el-icon': { template: '<i><slot/></i>' },
    'el-tag': { template: '<span><slot/></span>' },
    'el-skeleton': { template: '<div class="el-skeleton"><slot/></div>' },
    'el-alert': { template: '<div class="el-alert"><slot/></div>' },
    'el-card': { template: '<div class="el-card"><slot name="header"/><slot/></div>' },
    'el-empty': { template: '<div class="el-empty"><slot/></div>' },
    'el-tooltip': { template: '<span><slot/></span>' },
    ArrowLeft: true,
    NodeTrajectory: { template: '<div class="node-trajectory-stub"/>' },
    SafeHtml: { template: '<div class="safe-html-stub"/>' },
  }

  const MOCK_EXECUTION_DETAIL: AgentGraphExecutionDetail = {
    id: 99,
    graphDefId: 7,
    graphKey: 'CUSTOMER_ROUTING_1',
    graphName: '客服分流',
    defVersion: 2,
    input: JSON.stringify({ query: '你好' }),
    output: JSON.stringify({ response: '您好！' }),
    status: 'SUCCESS',
    success: true,
    latencyMs: 1500,
    traceId: 'trace_abc123',
    createTime: '2026-08-22 09:00:00',
    updateTime: '2026-08-22 09:00:01',
    nodeDetails: [],
    inputTokens: 150,
    outputTokens: 200,
  }

  function mockMessage(partial: Partial<AgentConversationMessage>): AgentConversationMessage {
    return {
      id: 1,
      role: 'ASSISTANT',
      content: '回复内容',
      msgOrder: 0,
      inputTokens: 10,
      outputTokens: 20,
      createTime: '2026-08-22 09:00:00',
      ...partial,
    }
  }

  function createAppRouter(): Router {
    const r = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          name: ROOT_LAYOUT_NAME,
          component: RootLayout,
          children: [
            {
              path: 'agent/executions/detail/:executionId',
              name: 'agent-execution-detail',
              component: ExecutionDetail,
              meta: { title: '执行详情', authority: ['agent:model:view'] },
            },
            {
              path: 'agent/conversations/detail/:sessionId',
              name: 'agent-conversation-detail',
              component: ConversationDetail,
              meta: { title: '会话消息', authority: ['agent:model:view'] },
            },
          ],
        },
      ],
    })
    r.beforeEach((to, from, next) => authGuard(r, to, from, next))
    return r
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(getAccessToken).mockReset()
    vi.mocked(refresh).mockReset()
    vi.mocked(logout).mockReset().mockResolvedValue(undefined)
    // 有权身份：session 权限含 agent:model:view（meta.authority 对应）
    vi.mocked(loadSession)
      .mockReset()
      .mockResolvedValue({
        ...placeholderSession,
        permissions: new Set(['agent:model:view']),
      })
    vi.mocked(loadMenu).mockReset().mockResolvedValue([])
    vi.mocked(buildRoutesFromMenu)
      .mockReset()
      .mockReturnValue([
        { path: 'agent/executions/list', name: 'agent-execution-list', component: Placeholder },
        {
          path: 'agent/conversations/list',
          name: 'agent-conversation-list',
          component: Placeholder,
        },
      ])
    vi.mocked(getExecutionDetail).mockReset()
    vi.mocked(listExecutionNodes).mockReset()
    vi.mocked(listConversationMessages).mockReset()
  })

  it('D169-6a: 有权直达执行详情 → 真实导航挂载 ExecutionDetail 并渲染 Token 统计', async () => {
    // 身份/前置：有 token + 权限 agent:model:view；输入 URL：/agent/executions/detail/99
    vi.mocked(getAccessToken).mockReturnValue('valid-token')
    vi.mocked(getExecutionDetail).mockResolvedValue(MOCK_EXECUTION_DETAIL)

    const router = createAppRouter()
    const app = mount(RootLayout, { global: { plugins: [pinia, router], stubs: DETAIL_STUBS } })
    // 导航动作：真实 router.push 走 authGuard（首访构建 → next(replace) 重放 → 次访 next()）
    await router.push('/agent/executions/detail/99')
    await flushPromises()
    await flushPromises()

    // 到页结果：详情数据请求 + 页面容器 + 稳定 DOM 标识 + Token 统计挂载
    expect(getExecutionDetail).toHaveBeenCalledWith(99)
    expect(app.find('.execution-detail-page').exists()).toBe(true)
    expect(app.find('.graph-name').text()).toContain('客服分流')
    expect(app.find('.execution-id').text()).toContain('#99')
    const tokenSection = app.find('.token-section')
    expect(tokenSection.exists()).toBe(true)
    expect(tokenSection.text()).toContain('Token 使用统计')
    expect(tokenSection.text()).toContain('350')
    app.unmount()
  })

  it('D169-6b: 有权直达会话详情 → 真实导航挂载 ConversationDetail 并渲染会话 Token 汇总', async () => {
    // 身份/前置：有 token + 权限 agent:model:view；输入 URL：/agent/conversations/detail/42
    vi.mocked(getAccessToken).mockReturnValue('valid-token')
    vi.mocked(listConversationMessages).mockResolvedValue([
      mockMessage({ id: 1, role: 'USER', content: '你好', msgOrder: 0 }),
      mockMessage({ id: 2, role: 'ASSISTANT', content: '您好！', msgOrder: 1 }),
    ])

    const router = createAppRouter()
    const app = mount(RootLayout, { global: { plugins: [pinia, router], stubs: DETAIL_STUBS } })
    await router.push('/agent/conversations/detail/42')
    await flushPromises()
    await flushPromises()

    // 到页结果：消息数据请求 + 页面容器 + 稳定 DOM 标识 + Token 汇总卡挂载
    expect(listConversationMessages).toHaveBeenCalledWith(42)
    expect(app.find('.conversation-detail-page').exists()).toBe(true)
    expect(app.find('.session-id').text()).toContain('#42')
    expect(app.find('.page-title').text()).toContain('会话消息')
    const tokenCard = app.find('.token-summary-card')
    expect(tokenCard.exists()).toBe(true)
    expect(tokenCard.text()).toContain('Token 使用统计')
    app.unmount()
  })

  it('D169-6c: 有权身份刷新直达（全新 router 冷启动）→ 真实导航仍到达会话详情页', async () => {
    // 身份/前置：刷新后仍有 token（内存访问令牌）+ 权限；输入 URL：/agent/conversations/detail/42
    vi.mocked(getAccessToken).mockReturnValue('valid-token')
    vi.mocked(listConversationMessages).mockResolvedValue([
      mockMessage({
        id: 1,
        role: 'ASSISTANT',
        content: '回复',
        msgOrder: 0,
        inputTokens: 10,
        outputTokens: 20,
      }),
    ])

    // 刷新 = 全新页面加载：新建 router 实例直接 push 目标 URL（模拟 F5 后首次导航）
    const router = createAppRouter()
    const app = mount(RootLayout, { global: { plugins: [pinia, router], stubs: DETAIL_STUBS } })
    await router.push('/agent/conversations/detail/42')
    await flushPromises()
    await flushPromises()

    expect(listConversationMessages).toHaveBeenCalledWith(42)
    expect(app.find('.conversation-detail-page').exists()).toBe(true)
    expect(app.find('.session-id').text()).toContain('#42')
    expect(app.find('.message-item').exists()).toBe(true)
    expect(app.find('.token-summary-card').exists()).toBe(true)
    app.unmount()
  })
})

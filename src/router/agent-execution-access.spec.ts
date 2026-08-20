import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRouter,
  createMemoryHistory,
  type RouteLocationNormalized,
  type Router,
} from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/foundation/auth/token', () => ({ getAccessToken: vi.fn() }))
vi.mock('@/foundation/auth', () => ({ refresh: vi.fn(), logout: vi.fn() }))
vi.mock('@/foundation/session', () => ({ loadSession: vi.fn() }))
vi.mock('@/foundation/menu', () => ({
  loadMenu: vi.fn(),
  buildRoutesFromMenu: vi.fn(),
  findFirstLeafPath: vi.fn(),
}))

import { getAccessToken } from '@/foundation/auth/token'
import { refresh, logout } from '@/foundation/auth'
import { loadSession } from '@/foundation/session'
import { loadMenu, buildRoutesFromMenu } from '@/foundation/menu'
import { authGuard, clearDynamicRoutes, ROOT_LAYOUT_NAME } from './guard'

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
})

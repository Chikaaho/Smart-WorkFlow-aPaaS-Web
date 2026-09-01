import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Router, RouteLocationNormalized } from 'vue-router'

vi.mock('@/foundation/auth/token', () => ({ getAccessToken: vi.fn(), clearToken: vi.fn() }))
vi.mock('@/foundation/auth', () => ({ refresh: vi.fn(), logout: vi.fn() }))
vi.mock('@/foundation/session', () => ({ loadSession: vi.fn() }))
vi.mock('@/foundation/menu', () => ({ loadMenu: vi.fn(), buildRoutesFromMenu: vi.fn() }))

import { getAccessToken } from '@/foundation/auth/token'
import { refresh, logout } from '@/foundation/auth'
import { loadSession } from '@/foundation/session'
import { loadMenu, buildRoutesFromMenu } from '@/foundation/menu'
import { useMenuStore } from '@/stores/menu'
import { authGuard, clearDynamicRoutes, ROOT_LAYOUT_NAME } from './guard'

function createMockRouter(): Router {
  return {
    addRoute: vi.fn(),
    removeRoute: vi.fn(),
    hasRoute: vi.fn(() => true),
  } as unknown as Router
}

function toRoute(partial: Partial<RouteLocationNormalized>): RouteLocationNormalized {
  return { meta: {}, fullPath: '/', path: '/', ...partial } as RouteLocationNormalized
}

const placeholderSession = {
  user: { id: 'unknown', username: 'tester', displayName: 'tester', deptId: null, tenantId: null },
  permissions: new Set<string>(),
  roles: new Set<string>(),
  superAdmin: false,
}

describe('router/guard authGuard', () => {
  let router: Router

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getAccessToken).mockReset()
    vi.mocked(refresh).mockReset()
    vi.mocked(logout).mockReset().mockResolvedValue(undefined)
    vi.mocked(loadSession).mockReset()
    vi.mocked(loadMenu).mockReset()
    vi.mocked(buildRoutesFromMenu).mockReset()
    router = createMockRouter()
    // 重置 guard 模块内的 dynamicRoutesBuilt/addedRouteNames 状态，隔离每个测试。
    clearDynamicRoutes(router)
    vi.mocked(router.addRoute).mockClear()
  })

  it('public route bypasses auth entirely, calling next() exactly once', async () => {
    const next = vi.fn()
    await authGuard(
      router,
      toRoute({ meta: { public: true }, fullPath: '/login' }),
      toRoute({}),
      next,
    )
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()
    expect(getAccessToken).not.toHaveBeenCalled()
  })

  it('no token + refresh seam rejects -> redirects to /login exactly once (no loop)', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(refresh).mockRejectedValue(new Error('NOT_IMPLEMENTED'))
    const next = vi.fn()
    await authGuard(router, toRoute({ fullPath: '/system' }), toRoute({}), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/system' } })
  })

  it('no token + refresh succeeds (cold start with rt cookie) -> builds routes and enters', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(refresh).mockResolvedValue(undefined)
    vi.mocked(loadSession).mockResolvedValue(placeholderSession)
    vi.mocked(loadMenu).mockResolvedValue([])
    vi.mocked(buildRoutesFromMenu).mockReturnValue([
      { path: 'system', name: 'system', component: () => Promise.resolve({ default: {} }) },
    ])

    const next = vi.fn()
    const to = toRoute({ fullPath: '/system', path: '/system' })
    await authGuard(router, to, toRoute({}), next)

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(loadSession).toHaveBeenCalledTimes(1)
    expect(loadMenu).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith({ ...to, replace: true })
  })

  it('token present + routes not built: assembles session/menu, adds routes, registers 404 last, re-enters via replace', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token-123')
    vi.mocked(loadSession).mockResolvedValue(placeholderSession)
    vi.mocked(loadMenu).mockResolvedValue([])
    vi.mocked(buildRoutesFromMenu).mockReturnValue([
      { path: 'system', name: 'system', component: () => Promise.resolve({ default: {} }) },
    ])

    const next = vi.fn()
    const to = toRoute({ fullPath: '/system', path: '/system' })
    await authGuard(router, to, toRoute({}), next)

    const addRouteCalls = vi.mocked(router.addRoute).mock.calls
    expect(addRouteCalls[0]).toEqual([
      ROOT_LAYOUT_NAME,
      expect.objectContaining({ path: 'system' }),
    ])
    expect(addRouteCalls[1][0]).toMatchObject({ path: '/:pathMatch(.*)*' })
    expect(next).toHaveBeenCalledWith({ ...to, replace: true })
  })

  it('second pass after routes built: plain next(), no rebuild', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token-123')
    vi.mocked(loadSession).mockResolvedValue(placeholderSession)
    vi.mocked(loadMenu).mockResolvedValue([])
    vi.mocked(buildRoutesFromMenu).mockReturnValue([
      { path: 'system', name: 'system', component: () => Promise.resolve({ default: {} }) },
    ])

    const to = toRoute({ fullPath: '/system', path: '/system' })
    await authGuard(router, to, toRoute({}), vi.fn())
    vi.mocked(router.addRoute).mockClear()

    const next = vi.fn()
    await authGuard(router, to, toRoute({}), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()
    expect(router.addRoute).not.toHaveBeenCalled()
  })

  it('feeds the same loadMenu() payload into the menu store (single source for sidebar)', async () => {
    const menuPayload = [
      {
        id: '1',
        parentId: null,
        name: 'system',
        title: '系统管理',
        path: 'system',
        component: 'system/views/SystemHome',
        sort: 1,
        menuType: 1 as const,
      },
    ]
    vi.mocked(getAccessToken).mockReturnValue('token-123')
    vi.mocked(loadSession).mockResolvedValue(placeholderSession)
    vi.mocked(loadMenu).mockResolvedValue(menuPayload)
    vi.mocked(buildRoutesFromMenu).mockReturnValue([])

    await authGuard(router, toRoute({ fullPath: '/system', path: '/system' }), toRoute({}), vi.fn())

    expect(useMenuStore().menu).toEqual(menuPayload)
    // 撤销动态路由时同步清空菜单源，避免登出后侧边栏残留旧菜单。
    clearDynamicRoutes(router)
    expect(useMenuStore().menu).toEqual([])
  })

  it('session assembly failure -> logout + redirect to login (decision doc §5)', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token-123')
    vi.mocked(loadSession).mockRejectedValue(new Error('boom'))
    vi.mocked(loadMenu).mockResolvedValue([])
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const next = vi.fn()
    await authGuard(router, toRoute({ fullPath: '/system' }), toRoute({}), next)

    expect(logout).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/system' } })
    errorSpy.mockRestore()
  })
})

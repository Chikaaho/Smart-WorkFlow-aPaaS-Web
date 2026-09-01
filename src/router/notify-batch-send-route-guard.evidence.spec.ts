import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { authGuard, clearDynamicRoutes, ROOT_LAYOUT_NAME } from './guard'
import { getAccessToken } from '@/foundation/auth/token'
import { refresh } from '@/foundation/auth'
import { useUserStore } from '@/stores/user'
import type { MenuNode } from '@/contracts/menu'
import NotifyBatchSend from '@/modules/notify/views/NotifyBatchSend.vue'

const { loadMenuMock, loadSessionMock } = vi.hoisted(() => ({
  loadMenuMock: vi.fn(),
  loadSessionMock: vi.fn(),
}))

vi.mock('@/foundation/auth/token', () => ({ getAccessToken: vi.fn(), clearToken: vi.fn() }))
vi.mock('@/foundation/auth', () => ({ refresh: vi.fn(), logout: vi.fn() }))
vi.mock('@/foundation/session', () => ({
  loadSession: loadSessionMock,
}))
vi.mock('@/foundation/menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/foundation/menu')>()
  return { ...actual, loadMenu: loadMenuMock }
})
vi.mock('@/modules/notify/api', () => ({
  batchSendNotify: vi.fn(),
  resolveCountNotify: vi.fn().mockResolvedValue({ recipientCount: 0 }),
  pageNotifyTemplates: vi.fn().mockResolvedValue({ list: [], total: 0 }),
}))

const Stub = { template: '<div class="route-stub" />' }
const RootLayout = { template: '<div class="root-host"><router-view /></div>' }

function notifyMenu(withBatch: boolean): MenuNode[] {
  return [
    {
      id: '4',
      parentId: null,
      name: 'notify',
      title: '通知',
      path: 'notify',
      component: null,
      sort: 4,
      menuType: 0,
      children: withBatch
        ? [
            {
              id: '43',
              parentId: '4',
              name: 'NotifyBatchSend',
              title: '发送通知',
              path: 'batch-send',
              component: 'notify/views/NotifyBatchSend',
              sort: 30,
              menuType: 1,
              permission: 'notify:batch:send',
            },
          ]
        : [
            {
              id: '41',
              parentId: '4',
              name: 'NotifyInbox',
              title: '收件箱',
              path: 'inbox',
              component: 'notify/views/NotifyHome',
              sort: 10,
              menuType: 1,
              permission: 'notify:view',
            },
          ],
    },
  ]
}

function buildRouter(): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: ROOT_LAYOUT_NAME,
        component: RootLayout,
        children: [
          {
            path: 'notify/batch-send',
            name: 'notify-batch-send',
            component: NotifyBatchSend,
            meta: { authority: ['notify:batch:send'] },
          },
          { path: '403', name: 'forbidden', component: Stub, meta: { public: true } },
          { path: 'login', name: 'login', component: Stub, meta: { public: true } },
        ],
      },
    ],
  })
  router.beforeEach((to, from, next) => authGuard(router, to, from, next))
  return router
}

describe('S3：notify:batch:send 真实 router/authGuard 导航证据', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    loadSessionMock.mockResolvedValue({
      user: { id: '2', username: 'user', displayName: '普通用户', deptId: '1', tenantId: '1' },
      permissions: new Set<string>(),
      roles: new Set<string>(['user']),
      superAdmin: false,
    })
    vi.mocked(getAccessToken).mockReturnValue('valid-token')
    vi.mocked(refresh).mockReset()
    const resetRouter = buildRouter()
    clearDynamicRoutes(resetRouter)
  })

  it('仅收件箱/模板权限的普通用户直达发送路由被拒绝；授权后同一路由实际挂载页面', async () => {
    loadMenuMock.mockResolvedValueOnce(notifyMenu(false)).mockResolvedValueOnce(notifyMenu(true))

    const deniedRouter = buildRouter()
    const deniedWrapper = mount(RootLayout, { global: { plugins: [deniedRouter] } })
    await deniedRouter.push('/notify/batch-send')
    await deniedRouter.isReady()
    await flushPromises()
    const denied = {
      identity: 'ordinary-inbox-or-template-user',
      permissions: [],
      entry: '/notify/batch-send',
      route: deniedRouter.currentRoute.value.path,
      expected: '/403',
      mounted: deniedWrapper.findComponent(NotifyBatchSend).exists(),
    }
    expect(denied.route).toBe('/403')
    expect(denied.mounted).toBe(false)
    deniedWrapper.unmount()

    // authGuard 的动态路由状态是跨 router 实例共享的；切换授权菜单前清掉
    // 前一个真实导航留下的会话/动态路由状态，确保第二次 push 重新消费新菜单。
    clearDynamicRoutes(deniedRouter)
    loadSessionMock.mockResolvedValueOnce({
      user: { id: '2', username: 'user', displayName: '普通用户', deptId: '1', tenantId: '1' },
      permissions: new Set<string>(['notify:batch:send']),
      roles: new Set<string>(['user']),
      superAdmin: false,
    })
    loadMenuMock.mockResolvedValueOnce(notifyMenu(true))
    const allowedRouter = buildRouter()
    const allowedWrapper = mount(RootLayout, { global: { plugins: [allowedRouter] } })
    await allowedRouter.push('/notify/batch-send')
    await allowedRouter.isReady()
    await flushPromises()
    const allowed = {
      identity: 'ordinary-user-with-notify:batch:send',
      permissions: [...useUserStore().permissions],
      entry: '/notify/batch-send',
      route: allowedRouter.currentRoute.value.path,
      expected: '/notify/batch-send',
      mounted: allowedWrapper.findComponent(NotifyBatchSend).exists(),
    }
    expect(allowed.route).toBe('/notify/batch-send')
    expect(allowed.mounted).toBe(true)
    expect(allowed.permissions).toEqual(['notify:batch:send'])
    console.log(JSON.stringify({ denied, allowed }))
    allowedWrapper.unmount()
  })

  it('未认证身份直达发送路由按真实 authGuard 规则重定向登录页', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(refresh).mockRejectedValue(new Error('NO_SESSION'))
    const router = buildRouter()
    await router.push('/notify/batch-send').catch(() => undefined)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/notify/batch-send')
    console.log(
      JSON.stringify({
        identity: 'unauthenticated',
        entry: '/notify/batch-send',
        route: router.currentRoute.value.fullPath,
        expected: '/login?redirect=/notify/batch-send',
      }),
    )
  })
})

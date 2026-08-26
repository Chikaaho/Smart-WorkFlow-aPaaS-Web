import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'

/**
 * K1-v2: 生产菜单 → router.push → 真实 authGuard → ToolList 挂载（D197/D199 审查 L1）。
 *
 * 本文件验证【mock 语义】下的菜单可见性 + 真实 vue-router/authGuard/ToolList 挂载链
 * （VITE_USE_MOCK=true，真实 guard + 真实 buildRoutesFromMenu + 真实组件挂载）。
 * 真实后端生产菜单响应链由 tool-production-menu-chain-live.spec.ts（VITE_USE_MOCK=false
 * + fetch 直连真实后端）承载——本文件不做 request spy，避免与 live spec 的
 * vi.mock('@/foundation/request') 在全量并行时叠加递归。
 *
 * 每个测试用独立 router + 独立 App 挂载，避免共享 dynamicRoutesBuilt 状态泄漏。
 */
import { switchMockSession, MOCK_CURRENT_SESSION } from '@/foundation/mock/seeds'
import { authGuard, clearDynamicRoutes } from '@/router/guard'
import { routes } from '@/router/index'

const ROUTE_TOOL = '/agent/tool'
// 真实 router 挂载 + 组件渲染，全量并行下放宽超时（默认 5s 不够）
const TEST_TIMEOUT = 30_000

function createTestRouter(): Router {
  const r = createRouter({
    history: createMemoryHistory(),
    routes,
  })
  r.beforeEach((to, from, next) => authGuard(r, to, from, next))
  return r
}

/** 扁平化菜单树，返回 {path,title,permission}[] */
function flattenMenu(
  menu: Array<{ path?: string; title?: string; permission?: string; children?: unknown[] }>,
) {
  const out: Array<{ path?: string; title?: string; permission?: string }> = []
  const walk = (nodes: typeof menu) => {
    for (const n of nodes) {
      out.push({ path: n.path, title: n.title, permission: n.permission })
      if (n.children) walk(n.children as typeof menu)
    }
  }
  walk(menu)
  return out
}

const App = defineComponent({
  setup() {
    return () => h('div', { id: 'app-host' }, [h(RouterView)])
  },
})

describe('K1-v2 生产菜单 → router.push → authGuard → ToolList 挂载（mock 语义）', () => {
  /** 每个用例自行创建 router + mount（在 switchMockSession 之后），
   *  避免 beforeEach 提前 mount 导致初始导航用旧会话/污染 guard 状态。 */
  function setupRouterAndMount() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const r = createTestRouter()
    clearDynamicRoutes(r)
    const w = mount(App, { global: { plugins: [pinia, r] } })
    return { router: r, wrapper: w }
  }

  it(
    'admin（有权普通用户）：菜单含工具项 → push → authGuard 放行 → ToolList 挂载 → 渲染',
    async () => {
      switchMockSession('admin')
      expect(MOCK_CURRENT_SESSION.user.username).toBe('admin')
      expect(MOCK_CURRENT_SESSION.superAdmin).toBe(false)

      // 1. 菜单返回目标项：loadMenu（mock 分发器按 admin 角色绑定过滤）
      const { loadMenu } = await import('@/foundation/menu')
      const menu = await loadMenu()
      const flat = flattenMenu(menu as never)
      const toolMenu = flat.find((n) => n.path === 'agent/tool')
      expect(toolMenu).toBeDefined()
      expect(toolMenu?.title).toBe('工具管理')
      expect(toolMenu?.permission).toBe('agent:tool:view')

      // 2. 真实 router + App 挂载，push 驱动 guard + 挂载
      const { router, wrapper } = setupRouterAndMount()
      await router.push(ROUTE_TOOL)
      await router.isReady()
      await flushPromises()
      await new Promise((r) => setTimeout(r, 100))

      // 3. 路由放行 + 页面渲染
      expect(router.currentRoute.value.path).toBe(ROUTE_TOOL)
      expect(router.currentRoute.value.name).toBe('agent-tool-list')
      const html = wrapper.html()
      expect(html).toContain('工具管理')

      console.log('\n=== K1-v2 身份1: admin 生产链（mock 语义） ===')
      console.log('身份: admin（普通管理员，非超管）')
      console.log('菜单: 返回工具管理(agent/tool, agent:tool:view)')
      console.log('router.push: /agent/tool → authGuard 放行 → ToolList 挂载')
      console.log('页面渲染: 含「工具管理」')
      console.log('=== 验证通过 ===\n')
      wrapper.unmount()
    },
    TEST_TIMEOUT,
  )

  it(
    'user（撤权普通用户）：菜单无工具项；直达 /agent/tool 被守卫拒绝到 /403',
    async () => {
      switchMockSession('user')
      expect(MOCK_CURRENT_SESSION.user.username).toBe('user')
      expect(MOCK_CURRENT_SESSION.permissions).toEqual([])

      // 1. 菜单无工具项
      const { loadMenu } = await import('@/foundation/menu')
      const menu = await loadMenu()
      const flat = flattenMenu(menu as never)
      expect(flat.some((n) => n.path === 'agent/tool')).toBe(false)

      // 2. 直达路由：P36 R1 守卫按 meta.authority 拒绝 → /403（服务端 403 另由后端集成测试承载）
      const { router, wrapper } = setupRouterAndMount()
      await router.push(ROUTE_TOOL)
      await router.isReady()
      await flushPromises()
      await new Promise((r) => setTimeout(r, 100))
      expect(router.currentRoute.value.path).toBe('/403')
      wrapper.unmount()

      console.log('\n=== K1-v2 身份2: user 撤权链（mock 语义） ===')
      console.log('身份: user（普通用户，无任何权限）')
      console.log('菜单: 无 agent/tool 项')
      console.log('直达路由 /agent/tool: 守卫拒绝 → /403（服务端 403 由后端集成测试证明）')
      console.log('=== 验证通过 ===\n')
    },
    TEST_TIMEOUT,
  )

  it(
    '未认证（无 token）→ authGuard 拒绝 → 重定向 /login',
    async () => {
      const { setAccessToken } = await import('@/foundation/auth/token')
      setAccessToken('')
      // 冷启动无 token：guard 调 refresh()。mock 的 /auth/refresh 恒成功会误判为已登录，
      // 这里真实拦截 refresh 使其失败 → guard 应重定向 /login（未认证拒绝）。
      const auth = await import('@/foundation/auth')
      vi.spyOn(auth, 'refresh').mockRejectedValue(new Error('UNAUTHORIZED'))
      const { router } = setupRouterAndMount()
      try {
        await router.push(ROUTE_TOOL)
        await router.isReady()
        await flushPromises()
        await new Promise((r) => setTimeout(r, 100))
      } finally {
        vi.mocked(auth.refresh).mockRestore()
      }
      // 未认证：guard 走 refresh 失败 → /login
      expect(router.currentRoute.value.path).toBe('/login')
      console.log('\n=== K1-v2 身份3: 未认证 → /login ===')
      console.log('路径: ' + router.currentRoute.value.path)
      console.log('=== 验证通过 ===\n')
    },
    TEST_TIMEOUT,
  )

  it(
    'superadmin → 菜单含工具项 → push → authGuard 放行 → ToolList 挂载 → 渲染',
    async () => {
      switchMockSession('superadmin')
      expect(MOCK_CURRENT_SESSION.superAdmin).toBe(true)
      const { loadMenu } = await import('@/foundation/menu')
      const menu = await loadMenu()
      const flat = flattenMenu(menu as never)
      expect(flat.some((n) => n.path === 'agent/tool')).toBe(true)

      const { router, wrapper } = setupRouterAndMount()
      await router.push(ROUTE_TOOL)
      await router.isReady()
      await flushPromises()
      await new Promise((r) => setTimeout(r, 100))
      expect(router.currentRoute.value.path).toBe(ROUTE_TOOL)
      const html = wrapper.html()
      expect(html).toContain('工具管理')
      console.log('\n=== K1-v2 身份4: superadmin 生产链（mock 语义） ===')
      console.log('菜单: 含工具管理')
      console.log('页面渲染: 含「工具管理」')
      console.log('=== 验证通过 ===\n')
      wrapper.unmount()
    },
    TEST_TIMEOUT,
  )
})

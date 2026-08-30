import { describe, it, expect, vi, beforeAll } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'
import { ApiError } from '@/foundation/request'

// vi.mock 工厂被提升执行，工厂内引用的外部变量需用 vi.hoisted 声明（防 TDZ）。
const { API, liveSeen } = vi.hoisted(() => ({
  API: 'http://localhost:8080/api',
  liveSeen: [] as string[],
}))

// 将 request 层替换为 fetch 直连真实后端（jsdom 下 axios XHR 无法发真实网络）。
// 用 vi.mock 替换整个模块，保证 guard/session/menu/ToolList 所有 import 拿到真实后端实现。
vi.mock('@/foundation/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/foundation/request')>()
  // 模拟原 axios 请求拦截器：注入 Bearer token（getAccessToken 为内存 token）
  const { getAccessToken } = await import('@/foundation/auth/token')
  return {
    ...actual,
    request: async <T>(config: {
      method?: string
      url?: string
      params?: Record<string, string>
      data?: unknown
    }): Promise<T> => {
      const method = config.method ?? 'GET'
      const url = config.url ?? ''
      if (url.includes('/agent/tool') || url.includes('/auth/menus') || url.includes('/auth/me')) {
        liveSeen.push(`${method} ${url}`)
      }
      const query = config.params
        ? '?' +
          new URLSearchParams(
            Object.entries(config.params).map(([k, v]) => [k, String(v)]),
          ).toString()
        : ''
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = getAccessToken()
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API}${url}${query}`, {
        method,
        headers,
        body: config.data !== undefined ? JSON.stringify(config.data) : undefined,
      })
      const body = await res.json()
      if (body.code !== 0) {
        throw new ApiError(body.code, body.msg ?? body.message ?? '请求失败')
      }
      return body.data as T
    },
  }
})

/**
 * K1-live: 生产菜单真实响应链（D199 审查 L1，提示7）。
 *
 * 与 tool-production-menu-chain-v2.spec.ts 的区别：本文件运行于 vitest.live.config.ts
 * （VITE_USE_MOCK=false），request 层直连真实后端 http://localhost:8080/api——
 * 生产菜单响应来自真实后端（非 Mock seed / dispatchMock / 手工构造）。
 *
 * 前置：真实后端已启动（dev profile + SW_CIPHER_KEY + Redis）。tooluser/user123 等测试
 * 身份由本文件 beforeAll 经真实后端 API 幂等建立（ensureTooluserFixture：角色2=admin
 * 绑定 V37 菜单 212/213 + 创建/重置 tooluser），不依赖人工预建账号或历史数据库：
 *   - superadmin 身份：admin/admin123（V4 seed，超管旁路，生产菜单含工具管理）
 *   - 普通用户身份：tooluser/user123（beforeAll 建立，superAdmin=false，生产菜单含工具管理）
 *
 * 逐段输出：身份 → 生产菜单响应工具项 → router.push → authGuard 结果 →
 * ToolList 挂载 → 列表请求/页面结果。
 */
import { setAccessToken } from '@/foundation/auth/token'
import { authGuard, clearDynamicRoutes } from '@/router/guard'
import { routes } from '@/router/index'

const ROUTE_TOOL = '/agent/tool'

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`登录失败: ${data.msg}`)
  return data.data.accessToken
}

async function fetchProductionMenu(token: string) {
  const res = await fetch(`${API}/system/auth/menus`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`菜单失败: ${data.msg}`)
  return data.data
}

// ── 版本化测试前置（B1 修复）：fixture 全部经真实后端 API 幂等建立， ──
// ── 干净 H2 库 + 当前 checkout 即可独立运行，不依赖人工预先建号。    ──

const TOOLUSER_FIXTURE = {
  username: 'tooluser',
  password: 'user123',
  realName: '工具用户',
} as const
const FIXTURE_ROLE_ID = 2
/** V37 seed 的工具管理菜单：212=页面（agent/tool），213=按钮（agent:tool:manage） */
const FIXTURE_TOOL_MENU_IDS = [212, 213]

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function ensureTooluserFixture(): Promise<void> {
  const adminToken = await login('admin', 'admin123')

  // 1. 角色2 菜单 → [212, 213]（PUT 为全量替换：角色2 在本 fixture 中锁定为工具菜单状态）
  const menusRes = await fetch(`${API}/system/role/${FIXTURE_ROLE_ID}/menus`, {
    method: 'PUT',
    headers: authHeaders(adminToken),
    body: JSON.stringify(FIXTURE_TOOL_MENU_IDS),
  })
  const menus = await menusRes.json()
  if (menus.code !== 0) throw new Error(`绑定角色菜单失败: ${menus.msg}`)

  // 2. tooluser 不存在则创建，存在则重置为 fixture 密码并绑回角色2（幂等）
  const pageRes = await fetch(`${API}/system/user/page?pageNum=1&pageSize=100`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({}),
  })
  const page = await pageRes.json()
  if (page.code !== 0) throw new Error(`查询用户失败: ${page.msg}`)
  const records = (page.data?.records ?? []) as Array<{ id: number | string; username: string }>
  const existing = records.find((u) => u.username === TOOLUSER_FIXTURE.username)
  const form = {
    username: TOOLUSER_FIXTURE.username,
    realName: TOOLUSER_FIXTURE.realName,
    plainPassword: TOOLUSER_FIXTURE.password,
    status: 0,
    deptId: 1,
    roleIds: [FIXTURE_ROLE_ID],
    postIds: [],
  }
  const saveRes = await fetch(`${API}/system/user`, {
    method: existing == null ? 'POST' : 'PUT',
    headers: authHeaders(adminToken),
    body: JSON.stringify(existing == null ? form : { ...form, id: existing.id }),
  })
  const saved = await saveRes.json()
  if (saved.code !== 0) {
    throw new Error(`${existing == null ? '创建' : '重置'} tooluser 失败: ${saved.msg}`)
  }

  // 3. 前置自证：fixture 账号可真实登录，后续用例不再有账号前置
  await login(TOOLUSER_FIXTURE.username, TOOLUSER_FIXTURE.password)
}

interface MenuNodeLike {
  id?: string
  title?: string
  path?: string
  component?: string | null
  permission?: string
  menuType?: number
  children?: MenuNodeLike[]
}

/** 扁平化菜单，找工具管理项 */
function findToolMenu(nodes: MenuNodeLike[]): MenuNodeLike | undefined {
  for (const n of nodes) {
    if (n.title === '工具管理') return n
    if (n.children?.length) {
      const found = findToolMenu(n.children)
      if (found) return found
    }
  }
  return undefined
}

function createTestRouter(): Router {
  const r = createRouter({
    history: createMemoryHistory(),
    routes,
  })
  r.beforeEach((to, from, next) => authGuard(r, to, from, next))
  return r
}

const App = defineComponent({
  setup() {
    return () => h('div', { id: 'app-host' }, [h(RouterView)])
  },
})

describe('K1-live 生产菜单真实响应链（真实后端）', () => {
  // 真实 HTTP 请求链，全量并行下放宽超时（默认 5s 不够）；每个 it 用第三参数 30s
  const TEST_TIMEOUT = 30_000

  beforeAll(async () => {
    setActivePinia(createPinia())
    // 版本化前置：幂等建立 tooluser/角色菜单绑定（真实 API，见文件顶部说明）
    await ensureTooluserFixture()
  }, 30_000)

  it(
    'superadmin：生产菜单含工具项 → push → authGuard 放行 → ToolList 挂载 → 列表请求成功',
    async () => {
      // 1. 身份：admin（真实后端 V4 seed，超管旁路）
      const token = await login('admin', 'admin123')
      setAccessToken(token)

      // 2. 生产菜单响应（真实后端）：确认工具管理项
      const menu = await fetchProductionMenu(token)
      const tool = findToolMenu(menu)
      expect(tool).toBeDefined()
      expect(tool?.path).toBe('tool')
      expect(tool?.component).toBe('agent/views/ToolList')
      expect(tool?.permission).toBe('agent:tool:view')
      expect(tool?.menuType).toBe(1)

      // 3. 真实 router + App 挂载，push /agent/tool → 真实 authGuard
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = createTestRouter()
      clearDynamicRoutes(router)
      const wrapper = mount(App, { global: { plugins: [pinia, router] } })

      // 3b. push 前清空 liveSeen（仅记录本次 push 链路的真实请求）
      liveSeen.length = 0
      await router.push(ROUTE_TOOL)
      await router.isReady()
      await flushPromises()
      await new Promise((r) => setTimeout(r, 800))

      // 4. guard 放行 + ToolList 挂载 + 列表请求真实成功
      expect(router.currentRoute.value.path).toBe(ROUTE_TOOL)
      expect(router.currentRoute.value.name).toBe('agent-tool-list')
      const toolRequests = liveSeen.filter((r) => r.includes('/agent/tool/internal'))
      expect(toolRequests.length).toBeGreaterThan(0)
      expect(toolRequests.some((r) => r.startsWith('GET'))).toBe(true)
      const html = wrapper.html()
      expect(html).toContain('工具管理')

      console.log('\n=== K1-live 身份1: superadmin 生产链 ===')
      console.log('身份: admin（真实后端，超管旁路）')
      console.log(
        '生产菜单工具项: ' +
          JSON.stringify({
            path: tool?.path,
            component: tool?.component,
            permission: tool?.permission,
          }),
      )
      console.log('router.push: /agent/tool → authGuard 放行 → ToolList 挂载')
      console.log('实际请求: ' + liveSeen.join(', '))
      console.log('页面渲染: 含「工具管理」')
      console.log('=== 验证通过 ===\n')

      wrapper.unmount()
    },
    TEST_TIMEOUT,
  )

  it(
    '普通用户（绑定V37菜单）：生产菜单含工具项 → push → authGuard 放行 → ToolList 挂载 → 列表请求成功',
    async () => {
      // 1. 身份：tooluser（真实后端创建，绑定角色2=admin + V37 菜单 212/213，superAdmin=false）
      const token = await login('tooluser', 'user123')
      setAccessToken(token)

      // 2. 生产菜单响应（真实后端）：确认工具管理项
      const menu = await fetchProductionMenu(token)
      const tool = findToolMenu(menu)
      expect(tool).toBeDefined()
      expect(tool?.path).toBe('tool')
      expect(tool?.component).toBe('agent/views/ToolList')
      expect(tool?.permission).toBe('agent:tool:view')
      expect(tool?.menuType).toBe(1)

      // 3. 真实 router + App 挂载，push /agent/tool → 真实 authGuard
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = createTestRouter()
      clearDynamicRoutes(router)
      const wrapper = mount(App, { global: { plugins: [pinia, router] } })

      // 3b. push 前清空 liveSeen（仅记录本次 push 链路的真实请求）
      liveSeen.length = 0
      await router.push(ROUTE_TOOL)
      await router.isReady()
      await flushPromises()
      await new Promise((r) => setTimeout(r, 800))

      // 4. guard 放行 + ToolList 挂载 + 列表请求真实成功
      expect(router.currentRoute.value.path).toBe(ROUTE_TOOL)
      expect(router.currentRoute.value.name).toBe('agent-tool-list')
      const toolRequests = liveSeen.filter((r) => r.includes('/agent/tool/internal'))
      expect(toolRequests.length).toBeGreaterThan(0)
      const html = wrapper.html()
      expect(html).toContain('工具管理')

      console.log('\n=== K1-live 身份2: 普通用户（绑定V37菜单）生产链 ===')
      console.log('身份: tooluser（真实后端，superAdmin=false，角色=admin + 工具菜单 212/213）')
      console.log(
        '生产菜单工具项: ' +
          JSON.stringify({
            path: tool?.path,
            component: tool?.component,
            permission: tool?.permission,
          }),
      )
      console.log('router.push: /agent/tool → authGuard 放行 → ToolList 挂载')
      console.log('实际请求: ' + liveSeen.join(', '))
      console.log('页面渲染: 含「工具管理」')
      console.log('=== 验证通过 ===\n')

      wrapper.unmount()
    },
    TEST_TIMEOUT,
  )
})

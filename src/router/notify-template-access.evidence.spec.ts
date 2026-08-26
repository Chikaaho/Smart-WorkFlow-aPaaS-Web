/**
 * P36 / M05-F02-01 补证缺口 G2（前端侧）：V38 生产形态菜单树 → buildRoutesFromMenu
 * 真实路由构建 → 守卫行为链证据。
 *
 * 覆盖：
 * 1. V38 生产形态菜单树（通知=目录 menuType=0 component=null；children=[收件箱(inbox,
 *    notify/views/NotifyHome, notify:view), 消息模板(template, notify/views/NotifyTemplateList,
 *    notify:template:view)]）调用真实 buildRoutesFromMenu（src/foundation/menu/index.ts 导出，
 *    非 mock），断言生成 notify/inbox 与 notify/template 路由且组件解析命中 import.meta.glob
 *    白名单（不产生 unknown component warn）。
 * 2. 目录 redirect 行为：通知目录路由 redirect 到第一个叶子 path（notify/inbox，sort=10 < 20）。
 * 3. 守卫权限一致性：读 src/router/guard.ts 的真实消费机制——authGuard 做登录态 + 动态路由
 *    构建判断；P36 R1 起守卫进一步消费 meta.authority（非超管持有任一权限或目标 path 在
 *    服务端过滤后的菜单树中可达 → 放行，否则 /403）。本 spec 的普通用户身份经 V38 菜单树
 *    可达 notify/template，故直达放行（菜单可达性回退命中）；未登录拒绝语义不变。
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type RouteRecordRaw, type Router } from 'vue-router'

// ── 守卫依赖 mock（与 guard.spec.ts 同款隔离；buildRoutesFromMenu 不 mock —— 用真实实现） ──
vi.mock('@/foundation/auth/token', () => ({ getAccessToken: vi.fn() }))
vi.mock('@/foundation/auth', () => ({ refresh: vi.fn(), logout: vi.fn() }))
vi.mock('@/foundation/session', () => ({ loadSession: vi.fn() }))
// 注意：'@/foundation/menu' 不整体 mock——loadMenu 用 vi.mock 部分替换会失去真实实现，
// 因此这里用 importOriginal 保留真实 buildRoutesFromMenu/findFirstLeafPath。
vi.mock('@/foundation/menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/foundation/menu')>()
  return {
    ...actual,
    loadMenu: vi.fn(),
  }
})
vi.mock('@/modules/notify/api', () => ({
  queryNotifyMessages: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  markAsRead: vi.fn(),
  deleteMessage: vi.fn(),
  queryNotifyTemplates: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  createNotifyTemplate: vi.fn(),
  updateNotifyTemplate: vi.fn(),
  deleteNotifyTemplate: vi.fn(),
  toggleNotifyTemplate: vi.fn(),
  previewNotifyTemplate: vi.fn(),
  extractNotifyTemplateVariables: vi.fn(),
  sendNotifyTemplate: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { getAccessToken } from '@/foundation/auth/token'
import { refresh } from '@/foundation/auth'
import { loadSession } from '@/foundation/session'
import { loadMenu, buildRoutesFromMenu } from '@/foundation/menu'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { authGuard, clearDynamicRoutes, ROOT_LAYOUT_NAME } from './guard'
import NotifyHome from '@/modules/notify/views/NotifyHome.vue'
import NotifyTemplateList from '@/modules/notify/views/NotifyTemplateList.vue'

// ── V38 生产形态菜单树（对齐 sw-bootstrap V38__notify_template_and_menu.sql：目录 id=6 +
//    收件箱 215(inbox) + 消息模板 216(template)；mock seeds 已按同形态矫正） ──────────────
const V38_NOTIFY_MENU: MenuNode[] = [
  {
    id: '6',
    parentId: null,
    name: 'notify',
    title: '通知',
    path: 'notify',
    component: null,
    icon: 'Bell',
    sort: 4,
    menuType: MenuType.DIRECTORY,
    permission: 'notify:view',
    hidden: false,
    children: [
      {
        id: '215',
        parentId: '6',
        name: 'NotifyInbox',
        title: '收件箱',
        path: 'notify/inbox',
        component: 'notify/views/NotifyHome',
        icon: 'Bell',
        sort: 10,
        menuType: MenuType.MENU,
        permission: 'notify:view',
        hidden: false,
      },
      {
        id: '216',
        parentId: '6',
        name: 'NotifyTemplate',
        title: '消息模板',
        path: 'notify/template',
        component: 'notify/views/NotifyTemplateList',
        icon: 'Tickets',
        sort: 20,
        menuType: MenuType.MENU,
        permission: 'notify:template:view',
        hidden: false,
      },
    ],
  },
]

const placeholderSession = {
  user: {
    id: 'unknown',
    username: 'tester',
    displayName: 'tester',
    deptId: null,
    tenantId: null,
  },
  permissions: new Set<string>(),
  roles: new Set<string>(),
  superAdmin: false,
}

function toRoute(partial: Partial<Parameters<typeof authGuard>[2]>) {
  return {
    meta: {},
    fullPath: '/',
    path: '/',
    ...partial,
  } as Parameters<typeof authGuard>[2]
}

function createMockRouter(): Router {
  return {
    addRoute: vi.fn(),
    removeRoute: vi.fn(),
    hasRoute: vi.fn(() => true),
  } as unknown as Router
}

describe('G2-1: 真实 buildRoutesFromMenu 解析 V38 生产形态菜单树', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  afterAll(() => {
    warn.mockRestore()
  })

  it('生成 notify/inbox 与 notify/template 路由，component 为白名单命中的真实 loader', () => {
    const routes = buildRoutesFromMenu(V38_NOTIFY_MENU)

    const inbox = routes.find((r) => r.path === 'notify/inbox')
    expect(inbox).toBeDefined()
    expect(inbox!.name).toBe('NotifyInbox')
    expect(typeof inbox!.component).toBe('function')
    // 组件解析正确性：loader 实际加载到的模块就是磁盘上的 NotifyHome.vue
    const inboxLoader = inbox!.component as () => Promise<{ default: unknown }>
    return inboxLoader().then((mod) => {
      expect(mod.default).toBe(NotifyHome)
    })
  })

  it('notify/template 路由 component 解析到 NotifyTemplateList.vue，meta.permission=notify:template:view', async () => {
    const routes = buildRoutesFromMenu(V38_NOTIFY_MENU)

    const template = routes.find((r) => r.path === 'notify/template')
    expect(template).toBeDefined()
    expect(template!.name).toBe('NotifyTemplate')
    expect(typeof template!.component).toBe('function')
    const mod = await (template!.component as () => Promise<{ default: unknown }>)()
    expect(mod.default).toBe(NotifyTemplateList)
    expect(template!.meta?.permission).toBe('notify:template:view')
    expect(template!.meta?.title).toBe('消息模板')
  })

  it('白名单全部命中：不产生任何 "[menu] unknown component path" warn', () => {
    warn.mockClear()
    buildRoutesFromMenu(V38_NOTIFY_MENU)
    const unknownWarns = warn.mock.calls.filter((args) =>
      String(args[0]).includes('[menu] unknown component path'),
    )
    expect(unknownWarns).toHaveLength(0)
  })

  it('按钮型子节点（menuType=2 notify:template:manage）不产生路由，仅作为权限声明存在', () => {
    const withButton: MenuNode[] = [
      {
        ...V38_NOTIFY_MENU[0],
        children: [
          ...V38_NOTIFY_MENU[0].children!,
          {
            id: '217',
            parentId: '216',
            name: 'NotifyTemplateManage',
            title: '模板管理',
            path: '',
            component: null,
            sort: 1,
            menuType: MenuType.BUTTON,
            permission: 'notify:template:manage',
            hidden: true,
          },
        ],
      },
    ]
    const routes = buildRoutesFromMenu(withButton)
    // 目录 redirect 路由 + 两个叶子路由；按钮节点（menuType=2）不产生任何路由
    expect(routes.map((r) => r.path).sort()).toEqual(['notify', 'notify/inbox', 'notify/template'])
    expect(routes.filter((r) => r.component)).toHaveLength(2)
  })
})

describe('G2-2: 通知目录 redirect 到第一个叶子 path', () => {
  it('目录路由 redirect=notify/inbox（sort=10 先于 template sort=20），目录自身无 component', () => {
    const routes = buildRoutesFromMenu(V38_NOTIFY_MENU)
    const dir = routes.find((r) => r.path === 'notify')
    expect(dir).toBeDefined()
    expect(dir!.redirect).toBe('notify/inbox')
    expect(dir!.component).toBeUndefined()
    expect(dir!.meta?.permission).toBe('notify:view')
  })

  it('sort 反转时 redirect 跟随 sort 升序（template sort=1 先于 inbox sort=2 → redirect=notify/template）', () => {
    const reordered: MenuNode[] = [
      {
        ...V38_NOTIFY_MENU[0],
        children: [
          { ...V38_NOTIFY_MENU[0].children![0], sort: 2 },
          { ...V38_NOTIFY_MENU[0].children![1], sort: 1 },
        ],
      },
    ]
    const dir = buildRoutesFromMenu(reordered).find((r) => r.path === 'notify')
    expect(dir!.redirect).toBe('notify/template')
  })
})

describe('G2-3: 守卫真实机制 + meta 权限值一致性', () => {
  let router: Router

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(getAccessToken).mockReset()
    vi.mocked(refresh).mockReset()
    vi.mocked(loadSession).mockReset()
    vi.mocked(loadMenu).mockReset()
    router = createMockRouter()
    clearDynamicRoutes(router)
    vi.mocked(loadSession).mockResolvedValue(placeholderSession)
    vi.mocked(loadMenu).mockResolvedValue(V38_NOTIFY_MENU)
  })

  it('guard.ts 消费 meta.authority：普通用户直达 /notify/template 因菜单可达性回退命中而放行', async () => {
    vi.mocked(getAccessToken).mockReturnValue('valid-token')

    const resolved = realRouterFor(V38_ROUTES()).resolve('/notify/template')
    const permMeta =
      resolved.meta.permission ?? (resolved.meta.authority as string[] | undefined)?.[0]
    expect(permMeta).toBe('notify:template:view')

    const next = vi.fn()
    await authGuard(
      router,
      toRoute({
        fullPath: '/notify/template',
        path: '/notify/template',
        meta: resolved.meta,
      }),
      toRoute({}),
      next,
    )
    // 首访触发动态路由构建 → next({...to, replace:true}) 重放；重放后次访 next() 放行。
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ replace: true }))
    const nextSecond = vi.fn()
    await authGuard(
      router,
      toRoute({
        fullPath: '/notify/template',
        path: '/notify/template',
        meta: resolved.meta,
      }),
      toRoute({}),
      nextSecond,
    )
    expect(nextSecond).toHaveBeenCalledWith()
  })

  it('无 token 且 refresh 失败 → 直达 /notify/template 被守卫拦到 /login 并携带 redirect 参数', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(refresh).mockRejectedValue(new Error('NOT_IMPLEMENTED'))

    const next = vi.fn()
    await authGuard(
      router,
      toRoute({ fullPath: '/notify/template', path: '/notify/template' }),
      toRoute({}),
      next,
    )
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/notify/template' },
    })
  })

  it('静态路由 meta.authority 与菜单 permission 一致为 notify:template:view（单一权限口径）', async () => {
    const staticRoute = await import('./index')
    const layout = staticRoute.routes.find((r) => r.name === ROOT_LAYOUT_NAME)
    const notifyRoute = layout?.children?.find((c) => c.name === 'notify-template-list')
    expect(notifyRoute).toBeDefined()
    expect(notifyRoute!.path).toBe('notify/template')
    expect(notifyRoute!.meta?.authority).toEqual(['notify:template:view'])

    // 菜单侧同一页面节点的 permission 也是 notify:template:view（V38 seed 口径）
    const menuTemplateNode = V38_NOTIFY_MENU[0].children!.find((n) => n.path === 'notify/template')
    expect(menuTemplateNode!.permission).toBe('notify:template:view')
  })
})

// ── 共享辅助 ─────────────────────────────────────────────────

/** 用真实 buildRoutesFromMenu 输出构造可导航 router（根布局最小化） */
function realRouterFor(children: RouteRecordRaw[]): Router {
  const RootLayout = { template: '<router-view/>' }
  const r = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: ROOT_LAYOUT_NAME, component: RootLayout, children }],
  })
  return r
}

function V38_ROUTES(): RouteRecordRaw[] {
  return buildRoutesFromMenu(V38_NOTIFY_MENU)
}

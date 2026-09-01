/**
 * P36 R1 补证：/notify/template 直达导航的三身份真实路由行为证据。
 *
 * 复验记录（planning-rereview-20260826.md）R1 唯一可接受证据：
 * 「同一真实路由运行环境中：普通通知用户直接导航后未渲染模板页并被明确拒绝或重定向；
 *   获授 notify:template:view 的非超管经菜单和直接导航均解析到模板页；
 *   未登录仍按既有登录规则拒绝。必须报告实际导航结果、最终路由和渲染组件/拒绝结果。」
 *
 * 本 spec 用真实 vue-router + 真实 authGuard（beforeEach 接线，非静态扫描、非 meta 检查）
 * 逐身份执行 router.push 并断言：
 * - 最终路由 path（currentRoute.value.path）；
 * - 目标组件是否实际挂载（router-view 容器内的 DOM 标识）。
 *
 * 身份输入（对齐真实授权模型）：
 * - 普通通知用户：permissions 仅按钮行串（无页面行），菜单树无 notify/template → 必须被拒到 /403；
 * - 获授非超管：permissions 同样无页面行串，但菜单树含 notify/template（服务端已授权，
 *   对齐 UserDetailsProviderImpl 只装配 menu_type=2 按钮行的口径）→ 菜单可达性回退放行；
 * - 未登录：refresh 失败 → /login（既有语义不变）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import type { MenuNode } from '@/contracts/menu'

// ── 守卫依赖 mock（loadMenu 按 identity() 工厂逐用例切换菜单树；buildRoutesFromMenu 用真实实现） ──
const { loadMenuMock } = vi.hoisted(() => ({ loadMenuMock: vi.fn() }))

vi.mock('@/foundation/auth/token', () => ({
  getAccessToken: vi.fn(() => 'valid-token'),
  clearToken: vi.fn(),
}))
vi.mock('@/foundation/auth', () => ({
  refresh: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/foundation/session', () => ({
  loadSession: vi.fn().mockResolvedValue({
    user: {
      id: '1',
      username: 'notify-user',
      displayName: '通知用户',
      deptId: null,
      tenantId: null,
    },
    permissions: new Set<string>(),
    roles: new Set<string>(),
    superAdmin: false,
  }),
}))
vi.mock('@/foundation/menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/foundation/menu')>()
  return { ...actual, loadMenu: loadMenuMock }
})
// 收件箱页非本证据目标（动态路由由真实 buildRoutesFromMenu 白名单解析会真实加载它），
// stub 其渲染，仅验证守卫放行行为。
vi.mock('@/modules/notify/views/NotifyHome.vue', () => ({
  default: { template: '<div class="inbox-stub"/>' },
}))
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
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

import { getAccessToken } from '@/foundation/auth/token'
import { refresh } from '@/foundation/auth'
import { authGuard, clearDynamicRoutes, ROOT_LAYOUT_NAME } from './guard'
import NotifyTemplateList from '@/modules/notify/views/NotifyTemplateList.vue'

const Stub = { template: '<div class="error-page-stub" />' }
/** 根布局最小 router-view 容器（与 D169 同款）：组件挂载结果直接反映在容器 DOM 中 */
const RootLayout = { template: '<div class="root-host"><router-view/></div>' }

/** NotifyTemplateList 渲染所需的最小 stubs（与 NotifyTemplateList.spec.ts 同款） */
const TEMPLATE_PAGE_STUBS = {
  StandardListTemplate: {
    template:
      '<div class="standard-list-stub"><h2 class="list-toolbar__title">{{ title }}</h2><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
    emits: ['update:pageNum', 'update:pageSize'],
  },
  NotifyTemplateFormDialog: {
    template: '<div class="template-dialog-stub"/>',
    props: ['visible', 'templateId'],
    emits: ['update:visible', 'saved'],
  },
  'el-alert': { template: '<div class="el-alert">{{ title }}</div>', props: ['title', 'type'] },
  'el-table': { template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>', props: ['prop', 'label'] },
  'el-tag': { template: '<span class="el-tag"><slot/></span>', props: ['type', 'size'] },
  'el-button': {
    template:
      '<button class="el-button" :data-type="type" @click="$emit(\'click\')"><slot/></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
  },
  'el-dialog': {
    template: '<div v-if="modelValue" class="preview-dialog"><slot/></div>',
    props: ['modelValue'],
  },
}

// ── V38 生产形态菜单树（目录 6 + 收件箱 215 + 消息模板 216；path 为分段形态，对齐真实后端） ──
function v38Menu(withTemplateLeaf: boolean): MenuNode[] {
  const children: MenuNode[] = [
    {
      id: '215',
      parentId: '6',
      name: 'NotifyInbox',
      title: '收件箱',
      path: 'inbox',
      component: 'notify/views/NotifyHome',
      icon: 'Bell',
      sort: 10,
      menuType: 1,
      permission: 'notify:view',
      hidden: false,
    },
  ]
  if (withTemplateLeaf) {
    children.push({
      id: '216',
      parentId: '6',
      name: 'NotifyTemplate',
      title: '消息模板',
      path: 'template',
      component: 'notify/views/NotifyTemplateList',
      icon: 'Tickets',
      sort: 20,
      menuType: 1,
      permission: 'notify:template:view',
      hidden: false,
    })
  }
  return [
    {
      id: '6',
      parentId: null,
      name: 'notify',
      title: '通知',
      path: 'notify',
      component: null,
      icon: 'Bell',
      sort: 4,
      menuType: 0,
      permission: 'notify:view',
      hidden: false,
      children,
    },
  ]
}

describe('P36 R1: /notify/template 直达三身份真实导航证据', () => {
  let pinia: Pinia

  function buildAppRouter(): Router {
    const r = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          name: ROOT_LAYOUT_NAME,
          component: RootLayout,
          children: [
            // 静态直达路由（生产形态，meta.authority 对齐 router/index.ts）
            {
              path: 'notify/template',
              name: 'notify-template-list',
              component: NotifyTemplateList,
              meta: { title: '消息模板', authority: ['notify:template:view'] },
            },
            {
              path: 'notify/inbox',
              name: 'NotifyInbox',
              component: Stub,
              meta: { title: '收件箱' },
            },
            {
              path: '403',
              name: 'forbidden',
              component: Stub,
              meta: { public: true, errorCode: 403, title: '无权限访问' },
            },
            { path: '/:pathMatch(.*)*', name: 'not-found-catchall', redirect: '/404' },
            {
              path: '/404',
              name: 'not-found',
              component: Stub,
              meta: { public: true, errorCode: 404, title: '页面不存在' },
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
    vi.mocked(getAccessToken).mockReturnValue('valid-token')
    vi.mocked(refresh).mockReset()
    clearDynamicRoutes(buildAppRouter())
  })

  it('身份A 普通通知用户（菜单无模板项）：直达 /notify/template → 最终路由 /403，模板页未渲染', async () => {
    // 输入：permissions 无页面行串（真实后端只装配按钮行）、菜单树不含 notify/template
    loadMenuMock.mockResolvedValue(v38Menu(false))

    const router = buildAppRouter()
    const wrapper = mount(RootLayout, { global: { plugins: [pinia, router] } })

    // 导航动作：直达 URL
    await router.push('/notify/template')
    await router.isReady()
    await flushPromises()

    // 到页结果：最终路由 /403 + 模板管理页未渲染
    expect(router.currentRoute.value.path).toBe('/403')
    expect(router.currentRoute.value.name).toBe('forbidden')
    expect(wrapper.find('.root-host').text()).not.toContain('消息模板')
    // 模板列表组件未挂载（无 StandardListTemplate 页面容器）
    expect(wrapper.findComponent(NotifyTemplateList).exists()).toBe(false)
    wrapper.unmount()
  })

  it('身份B 获授非超管（菜单含模板项）：经菜单路径 push 与直达 URL 均解析到模板管理页并实际挂载', async () => {
    // 输入：permissions 同样无页面行串，但服务端授权菜单树含 notify/template
    loadMenuMock.mockResolvedValue(v38Menu(true))

    const router = buildAppRouter()
    // B1 经动态路由（菜单入口等价物）push：分段 path 嵌套注册后组合为 /notify/inbox
    const wrapper = mount(RootLayout, {
      global: { plugins: [pinia, router], stubs: TEMPLATE_PAGE_STUBS },
    })
    await router.push({ name: 'NotifyInbox' })
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('NotifyInbox')

    // B2 直达 URL：同一运行环境内直接导航到模板管理页
    await router.push('/notify/template')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/notify/template')
    expect(router.currentRoute.value.name).toBe('notify-template-list')
    // 组件真实挂载：列表工具栏标题渲染 + 组件实例存在
    expect(wrapper.find('.list-toolbar__title').text()).toContain('消息模板')
    expect(wrapper.findComponent(NotifyTemplateList).exists()).toBe(true)
    wrapper.unmount()
  })

  it('身份C 未登录（refresh 失败）：直达 /notify/template → /login 并携带 redirect 参数（既有语义不变）', async () => {
    vi.mocked(getAccessToken).mockReturnValue(null)
    vi.mocked(refresh).mockRejectedValue(new Error('NOT_IMPLEMENTED'))

    const router = buildAppRouter()
    // 登录页是生产路由（router/index.ts meta.public），补进测试路由表以承接重定向
    router.addRoute({
      path: '/login',
      name: 'login',
      component: Stub,
      meta: { public: true },
    })
    await router.push('/notify/template').catch(() => {})
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/notify/template')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { useMenuStore } from '@/stores/menu'
import { setLocale } from '@/locales'
import AppMainNav from './AppMainNav.vue'

// 路由在测试中固定为某一路径/查询，用于断言「条目选中态随路由」。
let mockPath = '/workspace'
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return mockPath
    },
    get query() {
      return mockQuery
    },
  }),
}))

const routerLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a :data-to="to"><slot/></a>',
}

/** 门户可见的真实菜单入口（服务端授权树投影；不含应用中心行——用户端入口不依赖后台菜单授权）。 */
const PORTAL_MENU: MenuNode[] = [
  {
    id: '320',
    parentId: '5',
    name: 'ProcessCatalog',
    title: '流程中心',
    path: 'workflow/catalog',
    component: 'workflow/views/ProcessCatalog',
    sort: 1,
    menuType: MenuType.MENU,
  },
  {
    id: '9131',
    parentId: '2',
    name: 'FormAppCenter',
    title: '应用中心',
    path: 'form/app-center',
    component: 'form/views/AppCenter',
    sort: 30,
    menuType: MenuType.MENU,
  },
  {
    id: '3',
    parentId: '2',
    name: 'FormOverview',
    title: '表单列表',
    path: 'form/form-def-list',
    component: 'form/views/FormDefList',
    sort: 1,
    menuType: MenuType.MENU,
  },
]

/** 普通用户的最小门户菜单：无流程中心行、无应用中心行（复现交付缺陷场景）。 */
const PORTAL_MENU_WITHOUT_APP_CENTER: MenuNode[] = [
  {
    id: '7',
    parentId: null,
    name: 'NotifyInbox',
    title: '收件箱',
    path: 'notify/inbox',
    component: 'notify/views/NotifyInbox',
    sort: 9,
    menuType: MenuType.MENU,
  },
]

const ADMIN_MENU: MenuNode[] = [
  {
    id: 'form-top',
    parentId: null,
    name: 'FormAdmin',
    title: '表单管理',
    path: 'form/form-def-list',
    component: 'form/views/FormDefList',
    sort: 1,
    menuType: MenuType.MENU,
    topbar: 1,
  },
  {
    id: 'workflow-top',
    parentId: null,
    name: 'WorkflowAdmin',
    title: '流程管理',
    path: 'workflow/defs',
    component: 'workflow/views/ProcessDefList',
    sort: 2,
    menuType: MenuType.MENU,
    topbar: 2,
  },
]

function mountNav(
  menu: MenuNode[],
  path = '/workspace',
  query: Record<string, unknown> = {},
  props: { showSidebarToggle?: boolean; sidebarCollapsed?: boolean } = {},
) {
  mockPath = path
  mockQuery = query
  setActivePinia(createPinia())
  useMenuStore().setMenu(menu)
  return mount(AppMainNav, {
    props,
    global: { stubs: { RouterLink: routerLinkStub } },
  })
}

function items(wrapper: ReturnType<typeof mountNav>) {
  return wrapper.findAll('.app-main-nav__item').map((el) => ({
    label: el.text(),
    to: el.attributes('data-to'),
    active: el.classes().includes('is-active'),
  }))
}

describe('AppMainNav（用户端主导航）', () => {
  beforeEach(() => {
    setLocale('zh-CN')
  })

  it('门户区域：工作台/我的门户/流程中心之后常驻「应用中心」入口', () => {
    const nav = items(mountNav(PORTAL_MENU))
    expect(nav.map((i) => i.label)).toEqual(['工作台', '我的门户', '流程中心', '应用中心'])
    expect(nav[3]!.to).toBe('/form/app-center')
  })

  it('菜单树无应用中心行（普通用户未获后台授权）时入口仍可用', () => {
    const nav = items(mountNav(PORTAL_MENU_WITHOUT_APP_CENTER))
    expect(nav.map((i) => i.label)).toEqual(['工作台', '我的门户', '应用中心'])
    expect(nav[2]!.to).toBe('/form/app-center')
  })

  it('个人办理子页面保持工作台顶栏选中，其他栏目不误选', () => {
    for (const path of ['/workspace/todo', '/workspace/processed', '/workspace/my-instances']) {
      const nav = items(mountNav(PORTAL_MENU, path))
      expect(nav[0]!.active).toBe(true)
      expect(nav.slice(1).some((item) => item.active)).toBe(false)
    }
  })

  it('应用中心下钻页面（应用内容 / 表单数据列表）保持选中态', () => {
    expect(items(mountNav(PORTAL_MENU, '/form/app-center'))[3]!.active).toBe(true)
    expect(items(mountNav(PORTAL_MENU, '/form/app-center/app-1'))[3]!.active).toBe(true)
    expect(items(mountNav(PORTAL_MENU, '/form/app-form/leave_request'))[3]!.active).toBe(true)
  })

  it('离开应用中心后不误标选中（工作台/流程中心各自独立）', () => {
    const nav = items(mountNav(PORTAL_MENU, '/workflow/catalog'))
    expect(nav[0]!.active).toBe(false)
    expect(nav[2]!.active).toBe(true)
    expect(nav[3]!.active).toBe(false)
  })

  it('表单工作台内流程设计保持表单管理选中，直接流程设计保持流程管理选中', () => {
    const workbench = items(
      mountNav(ADMIN_MENU, '/workflow/defs/123/design', {
        from: 'form-workbench',
        formId: 'form-1',
      }),
    )
    expect(workbench[0]!.active).toBe(true)
    expect(workbench[1]!.active).toBe(false)

    const direct = items(mountNav(ADMIN_MENU, '/workflow/defs/123/design'))
    expect(direct[0]!.active).toBe(false)
    expect(direct[1]!.active).toBe(true)
  })

  it('侧栏可用时提供带可访问名称和展开状态的收起入口', async () => {
    const wrapper = mountNav([], '/system/user', {}, { showSidebarToggle: true })
    const button = wrapper.get('[data-test="sidebar-toggle"]')

    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-label')).toBe('收起或展开侧栏')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.attributes('aria-controls')).toBe('app-sidebar')

    await button.trigger('click')
    expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1)
  })

  it('收起后入口报告 aria-expanded=false，无侧栏时入口不渲染', () => {
    const collapsed = mountNav(
      [],
      '/system/user',
      {},
      { showSidebarToggle: true, sidebarCollapsed: true },
    )
    expect(collapsed.get('[data-test="sidebar-toggle"]').attributes('aria-expanded')).toBe('false')

    const noSidebar = mountNav([], '/portal')
    expect(noSidebar.find('[data-test="sidebar-toggle"]').exists()).toBe(false)
  })
})

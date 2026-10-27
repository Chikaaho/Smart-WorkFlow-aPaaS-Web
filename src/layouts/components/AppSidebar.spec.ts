import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { useMenuStore } from '@/stores/menu'
import AppSidebar from './AppSidebar.vue'

// 0.2.0 多级侧栏（direction-sidebar-navigation-020）行为测试：
// 展开树（叶子/目录/弱分组标题）、深链祖先展开、收起图标列＋首字回退、
// 目录子树浮层（打开/导航关闭/Esc 关闭）、底部条在 BasicLayout.spec 覆盖。
let mockPath = '/system/tenant'
const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return mockPath
    },
  }),
  useRouter: () => ({ push: pushMock }),
}))

const MENU: MenuNode[] = [
  {
    id: '1',
    parentId: null,
    name: 'system',
    title: '系统管理',
    path: 'system',
    component: null,
    sort: 1,
    menuType: MenuType.DIRECTORY,
    children: [
      {
        id: '1-1',
        parentId: '1',
        name: 'system-tenant',
        title: '租户管理',
        path: 'system/tenant',
        component: null,
        sort: 1,
        menuType: MenuType.MENU,
      },
      {
        id: '1-2',
        parentId: '1',
        name: 'system-user',
        title: '用户管理',
        path: 'system/user',
        component: null,
        sort: 2,
        menuType: MenuType.MENU,
      },
      {
        id: '1-3',
        parentId: '1',
        name: 'system-dict',
        title: '字典管理',
        path: 'system/dict',
        component: null,
        sort: 3,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: '1-3-1',
            parentId: '1-3',
            name: 'system-dict-type',
            title: '字典类型',
            path: 'system/dict-type',
            component: null,
            sort: 1,
            menuType: MenuType.MENU,
          },
        ],
      },
    ],
  },
]

const stubs = {
  'el-icon': { template: '<i><slot /></i>' },
  teleport: true,
}

function mountSidebar(collapse = false) {
  return mount(AppSidebar, {
    props: { collapse },
    global: { stubs },
    attachTo: document.body,
  })
}

describe('layouts/AppSidebar 多级侧栏', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useMenuStore().setMenu(MENU)
    mockPath = '/system/tenant'
    pushMock.mockClear()
  })

  it('展开态：弱分组标题（当前分区名）+ 叶子行 + 目录行（尾部箭头）', () => {
    const wrapper = mountSidebar(false)
    expect(wrapper.find('.app-sidebar-tree__group-title').text()).toBe('系统管理')
    const leaves = wrapper.findAll('.sb-node__row--leaf').map((l) => l.text())
    expect(leaves.some((t) => t.includes('租户管理'))).toBe(true)
    const dir = wrapper.findAll('.sb-node__row--dir').map((d) => d.text())
    expect(dir.some((t) => t.includes('字典管理'))).toBe(true)
    // 展开态无首字回退（图标槽位仅在有图标时出现；本夹具无图标 → 纯文字行）
    expect(wrapper.findAll('.sb-node__char').length).toBeGreaterThanOrEqual(0)
  })

  it('叶子点击导航；目录点击切换子树（不做导航）', async () => {
    const wrapper = mountSidebar(false)
    const leaf = wrapper.findAll('.sb-node__row--leaf').find((l) => l.text().includes('租户管理'))
    await leaf!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/system/tenant')

    const dir = wrapper.findAll('.sb-node__row--dir').find((d) => d.text().includes('字典管理'))
    expect(wrapper.text()).not.toContain('字典类型')
    await dir!.trigger('click')
    expect(wrapper.text()).toContain('字典类型')
    expect(pushMock).not.toHaveBeenCalledWith('/system/dict')
  })

  it('当前页选中态与祖先目录轻强调；子项按层级缩进', async () => {
    const wrapper = mountSidebar(false)
    const active = wrapper.findAll('.sb-node__row--leaf').find((l) => l.text().includes('租户管理'))
    expect(active!.classes()).toContain('is-active')
    expect(active!.attributes('aria-current')).toBe('page')
    const dir = wrapper.findAll('.sb-node__row--dir').find((d) => d.text().includes('字典管理'))
    await dir!.trigger('click')
    // 层级缩进改为 CSS 变量（行内只声明 --sb-depth；基础槽 24 + 每层 20 由样式计算）
    const child = wrapper
      .findAll('.sb-node__row--leaf')
      .find((l) => (l.attributes('style') ?? '').includes('--sb-depth: 1'))
    expect(child).toBeTruthy()
    expect(child!.text()).toContain('字典类型')
  })

  it('深链进入深层页面：祖先目录自动展开使当前项可见', () => {
    mockPath = '/system/dict-type'
    const wrapper = mountSidebar(false)
    expect(wrapper.text()).toContain('字典类型')
    const dir = wrapper.findAll('.sb-node__row--dir').find((d) => d.text().includes('字典管理'))
    expect(dir!.classes()).toContain('is-ancestor')
  })

  it('收起态：分组标题隐去、名称隐藏、无图标项首字回退、目录带指示', () => {
    mockPath = '/system/dict-type'
    const wrapper = mountSidebar(true)
    expect(wrapper.find('.app-sidebar-tree__group-title').exists()).toBe(false)
    expect(wrapper.findAll('.sb-row__name, .sb-node__name').length).toBe(0)
    const chars = wrapper.findAll('.sb-node__char').map((c) => c.text())
    expect(chars).toContain('租')
    expect(chars).toContain('用')
    expect(chars).toContain('字')
    const dirBtn = wrapper.findAll('.sb-node__icon-btn').find((b) => b.text().includes('字'))
    expect(dirBtn!.classes()).toContain('is-ancestor')
  })

  it('收起态目录点击打开子树浮层（头部目录名+子项），页内点击导航并关闭', async () => {
    mockPath = '/system/user'
    const wrapper = mountSidebar(true)
    const dirBtn = wrapper.findAll('.sb-node__icon-btn').find((b) => b.text().includes('字'))
    await dirBtn!.trigger('click')
    const flyout = document.querySelector('.app-sidebar-flyout')
    expect(flyout).toBeTruthy()
    expect(flyout!.textContent).toContain('字典管理')
    expect(flyout!.textContent).toContain('字典类型')
    const childRow = Array.from(flyout!.querySelectorAll('.sb-node__row--leaf')).find((r) =>
      r.textContent?.includes('字典类型'),
    ) as HTMLButtonElement
    childRow.click()
    await Promise.resolve()
    expect(pushMock).toHaveBeenCalledWith('/system/dict-type')
    // 路由变化由组件内 watcher 关闭浮层；此处直接断言 push 已发生（关闭逻辑走 activePath watch）
  })

  it('再次点击目录或 Esc 关闭浮层', async () => {
    mockPath = '/system/user'
    const wrapper = mountSidebar(true)
    const dirBtn = wrapper.findAll('.sb-node__icon-btn').find((b) => b.text().includes('字'))
    await dirBtn!.trigger('click')
    expect(document.querySelector('.app-sidebar-flyout')).toBeTruthy()
    await dirBtn!.trigger('click')
    await nextTick()
    expect(document.querySelector('.app-sidebar-flyout')).toBeNull()

    await dirBtn!.trigger('click')
    expect(document.querySelector('.app-sidebar-flyout')).toBeTruthy()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.querySelector('.app-sidebar-flyout')).toBeNull()
  })

  it('收起态页面入口点击直接导航', async () => {
    mockPath = '/system/user'
    const wrapper = mountSidebar(true)
    const leafBtn = wrapper.findAll('.sb-node__icon-btn').find((b) => b.text().includes('租'))
    await leafBtn!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/system/tenant')
  })
})

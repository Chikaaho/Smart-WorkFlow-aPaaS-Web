import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { useMenuStore } from '@/stores/menu'
import AppSidebar from './AppSidebar.vue'
import AppSidebarItem from './AppSidebarItem.vue'

// 路由在测试中固定为某一路径，用于断言「选中态随路由」。
let mockPath = '/system'
vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return mockPath
    },
  }),
}))

const MENU: MenuNode[] = [
  {
    id: '1',
    parentId: null,
    name: 'system',
    title: '系统管理',
    path: 'system',
    component: 'system/views/SystemHome',
    sort: 1,
    menuType: MenuType.MENU,
  },
  {
    id: '2',
    parentId: null,
    name: 'form',
    title: '低代码',
    path: 'form',
    component: null,
    sort: 2,
    menuType: MenuType.DIRECTORY,
    children: [
      {
        id: '2-1',
        parentId: '2',
        name: 'form-overview',
        title: '低代码概览',
        path: 'form/overview',
        component: 'form/views/FormHome',
        sort: 1,
        menuType: MenuType.MENU,
      },
      {
        id: '2-2',
        parentId: '2',
        name: 'form-form',
        title: '表单设计',
        path: 'form/form',
        component: 'form/views/FormForm',
        sort: 2,
        menuType: MenuType.MENU,
      },
    ],
  },
]

// 轻量 stub：把关键 prop 透传到 DOM 属性上，便于断言，且渲染默认插槽以驱动递归。
const stubs = {
  'el-menu': {
    props: ['collapse', 'defaultActive'],
    template:
      '<ul class="stub-menu" :data-collapse="String(collapse)" :data-active="defaultActive"><slot /></ul>',
  },
  'el-sub-menu': {
    props: ['index'],
    template: '<li class="stub-sub" :data-index="index"><slot name="title" /><slot /></li>',
  },
  'el-menu-item': {
    props: ['index'],
    template: '<li class="stub-item" :data-index="index"><slot /></li>',
  },
  'el-icon': { template: '<i><slot /></i>' },
}

function mountSidebar(collapse = false) {
  return mount(AppSidebar, {
    props: { collapse },
    global: { stubs },
  })
}

describe('layouts/AppSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useMenuStore().setMenu(MENU)
    mockPath = '/system'
  })

  it('renders one item per visible menu node, sourced from the menu store', () => {
    const wrapper = mountSidebar()
    // 1 顶层菜单 + 1 目录 + 2 子菜单 = 4 个递归项。
    expect(wrapper.findAllComponents(AppSidebarItem)).toHaveLength(4)
    const indexes = wrapper.findAll('.stub-item').map((el) => el.attributes('data-index'))
    expect(indexes).toContain('/system')
    expect(indexes).toContain('/form/overview')
    expect(indexes).toContain('/form/form')
  })

  it('renders a nested directory as a sub-menu keyed by its full path', () => {
    const wrapper = mountSidebar()
    const subs = wrapper.findAll('.stub-sub')
    expect(subs).toHaveLength(1)
    expect(subs[0].attributes('data-index')).toBe('/form')
  })

  it('binds el-menu active index to the current route path (selection follows route)', () => {
    mockPath = '/form/form'
    const wrapper = mountSidebar()
    expect(wrapper.find('.stub-menu').attributes('data-active')).toBe('/form/form')
  })

  it('forwards the collapse flag to el-menu (collapsible is a first-class capability)', () => {
    const wrapper = mountSidebar(true)
    expect(wrapper.find('.stub-menu').attributes('data-collapse')).toBe('true')
  })
})

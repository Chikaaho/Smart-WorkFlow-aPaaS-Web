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

  it('只渲染当前顶部分区（与顶栏同源），不串其它分区', () => {
    // 落在「系统管理」分区：只出该分区的页面，不出现「表单管理」的条目。
    const systemWrapper = mountSidebar()
    expect(systemWrapper.findAllComponents(AppSidebarItem)).toHaveLength(1)
    expect(systemWrapper.findAll('.stub-item').map((el) => el.attributes('data-index'))).toEqual([
      '/system',
    ])

    // 落在「表单管理」分区：只出该分区下的两个页面，系统管理条目不再出现。
    mockPath = '/form/form'
    const formWrapper = mountSidebar()
    expect(formWrapper.findAll('.stub-item').map((el) => el.attributes('data-index'))).toEqual([
      '/form/overview',
      '/form/form',
    ])
  })

  it('分区内条目以平铺菜单项渲染，索引为完整路径', () => {
    // 顶栏已承担分区切换，侧栏不再重复一层目录：分区内的页面直接平铺。
    mockPath = '/form/form'
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.stub-sub')).toHaveLength(0)
    expect(wrapper.findAll('.stub-item')).toHaveLength(2)
  })

  it('二级路径页面（开放接口/文件管理）仍锁定在所属分区，不回退成整棵树', () => {
    // 回归：曾按「首段路径 == 分组路径」定位分区，/openapi 首段与分组路径 system 不一致，
    // 结果回退成整棵后台树（点开放接口后所有分组又都展开）。
    useMenuStore().setMenu([
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
            id: '10',
            parentId: '1',
            name: 'dict',
            title: '字典管理',
            path: 'system/dict',
            component: 'system/views/DictTypeList',
            sort: 1,
            menuType: MenuType.MENU,
          },
          {
            id: '9',
            parentId: '1',
            name: 'openapi',
            title: '开放接口',
            path: 'openapi',
            component: 'openapi/views/OpenapiHome',
            sort: 2,
            menuType: MenuType.MENU,
          },
        ],
      },
      {
        id: '2',
        parentId: null,
        name: 'form',
        title: '表单管理',
        path: 'form',
        component: null,
        sort: 2,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: '3',
            parentId: '2',
            name: 'form-list',
            title: '表单列表',
            path: 'form/form-def-list',
            component: 'form/views/FormDefList',
            sort: 1,
            menuType: MenuType.MENU,
          },
        ],
      },
    ])
    mockPath = '/openapi'
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.stub-item').map((el) => el.attributes('data-index'))).toEqual([
      '/system/dict',
      '/openapi',
    ])
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

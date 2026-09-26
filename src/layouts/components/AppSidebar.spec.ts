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

  it('V012-BUG-004: /workspace 侧栏精简为 待办/已办/草稿 三个直达项', () => {
    useMenuStore().setMenu([
      {
        id: 'w',
        parentId: null,
        name: 'workflow',
        title: '流程管理',
        path: 'workflow',
        component: null,
        sort: 1,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: 'w1',
            parentId: 'w',
            name: 'todo',
            title: '待办任务',
            path: 'workflow/todo',
            component: 'x',
            sort: 1,
            menuType: MenuType.MENU,
          },
          {
            id: 'w2',
            parentId: 'w',
            name: 'processed',
            title: '已办任务',
            path: 'workflow/processed',
            component: 'x',
            sort: 2,
            menuType: MenuType.MENU,
          },
          {
            id: 'w3',
            parentId: 'w',
            name: 'my-instances',
            title: '我发起的',
            path: 'workflow/my-instances',
            component: 'x',
            sort: 3,
            menuType: MenuType.MENU,
          },
          {
            id: 'w4',
            parentId: 'w',
            name: 'my-drafts',
            title: '我的草稿',
            path: 'workflow/my-drafts',
            component: 'x',
            sort: 4,
            menuType: MenuType.MENU,
          },
          {
            id: 'w5',
            parentId: 'w',
            name: 'catalog',
            title: '流程中心',
            path: 'workflow/catalog',
            component: 'x',
            sort: 5,
            menuType: MenuType.MENU,
          },
        ],
      },
      {
        id: 'n',
        parentId: null,
        name: 'notify-inbox',
        title: '收件箱',
        path: 'notify/inbox',
        component: 'x',
        sort: 2,
        menuType: MenuType.MENU,
      },
    ])
    mockPath = '/workspace'
    const wrapper = mountSidebar()

    const indexes = wrapper.findAll('.stub-item').map((el) => el.attributes('data-index'))
    // 工作台固定项 + 精简三直达项；流程管理组内其它页面与收件箱不再出现
    expect(indexes).toContain('/workspace')
    expect(indexes).toEqual([
      '/workspace',
      '/workflow/todo',
      '/workflow/processed',
      '/workflow/my-drafts',
    ])
    expect(wrapper.findAll('.stub-sub')).toHaveLength(0)
  })

  it('V012-BUG-006: 流程中心上下文仅流程管理分组子项（无工作台固定项/通知/门户）', () => {
    useMenuStore().setMenu([
      {
        id: 'w',
        parentId: null,
        name: 'workflow',
        title: '流程管理',
        path: 'workflow',
        component: null,
        sort: 1,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: 'w1',
            parentId: 'w',
            name: 'todo',
            title: '待办任务',
            path: 'workflow/todo',
            component: 'x',
            sort: 1,
            menuType: MenuType.MENU,
          },
          {
            id: 'w2',
            parentId: 'w',
            name: 'catalog',
            title: '流程中心',
            path: 'workflow/catalog',
            component: 'x',
            sort: 2,
            menuType: MenuType.MENU,
          },
        ],
      },
      {
        id: 'n',
        parentId: null,
        name: 'notify',
        title: '通知',
        path: 'notify',
        component: null,
        sort: 2,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: 'n1',
            parentId: 'n',
            name: 'inbox',
            title: '收件箱',
            path: 'notify/inbox',
            component: 'x',
            sort: 1,
            menuType: MenuType.MENU,
          },
        ],
      },
      {
        id: 'p',
        parentId: null,
        name: 'portal',
        title: '我的门户',
        path: 'portal',
        component: 'x',
        sort: 3,
        menuType: MenuType.MENU,
      },
    ])
    mockPath = '/workflow/todo'
    const wrapper = mountSidebar()

    const indexes = wrapper.findAll('.stub-item').map((el) => el.attributes('data-index'))
    // 仅流程管理分组子项：无工作台固定项、无收件箱、无我的门户（V012-BUG-006）
    expect(indexes).toEqual(['/workflow/todo', '/workflow/catalog'])
    expect(wrapper.findAll('.stub-sub')).toHaveLength(0)
  })

  it('V012-BUG-008: 收件箱上下文侧栏仅 全部/已读/未读 分类项', () => {
    useMenuStore().setMenu([
      {
        id: 'w',
        parentId: null,
        name: 'workflow',
        title: '流程管理',
        path: 'workflow',
        component: null,
        sort: 1,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: 'w1',
            parentId: 'w',
            name: 'todo',
            title: '待办任务',
            path: 'workflow/todo',
            component: 'x',
            sort: 1,
            menuType: MenuType.MENU,
          },
        ],
      },
      {
        id: 'n',
        parentId: null,
        name: 'inbox',
        title: '收件箱',
        path: 'notify/inbox',
        component: 'x',
        sort: 2,
        menuType: MenuType.MENU,
      },
    ])
    mockPath = '/notify/inbox'
    const wrapper = mountSidebar()

    const indexes = wrapper.findAll('.stub-item').map((el) => el.attributes('data-index'))
    // 分类固定项（query 驱动），菜单树节点不渲染
    expect(indexes).toEqual([
      '/notify/inbox',
      '/notify/inbox?read=true',
      '/notify/inbox?read=false',
    ])
  })

  it('forwards the collapse flag to el-menu (collapsible is a first-class capability)', () => {
    const wrapper = mountSidebar(true)
    expect(wrapper.find('.stub-menu').attributes('data-collapse')).toBe('true')
  })
})

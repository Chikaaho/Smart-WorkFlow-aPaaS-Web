import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMenuStore } from '@/stores/menu'
import { MenuType } from '@/contracts/menu'
import type { MenuNode } from '@/contracts/menu'
import { resolveDefaultRedirect } from './index'

const mockSystemMenu: MenuNode[] = [
  {
    id: '1',
    parentId: null,
    name: 'system',
    title: '系统管理',
    path: 'system',
    component: null,
    icon: 'Setting',
    sort: 1,
    menuType: MenuType.DIRECTORY,
    permission: 'system:view',
    children: [
      {
        id: '10',
        parentId: '1',
        name: 'dict',
        title: '字典管理',
        path: 'system/dict',
        component: 'system/views/DictTypeList',
        icon: 'Collection',
        sort: 1,
        menuType: MenuType.MENU,
        permission: 'system:dict:view',
      },
    ],
  },
  {
    id: '2',
    parentId: null,
    name: 'form',
    title: '低代码',
    path: 'form',
    component: null,
    icon: 'Grid',
    sort: 2,
    menuType: MenuType.DIRECTORY,
    permission: 'form:view',
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
        permission: 'form:view',
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
        permission: 'form:form:view',
      },
    ],
  },
  {
    id: '3',
    parentId: null,
    name: 'workflow',
    title: '流程引擎',
    path: 'workflow',
    component: 'workflow/views/WorkflowHome',
    sort: 3,
    menuType: MenuType.MENU,
    permission: 'workflow:view',
  },
]

const noSystemMenu: MenuNode[] = [
  {
    id: '2',
    parentId: null,
    name: 'form',
    title: '低代码',
    path: 'form',
    component: null,
    icon: 'Grid',
    sort: 2,
    menuType: MenuType.DIRECTORY,
    permission: 'form:view',
    children: [
      {
        id: '2-2',
        parentId: '2',
        name: 'form-form',
        title: '表单设计',
        path: 'form/form',
        component: 'form/views/FormForm',
        sort: 2,
        menuType: MenuType.MENU,
        permission: 'form:form:view',
      },
      {
        id: '2-1',
        parentId: '2',
        name: 'form-overview',
        title: '低代码概览',
        path: 'form/overview',
        component: 'form/views/FormHome',
        sort: 1,
        menuType: MenuType.MENU,
        permission: 'form:view',
      },
    ],
  },
  {
    id: '3',
    parentId: null,
    name: 'workflow',
    title: '流程引擎',
    path: 'workflow',
    component: 'workflow/views/WorkflowHome',
    sort: 3,
    menuType: MenuType.MENU,
    permission: 'workflow:view',
  },
]

const emptyMenu: MenuNode[] = []

describe('router/index resolveDefaultRedirect（v0.0.2 P54/P55：三类身份统一落地工作台）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useMenuStore().clearMenu()
  })

  it('super admin: full mock menu → lands on /workspace', () => {
    useMenuStore().setMenu(mockSystemMenu)
    expect(resolveDefaultRedirect()).toBe('/workspace')
  })

  it('filtered menu without system: still lands on /workspace', () => {
    useMenuStore().setMenu(noSystemMenu)
    expect(resolveDefaultRedirect()).toBe('/workspace')
  })

  it('menu with swapped sort order: still lands on /workspace（首叶逻辑仅目录 redirect 消费）', () => {
    const menuWithSwappedSort: MenuNode[] = [
      {
        id: '2',
        parentId: null,
        name: 'form',
        title: '低代码',
        path: 'form',
        component: null,
        icon: 'Grid',
        sort: 2,
        menuType: MenuType.DIRECTORY,
        permission: 'form:view',
        children: [
          {
            id: '2-2',
            parentId: '2',
            name: 'form-form',
            title: '表单设计',
            path: 'form/form',
            component: 'form/views/FormForm',
            sort: 1,
            menuType: MenuType.MENU,
            permission: 'form:form:view',
          },
          {
            id: '2-1',
            parentId: '2',
            name: 'form-overview',
            title: '低代码概览',
            path: 'form/overview',
            component: 'form/views/FormHome',
            sort: 2,
            menuType: MenuType.MENU,
            permission: 'form:view',
          },
        ],
      },
    ]
    useMenuStore().setMenu(menuWithSwappedSort)
    expect(resolveDefaultRedirect()).toBe('/workspace')
  })

  it('empty menu tree: lands on /workspace（工作台为常量路由，不落 404）', () => {
    useMenuStore().setMenu(emptyMenu)
    expect(resolveDefaultRedirect()).toBe('/workspace')
  })

  it('menu with only BUTTON nodes: lands on /workspace', () => {
    useMenuStore().setMenu([
      {
        id: 'b',
        parentId: null,
        name: 'btn',
        title: '按钮',
        path: 'btn',
        component: null,
        sort: 1,
        menuType: MenuType.BUTTON,
      },
    ])
    expect(resolveDefaultRedirect()).toBe('/workspace')
  })

  it('menu with MENU node missing component: lands on /workspace', () => {
    useMenuStore().setMenu([
      {
        id: 'm',
        parentId: null,
        name: 'no-comp',
        title: '无组件页',
        path: 'no-comp',
        component: null,
        sort: 1,
        menuType: MenuType.MENU,
      },
    ])
    expect(resolveDefaultRedirect()).toBe('/workspace')
  })

  it('menu store not yet populated (initial empty state): lands on /workspace', () => {
    expect(resolveDefaultRedirect()).toBe('/workspace')
  })
})

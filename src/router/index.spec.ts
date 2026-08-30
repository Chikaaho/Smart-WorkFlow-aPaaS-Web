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

describe('router/index resolveDefaultRedirect', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useMenuStore().clearMenu()
  })

  // ── ① 超管登录落首叶 ──────────────────────────────────────

  it('super admin: full mock menu → lands on system/dict (first leaf, sort=1)', () => {
    useMenuStore().setMenu(mockSystemMenu)
    expect(resolveDefaultRedirect()).toBe('system/dict')
  })

  // ── ② 无 system 菜单 → 落该过滤树的首叶 ──────────────────

  it('filtered menu without system: lands on form/overview (first leaf of remaining tree)', () => {
    useMenuStore().setMenu(noSystemMenu)
    // form/overview sort=1 < form/form sort=2 → overview 为首叶
    expect(resolveDefaultRedirect()).toBe('form/overview')
  })

  it('filtered menu: respects sort order when picking first leaf', () => {
    // swap sort: form/form sort=1, form/overview sort=2 → form wins
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
    expect(resolveDefaultRedirect()).toBe('form/form')
  })

  // ── ③ 空树兜底不 404 ─────────────────────────────────────

  it('empty menu tree: falls back to /404', () => {
    useMenuStore().setMenu(emptyMenu)
    expect(resolveDefaultRedirect()).toBe('/404')
  })

  it('menu with only BUTTON nodes: falls back to /404', () => {
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
    expect(resolveDefaultRedirect()).toBe('/404')
  })

  it('menu with MENU node missing component: skipped, falls back to /404', () => {
    useMenuStore().setMenu([
      {
        id: 'm',
        parentId: null,
        name: 'no-comp',
        title: '无组件',
        path: 'no-comp',
        component: null,
        sort: 1,
        menuType: MenuType.MENU,
      },
    ])
    expect(resolveDefaultRedirect()).toBe('/404')
  })

  it('menu store not yet populated (initial empty state): falls back to /404', () => {
    // 守卫未装载时的初始状态 — useMenuStore().menu 为 []
    expect(resolveDefaultRedirect()).toBe('/404')
  })
})

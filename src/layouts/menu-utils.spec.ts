import { describe, it, expect } from 'vitest'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { toFullPath, buildMenuTrail, openedMenuKeys, visibleMenu } from './menu-utils'

const MENU: MenuNode[] = [
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
        name: 'form-form',
        title: '表单设计',
        path: 'form/form',
        component: 'form/views/FormForm',
        sort: 2,
        menuType: MenuType.MENU,
      },
      {
        id: '2-2',
        parentId: '2',
        name: 'form-hidden',
        title: '隐藏项',
        path: 'form/hidden',
        component: 'form/views/Hidden',
        sort: 1,
        menuType: MenuType.MENU,
        hidden: true,
      },
    ],
  },
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
    id: 'b',
    parentId: null,
    name: 'btn',
    title: '按钮',
    path: 'btn',
    component: null,
    sort: 3,
    menuType: MenuType.BUTTON,
  },
]

describe('layouts/menu-utils', () => {
  it('toFullPath maps relative menu paths to absolute, leaving absolute untouched', () => {
    expect(toFullPath(MENU[1])).toBe('/system')
    expect(toFullPath(MENU[0].children![0])).toBe('/form/form')
    expect(toFullPath({ ...MENU[1], path: '/already' })).toBe('/already')
  })

  it('buildMenuTrail returns the root->leaf chain for a nested route', () => {
    const trail = buildMenuTrail(MENU, '/form/form')
    expect(trail.map((n) => n.name)).toEqual(['form', 'form-form'])
  })

  it('buildMenuTrail returns single node for a top-level route, [] for unknown', () => {
    expect(buildMenuTrail(MENU, '/system').map((n) => n.name)).toEqual(['system'])
    expect(buildMenuTrail(MENU, '/nope')).toEqual([])
  })

  it('openedMenuKeys yields the directory ancestors on the active branch', () => {
    expect(openedMenuKeys(MENU, '/form/form')).toEqual(['/form'])
    expect(openedMenuKeys(MENU, '/system')).toEqual([])
  })

  it('visibleMenu drops button + hidden nodes, sorts by sort, recurses into children', () => {
    const visible = visibleMenu(MENU)
    // 顶层按 sort：system(1) 在 form(2) 前；按钮被剔除。
    expect(visible.map((n) => n.name)).toEqual(['system', 'form'])
    // 目录下隐藏子项被剔除，只剩表单设计。
    expect(visible[1].children!.map((n) => n.name)).toEqual(['form-form'])
  })
})

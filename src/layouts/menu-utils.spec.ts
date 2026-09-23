import { describe, it, expect } from 'vitest'
import { MenuType, type MenuNode } from '@/contracts/menu'
import {
  toFullPath,
  buildMenuTrail,
  openedMenuKeys,
  visibleMenu,
  visibleMenuForArea,
} from './menu-utils'

/**
 * v0.1.1 回归：页面节点同样会挂按钮子节点（menu_type=2）。
 * 区域过滤若把「有子节点的页面」当目录递归裁剪，按钮被过滤后整页会被丢弃 ——
 * 这正是「有权限按钮的页面（用户/角色/部门/岗位、流程定义、模板…）在侧栏全部消失」的根因。
 */
describe('visibleMenuForArea 页面与按钮子节点', () => {
  const tree: MenuNode[] = [
    {
      id: '1',
      parentId: null,
      name: 'System',
      title: '系统管理',
      path: 'system',
      component: null,
      sort: 10,
      menuType: MenuType.DIRECTORY,
      children: [
        {
          id: '11',
          parentId: '1',
          name: 'User',
          title: '用户管理',
          path: 'system/user',
          component: 'system/views/UserList',
          sort: 10,
          menuType: MenuType.MENU,
          children: [
            {
              id: '100',
              parentId: '11',
              name: 'UserCreate',
              title: '用户新增',
              path: '',
              component: null,
              sort: 1,
              menuType: MenuType.BUTTON,
              permission: 'system:user:create',
            },
          ],
        },
      ],
    },
  ]

  it('挂按钮的页面仍出现在后台侧栏，按钮自身不下发', () => {
    const visible = visibleMenuForArea(tree, 'admin')
    expect(visible).toHaveLength(1)
    const children = visible[0].children ?? []
    expect(children.map((n) => n.title)).toEqual(['用户管理'])
    expect(children[0].menuType).toBe(MenuType.MENU)
  })
})

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

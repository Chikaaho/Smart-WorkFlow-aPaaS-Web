import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resolveArea, canEnterAdminArea, filterMenuByArea } from './area'
import { useUserStore } from '@/stores/user'
import { useMenuStore } from '@/stores/menu'
import { MenuType, type MenuNode } from '@/contracts/menu'

/**
 * v0.0.2 P55 前后台分层不变量：
 * 页面归属清单判定区域；后台准入只认服务端授权语义（超管/授权菜单树），撤权即收敛。
 */

function node(partial: Partial<MenuNode> & { id: string; path: string }): MenuNode {
  return {
    parentId: null,
    name: partial.id,
    title: partial.id,
    component: null,
    sort: 1,
    menuType: MenuType.MENU,
    ...partial,
  } as MenuNode
}

describe('foundation/area 页面归属清单', () => {
  it('portal 清单命中工作台/流程中心/个人办理/收件箱', () => {
    expect(resolveArea('/workspace')).toBe('portal')
    expect(resolveArea('/workflow/catalog')).toBe('portal')
    expect(resolveArea('/workflow/my-cc')).toBe('portal')
    expect(resolveArea('/workflow/todo')).toBe('portal')
    expect(resolveArea('/workflow/my-instances')).toBe('portal')
    expect(resolveArea('/notify/inbox')).toBe('portal')
  })

  it('个人办理与表单填报深链归前台', () => {
    expect(resolveArea('/workflow/task/task-123')).toBe('portal')
    expect(resolveArea('/form/form-render/leave_form')).toBe('portal')
  })

  it('系统/表单/流程管理/通知模板等归后台', () => {
    expect(resolveArea('/system/user')).toBe('admin')
    expect(resolveArea('/form/form-def-list')).toBe('admin')
    expect(resolveArea('/workflow/defs')).toBe('admin')
    expect(resolveArea('/workflow/instances')).toBe('admin')
    expect(resolveArea('/notify/template')).toBe('admin')
    expect(resolveArea('/notify/record')).toBe('admin')
  })
})

describe('foundation/area 后台准入（服务端授权语义）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useUserStore().clearSession()
    useMenuStore().clearMenu()
  })

  it('superAdmin 短路放行', () => {
    useUserStore().setSession({
      user: {
        id: '1',
        username: 'superadmin',
        displayName: '超管',
        deptId: null,
        tenantId: '1',
      },
      permissions: new Set(),
      roles: new Set(['superadmin']),
      superAdmin: true,
    })
    expect(canEnterAdminArea()).toBe(true)
  })

  it('授权菜单树含后台页面 → 可进后台', () => {
    useUserStore().setSession({
      user: {
        id: '7',
        username: 'admin',
        displayName: '管理员',
        deptId: null,
        tenantId: '1',
      },
      permissions: new Set(),
      roles: new Set(['admin']),
      superAdmin: false,
    })
    useMenuStore().setMenu([
      node({
        id: '2',
        path: 'form',
        menuType: MenuType.DIRECTORY,
        children: [node({ id: '21', path: 'form/form-def-list' })],
      }),
    ])
    expect(canEnterAdminArea()).toBe(true)
  })

  it('普通用户（仅前台菜单）不可进后台；撤权（菜单收敛）后准入同步收敛', () => {
    useUserStore().setSession({
      user: {
        id: '8',
        username: 'employee',
        displayName: '员工',
        deptId: null,
        tenantId: '1',
      },
      permissions: new Set(),
      roles: new Set(['employee']),
      superAdmin: false,
    })
    useMenuStore().setMenu([
      node({
        id: '3',
        path: 'workflow',
        menuType: MenuType.DIRECTORY,
        children: [node({ id: '30', path: 'workflow/todo' })],
      }),
    ])
    expect(canEnterAdminArea()).toBe(false)

    // 撤权模拟：管理员收回 form 目录 → 菜单树只剩前台 → 仍不可进
    useMenuStore().setMenu([
      node({
        id: '3',
        path: 'workflow',
        menuType: MenuType.DIRECTORY,
        children: [node({ id: '30', path: 'workflow/todo' })],
      }),
    ])
    expect(canEnterAdminArea()).toBe(false)
  })
})

describe('foundation/area 菜单按区域过滤', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('前台只保留前台页面与其祖先目录', () => {
    const menu: MenuNode[] = [
      node({
        id: '1',
        path: 'system',
        menuType: MenuType.DIRECTORY,
        children: [node({ id: '11', path: 'system/user' })],
      }),
      node({
        id: '3',
        path: 'workflow',
        menuType: MenuType.DIRECTORY,
        children: [
          node({ id: '30', path: 'workflow/todo' }),
          node({ id: '31', path: 'workflow/defs' }),
        ],
      }),
    ]
    const portal = filterMenuByArea(menu, 'portal')
    expect(portal).toHaveLength(1)
    expect(portal[0].path).toBe('workflow')
    expect(portal[0].children?.map((c) => c.path)).toEqual(['workflow/todo'])
  })
})

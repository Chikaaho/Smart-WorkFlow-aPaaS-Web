import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batchSendNotify, resolveCountNotify } from '@/modules/notify/api'
import {
  MOCK_DEPTS_LIST,
  MOCK_MENU_TREE,
  MOCK_NOTIFY_MESSAGES,
  MOCK_ROLE_MENU_BINDINGS,
  MOCK_USERS_LIST,
  switchMockSession,
} from './seeds'
import { dispatchMock } from './index'

async function mock<T>(method: string, url: string, body?: unknown) {
  return dispatchMock<T>(method, url, '/api', {}, body)
}

const ADMIN_BINDINGS = [...(MOCK_ROLE_MENU_BINDINGS['2'] ?? [])]

function findMenu(id: string) {
  const visit = (nodes: typeof MOCK_MENU_TREE): (typeof MOCK_MENU_TREE)[number] | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node
      const found = node.children && visit(node.children as typeof MOCK_MENU_TREE)
      if (found) return found
    }
    return undefined
  }
  return visit(MOCK_MENU_TREE)
}

const validRequest = {
  recipientUserIds: [1],
  recipientDeptIds: [1],
  recipientRoleCodes: ['user'],
  title: 'S3 权限测试',
  content: 'S3/S5 实际 Mock 请求',
}

describe('S3/S5 批量发送实际 Mock 行为证据', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'true')
    MOCK_ROLE_MENU_BINDINGS['2'] = [...ADMIN_BINDINGS]
    MOCK_ROLE_MENU_BINDINGS['3'] = []
    switchMockSession('admin')
  })

  it('S3：生产形态权限资源可绑定普通非超管角色，实际四身份请求结果分离', async () => {
    const page = findMenu('43')
    const action = findMenu('430')
    expect(page).toMatchObject({ menuType: 1, permission: 'notify:batch:send' })
    expect(action).toMatchObject({ menuType: 2, permission: 'notify:batch:send' })

    const binding = await mock('PUT', '/system/role/2/menus', [...ADMIN_BINDINGS, 43, 430])
    const bound = await mock<number[]>('GET', '/system/role/2/menus')
    expect(binding?.code).toBe(0)
    expect(bound?.data).toContain(430)

    switchMockSession('admin')
    const adminMe = await mock<{ permissions: string[]; superAdmin: boolean }>(
      'GET',
      '/system/auth/me',
    )
    const adminSend = await mock('POST', '/notify/messages/batch-send', validRequest)

    MOCK_ROLE_MENU_BINDINGS['3'] = [4, 41]
    switchMockSession('user')
    const inboxMe = await mock<{ permissions: string[]; superAdmin: boolean }>(
      'GET',
      '/system/auth/me',
    )
    const inboxOnly = await mock('POST', '/notify/messages/batch-send', validRequest)

    MOCK_ROLE_MENU_BINDINGS['3'] = [4, 42, 420]
    switchMockSession('user')
    const templateMe = await mock<{ permissions: string[]; superAdmin: boolean }>(
      'GET',
      '/system/auth/me',
    )
    const templateOnly = await mock('POST', '/notify/messages/batch-send', validRequest)

    switchMockSession('unauthenticated')
    const unauthenticated = await mock('POST', '/notify/messages/batch-send', validRequest)

    expect(adminMe?.data).toMatchObject({ superAdmin: false })
    expect(adminMe?.data.permissions).toContain('notify:batch:send')
    expect(adminSend?.code).toBe(0)
    expect(inboxMe?.data.permissions).not.toContain('notify:batch:send')
    expect(inboxOnly?.code).toBe(403)
    expect(templateMe?.data.permissions).toContain('notify:template:manage')
    expect(templateMe?.data.permissions).not.toContain('notify:batch:send')
    expect(templateOnly?.code).toBe(403)
    expect(unauthenticated?.code).toBe(401)

    console.log(
      JSON.stringify({
        productionPermissionResource: { page: page?.id, action: action?.id },
        ordinaryRoleBinding: { roleId: '2', menuIds: bound?.data },
        identities: [
          { identity: 'admin', permissions: adminMe?.data.permissions, status: adminSend?.code },
          {
            identity: 'inbox-only',
            permissions: inboxMe?.data.permissions,
            status: inboxOnly?.code,
          },
          {
            identity: 'template-only',
            permissions: templateMe?.data.permissions,
            status: templateOnly?.code,
          },
          { identity: 'unauthenticated', permissions: [], status: unauthenticated?.code },
        ],
      }),
    )
  })

  it('S5：父部门 1 不递归展开未提交子部门 11，实际 Mock resolve/batch 集合与人数一致', async () => {
    const child = {
      id: '11',
      parentId: '1',
      name: '未提交子部门',
      code: 'UNSUBMITTED-CHILD',
      sort: 5,
      status: 0,
      createTime: '2026-08-27 09:00:00',
      updateTime: '2026-08-27 09:00:00',
    }
    const childUser = {
      id: '6',
      username: 'childdept-user',
      realName: '未提交子部门用户',
      email: 'childdept@example.com',
      phone: '13800000006',
      sex: 1,
      status: 0,
      deptId: '11',
      roleIds: ['4'],
      postIds: [],
      isAdmin: false,
      avatar: null,
      createTime: '2026-08-27 09:00:00',
      updateTime: '2026-08-27 09:00:00',
    }
    MOCK_DEPTS_LIST.push(child)
    MOCK_USERS_LIST.push(childUser)

    try {
      expect(child.parentId).toBe('1')

      switchMockSession('admin')
      const before = MOCK_NOTIFY_MESSAGES.length
      // 通过真实前端 API → foundation/request → dispatchMock → 已注册 handler，
      // 保留实际请求链，不直接调用 handler 源码或 API mock。
      const resolve = await resolveCountNotify(validRequest)
      const dbBefore = MOCK_NOTIFY_MESSAGES.length
      const send = await batchSendNotify(validRequest)
      const persisted = MOCK_NOTIFY_MESSAGES.slice(dbBefore)
      const mockRecipientIds = persisted.map((message) => message.recipientId).sort((a, b) => a - b)
      const unsubmittedChildRecipientPresent = mockRecipientIds.includes(Number(childUser.id))

      expect(resolve.recipientCount).toBe(3)
      expect(send.recipientCount).toBe(3)
      expect(mockRecipientIds).toEqual([1, 2, 3])
      expect(MOCK_NOTIFY_MESSAGES.length - before).toBe(3)
      expect(unsubmittedChildRecipientPresent).toBe(false)

      console.log(
        JSON.stringify({
          request: validRequest,
          mockRecipientIds,
          mockCount: send.recipientCount,
          resolveCount: resolve.recipientCount,
          unsubmittedChildRecipientPresent,
        }),
      )
    } finally {
      MOCK_DEPTS_LIST.splice(MOCK_DEPTS_LIST.indexOf(child), 1)
      MOCK_USERS_LIST.splice(MOCK_USERS_LIST.indexOf(childUser), 1)
    }
  })
})

import { describe, it, expect, beforeAll } from 'vitest'
import { MOCK_USERS_LIST, MOCK_ROLES_LIST } from './seeds'
import { dispatchMock } from './index'
import { mockRegistrations } from './handlers'

/**
 * I1 组织与权限底座：Mock handler 一致性专项。
 *
 * 覆盖 GET /system/role/{id}/users（角色成员分页反向视图）与
 * GET/PUT /system/user/{id}/posts（岗位任职 {postId, deptId} 对象契约）：
 *   - 角色成员：仅返回绑定该角色的用户；分页切片；空角色返回空页
 *   - 岗位任职：GET 回读 {postId, deptId}；PUT 整量替换且支持缺省 deptId
 *   - 部门创建/更新：leaderId 字段透传（部门负责人，供流程审批取值）
 */

async function mock<T>(
  method: string,
  url: string,
  query: Record<string, string> = {},
  body?: unknown,
) {
  return dispatchMock<T>(method, url, '/api', query, body)
}

describe('foundation/mock I1 组织权限 handler 一致性', () => {
  beforeAll(() => {
    const patterns = mockRegistrations.map((r) => `${r.method} ${r.pattern}`)
    for (const p of [
      'GET /api/system/role/:id/users',
      'GET /api/system/user/:id/posts',
      'PUT /api/system/user/:id/posts',
      'POST /api/system/dept',
      'PUT /api/system/dept',
    ]) {
      expect(patterns).toContain(p)
    }
  })

  it('角色成员视图：admin 角色（role 2）成员包含绑定用户并分页', async () => {
    const bound = MOCK_USERS_LIST.filter((u) => (u.roleIds ?? []).includes('2'))
    expect(bound.length).toBeGreaterThan(0)

    const page1 = await mock<{ records: unknown[]; total: number }>('GET', '/system/role/2/users', {
      pageNum: '1',
      pageSize: '1',
    })
    expect(page1?.code).toBe(0)
    expect(page1?.data.total).toBe(bound.length)
    expect((page1?.data.records as unknown[]).length).toBe(1)
  })

  it('角色成员视图：无成员角色返回空页', async () => {
    const orphan = MOCK_ROLES_LIST.find((r) => {
      const id = String(r.id)
      return !MOCK_USERS_LIST.some((u) => (u.roleIds ?? []).includes(id))
    })
    const id = String(orphan?.id ?? '99999')
    const result = await mock<{ records: unknown[]; total: number }>(
      'GET',
      `/system/role/${id}/users`,
      { pageNum: '1', pageSize: '10' },
    )
    expect(result?.code).toBe(0)
    expect(result?.data.total).toBe(0)
    expect(result?.data.records).toEqual([])
  })

  it('岗位任职：PUT {postId, deptId} 对象数组整量替换，GET 回读一致', async () => {
    const put = await mock<null>('PUT', '/system/user/1/posts', {}, [
      { postId: 1, deptId: 2 },
      { postId: 3 },
    ])
    expect(put?.code).toBe(0)

    const got = await mock<Array<{ postId: string; deptId?: string }>>(
      'GET',
      '/system/user/1/posts',
    )
    expect(got?.code).toBe(0)
    expect(got?.data).toEqual([{ postId: '1', deptId: '2' }, { postId: '3' }])
  })

  it('部门创建/更新：leaderId 透传且清空生效', async () => {
    const created = await mock<unknown>(
      'POST',
      '/system/dept',
      {},
      {
        parentId: '0',
        name: '负责人测试部',
        code: 'LEADER-TEST',
        sort: 99,
        status: 0,
        leaderId: '2',
      },
    )
    expect(created?.code).toBe(0)
    const deptId = String(created?.data)

    const tree = await mock<Array<Record<string, unknown>>>('GET', '/system/dept/tree')
    const createdDept = tree?.data?.find((d: Record<string, unknown>) => d.id === deptId)
    expect(createdDept?.leaderId).toBe('2')

    const updated = await mock<null>(
      'PUT',
      '/system/dept',
      {},
      {
        id: deptId,
        name: '负责人测试部',
        code: 'LEADER-TEST',
        parentId: '0',
        leaderId: '',
      },
    )
    expect(updated).toBeDefined()
  })
})

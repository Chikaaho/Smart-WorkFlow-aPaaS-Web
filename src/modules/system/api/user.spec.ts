import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import {
  pageUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getUserRoles,
  updateUserRoles,
  getUserPosts,
  updateUserPosts,
} from './user'

const mockRequest = vi.mocked(request)

describe('modules/system/api/user — 用户管理 7 个', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  // ─── pageUsers ───

  it('pageUsers: POST /system/user/page with params + body, adapts records→list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [{ id: '1', username: 'admin', realName: '管理员', status: 0 }],
      total: 100,
      pageNum: 1,
      pageSize: 10,
    })

    const result = await pageUsers({ pageNum: 1, pageSize: 10 }, { username: 'admin' })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/user/page',
        params: { pageNum: 1, pageSize: 10 },
        data: expect.objectContaining({ username: 'admin', keyword: 'admin' }),
      }),
    )
    expect(result.list).toHaveLength(1)
    expect(result.list[0].username).toBe('admin')
    expect(result.total).toBe(100)
  })

  it('pageUsers: empty params when filter is empty', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })
    await pageUsers({ pageNum: 1, pageSize: 10 }, {})
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { pageNum: 1, pageSize: 10 },
        data: {},
      }),
    )
  })

  // ─── getUser ───

  it('getUser: GET /system/user/{id}', async () => {
    const item = { id: '1', username: 'admin', realName: '管理员', status: 0 }
    mockRequest.mockResolvedValueOnce(item)

    const result = await getUser('1')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/user/1' }),
    )
    expect(result).toEqual(item)
  })

  // ─── createUser ───

  it('createUser: POST /system/user with UserFormRequest (含 plainPassword) → Long (string)', async () => {
    mockRequest.mockResolvedValueOnce('99')
    const id = await createUser({
      username: 'newuser',
      realName: '新用户',
      plainPassword: 'p@ss1234',
      status: 0,
    })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/user',
        data: expect.objectContaining({ username: 'newuser', plainPassword: 'p@ss1234' }),
      }),
    )
    expect(id).toBe('99')
  })

  it('createUser: without plainPassword does not throw', async () => {
    mockRequest.mockResolvedValueOnce('100')
    const id = await createUser({ username: 'nopwd', status: 0 })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/user',
        data: { username: 'nopwd', status: 0 },
      }),
    )
    expect(id).toBe('100')
  })

  // ─── updateUser ───

  it('updateUser: PUT /system/user with UserFormRequest (含 plainPassword) → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await updateUser({
      id: '1',
      username: 'updated',
      realName: '已更新',
      plainPassword: 'newp@ss',
      status: 0,
    })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/system/user',
        data: expect.objectContaining({ id: '1', plainPassword: 'newp@ss' }),
      }),
    )
  })

  // ─── deleteUser ───

  it('deleteUser: DELETE /system/user/{id} → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await deleteUser('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', url: '/system/user/1' }),
    )
  })

  it('岗位和角色关系端点：按用户读取并替换，支持清空数组', async () => {
    mockRequest.mockResolvedValue(undefined)
    await getUserRoles('1')
    await updateUserRoles('1', [])
    await getUserPosts('1')
    await updateUserPosts('1', [])
    expect(mockRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: 'GET', url: '/system/user/1/roles' }),
    )
    expect(mockRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'PUT', url: '/system/user/1/roles', data: [] }),
    )
    expect(mockRequest).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ method: 'GET', url: '/system/user/1/posts' }),
    )
    expect(mockRequest).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ method: 'PUT', url: '/system/user/1/posts', data: [] }),
    )
  })
})

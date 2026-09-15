import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import { getRoleMembers } from './role'
import { getUserPosts, updateUserPosts } from './user'

const mockRequest = vi.mocked(request)

/**
 * I1 组织与权限底座（P60）新增 API 契约：
 * - GET /system/role/{id}/users 角色成员分页（成员维护反向视图）
 * - GET/PUT /system/user/{id}/posts 岗位任职 {postId, deptId} 对象数组（防腐转换）
 */

describe('modules/system/api — I1 组织权限契约', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  it('getRoleMembers: GET /system/role/{id}/users?pageNum=&pageSize=，records→list 防腐', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [
        { id: '8', username: 'zhang', realName: '张三', status: 0 },
        { id: '9', username: 'li', realName: '李四', status: 0 },
      ],
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })

    const result = await getRoleMembers('2', { pageNum: 1, pageSize: 10 })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/system/role/2/users',
        params: { pageNum: 1, pageSize: 10 },
      }),
    )
    expect(result.list).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.list[0]?.username).toBe('zhang')
  })

  it('getUserPosts: 后端 {postId, deptId} 数字对 → string 对象数组（deptId 缺省剔除）', async () => {
    mockRequest.mockResolvedValueOnce([
      { postId: 1, deptId: 2 },
      { postId: '3' },
      { postId: 4, deptId: null },
    ])

    const posts = await getUserPosts('1')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/user/1/posts' }),
    )
    expect(posts).toEqual([{ postId: '1', deptId: '2' }, { postId: '3' }, { postId: '4' }])
  })

  it('updateUserPosts: string 对象数组 → {postId: number, deptId?: number} 载荷', async () => {
    mockRequest.mockResolvedValueOnce(undefined)

    await updateUserPosts('1', [{ postId: '1', deptId: '2' }, { postId: '2' }])

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/system/user/1/posts',
        data: [{ postId: 1, deptId: 2 }, { postId: 2 }],
      }),
    )
  })
})

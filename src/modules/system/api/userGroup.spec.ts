import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import {
  pageUserGroups,
  getUserGroup,
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
  disableUserGroup,
  enableUserGroup,
  getUserGroupMembers,
  updateUserGroupMembers,
  addUserGroupMembers,
  removeUserGroupMembers,
  getUserGroupCandidates,
} from './userGroup'

const mockRequest = vi.mocked(request)

describe('modules/system/api/userGroup — 用户组 11 个', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  it('pageUserGroups: POST /system/user-group/page with params + body filter, adapts records→list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [{ id: '1', groupCode: 'G-TECH', groupName: '技术委员会', status: 0 }],
      total: 100,
      pageNum: 1,
      pageSize: 10,
    })

    const result = await pageUserGroups(
      { pageNum: 1, pageSize: 10 },
      { groupName: '技术', status: 0 },
    )

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/user-group/page',
        params: { pageNum: 1, pageSize: 10 },
        data: expect.objectContaining({ groupName: '技术', status: 0 }),
      }),
    )
    expect(result.list).toHaveLength(1)
    expect(result.total).toBe(100)
  })

  it('getUserGroup: GET /system/user-group/:id', async () => {
    mockRequest.mockResolvedValueOnce({
      id: '1',
      groupCode: 'G-TECH',
      groupName: '技术委员会',
      memberIds: ['2'],
    })
    const result = await getUserGroup('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/user-group/1' }),
    )
    expect(result.groupCode).toBe('G-TECH')
    expect(result.memberIds).toEqual(['2'])
  })

  it('createUserGroup: POST /system/user-group with memberIds', async () => {
    mockRequest.mockResolvedValueOnce(101)
    const id = await createUserGroup({
      groupCode: 'G-101',
      groupName: '新组',
      memberIds: ['2', '3'],
    })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/user-group',
        data: expect.objectContaining({ groupCode: 'G-101', memberIds: ['2', '3'] }),
      }),
    )
    expect(id).toBe(101)
  })

  it('updateUserGroup: PUT /system/user-group', async () => {
    mockRequest.mockResolvedValueOnce(null)
    await updateUserGroup({ id: '1', groupCode: 'G-TECH', groupName: '技术委员会改名' })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/system/user-group',
        data: expect.objectContaining({ id: '1', groupName: '技术委员会改名' }),
      }),
    )
  })

  it('deleteUserGroup: DELETE /system/user-group/:id', async () => {
    mockRequest.mockResolvedValueOnce(null)
    await deleteUserGroup('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', url: '/system/user-group/1' }),
    )
  })

  it('disable/enable: PUT /system/user-group/:id/disable|enable', async () => {
    mockRequest.mockResolvedValueOnce(null)
    await disableUserGroup('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT', url: '/system/user-group/1/disable' }),
    )
    await enableUserGroup('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT', url: '/system/user-group/1/enable' }),
    )
  })

  it('members: GET /:id/members → ID 列表', async () => {
    mockRequest.mockResolvedValueOnce(['2', '3'])
    const result = await getUserGroupMembers('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/user-group/1/members' }),
    )
    expect(result).toEqual(['2', '3'])
  })

  it('updateMembers: PUT /:id/members 整量替换（空数组=清空）', async () => {
    mockRequest.mockResolvedValueOnce(null)
    await updateUserGroupMembers('1', [])
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT', url: '/system/user-group/1/members', data: [] }),
    )
  })

  it('addMembers/removeMembers: POST/DELETE /:id/members', async () => {
    mockRequest.mockResolvedValueOnce(null)
    await addUserGroupMembers('1', ['4'])
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', url: '/system/user-group/1/members', data: ['4'] }),
    )
    await removeUserGroupMembers('1', ['4'])
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: '/system/user-group/1/members',
        data: ['4'],
      }),
    )
  })

  it('candidates: GET /system/user-group/candidates with keyword', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [{ id: '2', username: 'zhangsan', realName: '张三', status: 0 }],
      total: 1,
      pageNum: 1,
      pageSize: 20,
    })
    const result = await getUserGroupCandidates({ pageNum: 1, pageSize: 20 }, '张三')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/system/user-group/candidates',
        params: expect.objectContaining({ keyword: '张三' }),
      }),
    )
    expect(result.list[0].username).toBe('zhangsan')
  })
})

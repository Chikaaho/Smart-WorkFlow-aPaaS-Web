import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import {
  pageRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getRoleMenus,
  updateRoleMenus,
} from './role'

const mockRequest = vi.mocked(request)

describe('modules/system/api/role — 角色管理 8 个', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  // ─── pageRoles ───

  it('pageRoles: POST /system/role/page with params + body, adapts records→list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [{ id: '1', name: '管理员', code: 'admin', status: 1 }],
      total: 50,
      pageNum: 1,
      pageSize: 10,
    })

    const result = await pageRoles({ pageNum: 1, pageSize: 10 }, { name: '管理员' })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/role/page',
        params: { pageNum: 1, pageSize: 10 },
        data: { name: '管理员' },
      }),
    )
    expect(result.list).toHaveLength(1)
    expect(result.list[0].code).toBe('admin')
    expect(result.total).toBe(50)
  })

  it('pageRoles: empty filter', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })
    await pageRoles({ pageNum: 1, pageSize: 10 }, {})
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { pageNum: 1, pageSize: 10 },
        data: {},
      }),
    )
  })

  // ─── getRole ───

  it('getRole: GET /system/role/{id}', async () => {
    const item = { id: '1', name: '管理员', code: 'admin', status: 1 }
    mockRequest.mockResolvedValueOnce(item)

    const result = await getRole('1')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/role/1' }),
    )
    expect(result).toEqual(item)
  })

  // ─── createRole ───

  it('createRole: POST /system/role with body → Long (string)', async () => {
    mockRequest.mockResolvedValueOnce('42')
    const id = await createRole({ name: '测试角色', code: 'test', status: 1 })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/role',
        data: { name: '测试角色', code: 'test', status: 1 },
      }),
    )
    expect(id).toBe('42')
  })

  // ─── updateRole ───

  it('updateRole: PUT /system/role with body → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await updateRole({ id: '1', name: 'updated', code: 'test', status: 1 })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/system/role',
        data: { id: '1', name: 'updated', code: 'test', status: 1 },
      }),
    )
  })

  // ─── deleteRole ───

  it('deleteRole: DELETE /system/role/{id} → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await deleteRole('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', url: '/system/role/1' }),
    )
  })

  // ─── getRoleMenus / updateRoleMenus（M02-F02/F03 契约） ───

  it('getRoleMenus: GET /system/role/{id}/menus，后端数字数组 → string[]（防腐转换）', async () => {
    // 后端契约 R<List<Long>>：元素为数字（step1 §5：Long 序列化为数字）
    mockRequest.mockResolvedValueOnce([1, 11, 12, 110])

    const result = await getRoleMenus('2')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/role/2/menus' }),
    )
    expect(result).toEqual(['1', '11', '12', '110'])
  })

  it('getRoleMenus: 空绑定 → []（清空语义可回填）', async () => {
    mockRequest.mockResolvedValueOnce([])
    const result = await getRoleMenus('3')
    expect(result).toEqual([])
  })

  it('updateRoleMenus: PUT /system/role/{id}/menus，string[] → 数字数组载荷（防腐转换）', async () => {
    mockRequest.mockResolvedValueOnce(null)
    await updateRoleMenus('2', ['1', '11', '12', '110'])
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/system/role/2/menus',
        data: [1, 11, 12, 110],
      }),
    )
  })

  it('updateRoleMenus: 空数组 → 载荷 []（清空），返回 void', async () => {
    mockRequest.mockResolvedValueOnce(null)
    await updateRoleMenus('2', [])
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT', url: '/system/role/2/menus', data: [] }),
    )
  })
})

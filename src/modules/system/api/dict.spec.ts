import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import {
  pageDictTypes,
  getDictType,
  createDictType,
  updateDictType,
  deleteDictType,
  pageDictData,
  getDictData,
  createDictData,
  updateDictData,
  deleteDictData,
} from './dict'

const mockRequest = vi.mocked(request)

describe('modules/system/api/dict — 字典类型 5 个', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  // ─── pageDictTypes ───

  it('pageDictTypes: POST /system/dict/type/page with params + body, adapts records→list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [{ id: '1', name: '性别', code: 'gender', status: 1 }],
      total: 100,
      pageNum: 1,
      pageSize: 10,
    })

    const result = await pageDictTypes({ pageNum: 1, pageSize: 10 }, { name: '性别' })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/dict/type/page',
        params: { pageNum: 1, pageSize: 10 },
        data: { name: '性别' },
      }),
    )
    expect(result.list).toHaveLength(1)
    expect(result.list[0].code).toBe('gender')
    expect(result.total).toBe(100)
  })

  it('pageDictTypes: empty params when filter is empty', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })
    await pageDictTypes({ pageNum: 1, pageSize: 10 }, {})
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { pageNum: 1, pageSize: 10 },
        data: {},
      }),
    )
  })

  // ─── getDictType ───

  it('getDictType: GET /system/dict/type/{id}', async () => {
    const item = { id: '1', name: '性别', code: 'gender', status: 1 }
    mockRequest.mockResolvedValueOnce(item)

    const result = await getDictType('1')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/dict/type/1' }),
    )
    expect(result).toEqual(item)
  })

  // ─── createDictType ───

  it('createDictType: POST /system/dict/type with body → Long (string)', async () => {
    mockRequest.mockResolvedValueOnce('99')
    const id = await createDictType({ name: 'test', code: 'test', status: 1 })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/dict/type',
        data: { name: 'test', code: 'test', status: 1 },
      }),
    )
    expect(id).toBe('99')
  })

  // ─── updateDictType ───

  it('updateDictType: PUT /system/dict/type with body → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await updateDictType({ id: '1', name: 'updated', code: 'test', status: 1 })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/system/dict/type',
        data: { id: '1', name: 'updated', code: 'test', status: 1 },
      }),
    )
  })

  // ─── deleteDictType ───

  it('deleteDictType: DELETE /system/dict/type/{id} → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await deleteDictType('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', url: '/system/dict/type/1' }),
    )
  })
})

describe('modules/system/api/dict — 字典项 5 个', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  // ─── pageDictData ───

  it('pageDictData: POST /system/dict/data/page with params + body, adapts records→list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [
        {
          id: '1',
          dictCode: 'gender',
          label: '男',
          dictValue: 'male',
          sort: 1,
          status: 1,
          isDefault: 0,
        },
      ],
      total: 2,
      pageNum: 1,
      pageSize: 10,
    })

    const result = await pageDictData(
      { pageNum: 1, pageSize: 10 },
      { dictCode: 'gender', label: '男' },
    )

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/dict/data/page',
        params: { pageNum: 1, pageSize: 10 },
        data: { dictCode: 'gender', label: '男' },
      }),
    )
    expect(result.list).toHaveLength(1)
    expect(result.list[0].dictValue).toBe('male')
    expect(result.total).toBe(2)
  })

  // ─── getDictData ───

  it('getDictData: GET /system/dict/data/{id}', async () => {
    const item = {
      id: '1',
      dictCode: 'gender',
      label: '男',
      dictValue: 'male',
      sort: 1,
      status: 1,
      isDefault: 0,
    }
    mockRequest.mockResolvedValueOnce(item)

    const result = await getDictData('1')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/dict/data/1' }),
    )
    expect(result).toEqual(item)
  })

  // ─── createDictData ───

  it('createDictData: POST /system/dict/data with body → Long (string)', async () => {
    mockRequest.mockResolvedValueOnce('42')
    const id = await createDictData({
      dictCode: 'gender',
      label: '女',
      dictValue: 'female',
      sort: 2,
      status: 1,
      isDefault: 0,
    })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/dict/data',
        data: expect.objectContaining({ dictCode: 'gender', label: '女' }),
      }),
    )
    expect(id).toBe('42')
  })

  // ─── updateDictData ───

  it('updateDictData: PUT /system/dict/data with body → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await updateDictData({
      id: '1',
      dictCode: 'gender',
      label: '女',
      dictValue: 'female',
      sort: 2,
      status: 1,
      isDefault: 0,
    })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/system/dict/data',
        data: expect.objectContaining({ id: '1' }),
      }),
    )
  })

  // ─── deleteDictData ───

  it('deleteDictData: DELETE /system/dict/data/{id} → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await deleteDictData('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', url: '/system/dict/data/1' }),
    )
  })
})

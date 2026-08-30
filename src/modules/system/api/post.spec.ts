import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import { pagePosts, getPost, createPost, updatePost, deletePost } from './post'

const mockRequest = vi.mocked(request)

describe('modules/system/api/post — 岗位管理 6 个', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  // ─── pagePosts ───

  it('pagePosts: POST /system/post/page with params + body, adapts records→list', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [{ id: '1', code: 'dev', name: '开发工程师', status: 1 }],
      total: 30,
      pageNum: 1,
      pageSize: 10,
    })

    const result = await pagePosts({ pageNum: 1, pageSize: 10 }, { code: 'dev' })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/post/page',
        params: { pageNum: 1, pageSize: 10 },
        data: { code: 'dev' },
      }),
    )
    expect(result.list).toHaveLength(1)
    expect(result.list[0].name).toBe('开发工程师')
    expect(result.total).toBe(30)
  })

  it('pagePosts: empty filter', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })
    await pagePosts({ pageNum: 1, pageSize: 10 }, {})
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { pageNum: 1, pageSize: 10 },
        data: {},
      }),
    )
  })

  // ─── getPost ───

  it('getPost: GET /system/post/{id}', async () => {
    const item = { id: '1', code: 'dev', name: '开发工程师', status: 1 }
    mockRequest.mockResolvedValueOnce(item)

    const result = await getPost('1')

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/system/post/1' }),
    )
    expect(result).toEqual(item)
  })

  // ─── createPost ───

  it('createPost: POST /system/post with body → Long (string)', async () => {
    mockRequest.mockResolvedValueOnce('7')
    const id = await createPost({ code: 'pm', name: '产品经理', status: 1 })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/post',
        data: { code: 'pm', name: '产品经理', status: 1 },
      }),
    )
    expect(id).toBe('7')
  })

  // ─── updatePost ───

  it('updatePost: PUT /system/post with body → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await updatePost({ id: '1', code: 'dev', name: '高级开发', status: 1 })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: '/system/post',
        data: { id: '1', code: 'dev', name: '高级开发', status: 1 },
      }),
    )
  })

  // ─── deletePost ───

  it('deletePost: DELETE /system/post/{id} → void', async () => {
    mockRequest.mockResolvedValueOnce(undefined)
    await deletePost('1')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', url: '/system/post/1' }),
    )
  })
})

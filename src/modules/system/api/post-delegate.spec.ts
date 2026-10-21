import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/foundation/request', () => ({ request: vi.fn() }))

import { request } from '@/foundation/request'
import { pagePostDelegates } from './post-delegate'

const mockRequest = vi.mocked(request)

describe('modules/system/api/post-delegate', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  it('pagePostDelegates: 后端 records/total 字符串适配为 list/total number', async () => {
    mockRequest.mockResolvedValueOnce({
      records: [
        {
          id: '1',
          sourcePostId: '10',
          targetPostId: '20',
          scopeType: 'ORG',
          status: 'ENABLED',
        },
      ],
      total: '42',
      pageNum: '1',
      pageSize: '10',
    })

    const result = await pagePostDelegates(1, 10, { status: 'ENABLED' })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/system/post-delegate/page?pageNum=1&pageSize=10',
        data: { status: 'ENABLED' },
      }),
    )
    expect(result.list).toHaveLength(1)
    expect(result.list[0]!.sourcePostId).toBe('10')
    expect(result.total).toBe(42)
  })

  it('pagePostDelegates: 未传筛选时提交空对象', async () => {
    mockRequest.mockResolvedValueOnce({ records: [], total: 0, pageNum: 1, pageSize: 10 })

    const result = await pagePostDelegates(2, 20)

    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ data: {} }))
    expect(result.list).toEqual([])
  })
})

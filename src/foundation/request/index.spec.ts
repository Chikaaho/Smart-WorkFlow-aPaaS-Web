import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }))

vi.mock('axios', () => {
  const client = {
    request: mockRequest,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    defaults: { baseURL: '/api' },
  }
  const axiosInstance = Object.assign(
    vi.fn(() => client),
    {
      create: vi.fn(() => client),
    },
  )
  return { default: axiosInstance }
})

import { request, ApiError } from './index'

describe('request 非 2xx 归一（S1 读取权限拒绝态前置）', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  it('HTTP 403 + R 结构体 → 抛 ApiError(403)，携带后端 msg', async () => {
    mockRequest.mockRejectedValueOnce({
      response: { status: 403, data: { code: 403, msg: '无权限', data: null } },
    })
    const err = await request({ method: 'GET', url: '/s1-test/unmatched' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe(403)
    expect((err as ApiError).msg).toBe('无权限')
  })

  it('HTTP 403 + 响应体不可解析 → 兜底 ApiError(403)', async () => {
    mockRequest.mockRejectedValueOnce({ response: { status: 403, data: 'gateway text' } })
    const err = await request({ method: 'GET', url: '/s1-test/unmatched' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe(403)
  })

  it('业务层 HTTP 200 + code≠0 → ApiError（既有管线不回退）', async () => {
    mockRequest.mockResolvedValueOnce({ data: { code: 1300, msg: '表单不存在', data: null } })
    const err = await request({ method: 'GET', url: '/s1-test/unmatched' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe(1300)
  })
})

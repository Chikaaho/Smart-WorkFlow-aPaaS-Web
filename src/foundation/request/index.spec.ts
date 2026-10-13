import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockRequest, mockRequestInterceptor } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockRequestInterceptor: vi.fn(),
}))

vi.mock('axios', () => {
  const client = {
    request: mockRequest,
    interceptors: {
      request: {
        use: vi.fn((handler: unknown) =>
          mockRequestInterceptor.mockImplementation(handler as never),
        ),
      },
      response: { use: vi.fn() },
    },
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

  it('真实请求在进入 axios 前注入非秘密 X-Request-Id', async () => {
    const config = {
      method: 'get',
      url: '/workflow/tasks/todo',
      headers: new Headers(),
    }
    const intercepted = await mockRequestInterceptor(config)

    expect(intercepted.headers.get('X-Request-Id')).toMatch(/^web-/)
  })
})

// ========== BF20261013-001：401 无感刷新重放 ==========

const { mockRefresh, mockUnauthorized } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockUnauthorized: vi.fn(),
}))

async function getResponseErrorHandler(): Promise<(error: unknown) => Promise<unknown>> {
  const axiosMod = await import('axios')
  const created = (
    axiosMod.default as unknown as {
      create: () => { interceptors: { response: { use: { mock: { calls: unknown[][] } } } } }
    }
  ).create()
  const calls = created.interceptors.response.use.mock.calls
  return calls[0][1] as (error: unknown) => Promise<unknown>
}

describe('request 401 无感刷新重放（BF20261013-001）', () => {
  beforeEach(async () => {
    mockRequest.mockReset()
    mockRefresh.mockReset()
    mockUnauthorized.mockReset()
    const { setRefreshHandler, setUnauthorizedHandler } = await import('./index')
    setRefreshHandler(mockRefresh)
    setUnauthorizedHandler(mockUnauthorized)
    vi.stubGlobal('window', { location: { pathname: '/workspace', search: '?a=1' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function axiosErrorWith(
    status: number,
    url = '/workflow/tasks/todo',
    extra: Record<string, unknown> = {},
  ) {
    return {
      response: { status },
      config: { url, headers: new Headers(), ...extra },
    }
  }

  it('401 → 单飞 refresh 成功 → 重放原请求并返回其结果，不跳登录', async () => {
    const handler = await getResponseErrorHandler()
    mockRefresh.mockResolvedValueOnce(undefined)
    // 直接调用错误拦截器：原始请求不经 mock，重放是 mockRequest 的第一次调用
    mockRequest.mockResolvedValueOnce({ data: { code: 0, msg: 'success', data: { ok: 1 } } })

    const result = await handler(axiosErrorWith(401))

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(mockUnauthorized).not.toHaveBeenCalled()
    expect(result).toEqual({ data: { code: 0, msg: 'success', data: { ok: 1 } } })
  })

  it('401 → refresh 失败 → 调 unauthorizedHandler 且原错误继续抛出', async () => {
    const handler = await getResponseErrorHandler()
    mockRefresh.mockRejectedValueOnce(new Error('rt invalid'))
    const original = axiosErrorWith(401)

    await expect(handler(original)).rejects.toBe(original)
    expect(mockUnauthorized).toHaveBeenCalledTimes(1)
    expect(mockUnauthorized).toHaveBeenCalledWith('/workspace?a=1')
  })

  it('重放后仍 401（_auth401Retried 标记）→ 不再二次 refresh，直接跳登录', async () => {
    const handler = await getResponseErrorHandler()
    mockRefresh.mockResolvedValueOnce(undefined)
    const config = { url: '/workflow/tasks/todo', headers: new Headers(), _auth401Retried: true }
    const retried401 = { response: { status: 401 }, config }

    await expect(handler(retried401)).rejects.toBe(retried401)
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(mockUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('auth 端点自身的 401 不触发无感重放与跳登录', async () => {
    const handler = await getResponseErrorHandler()
    const authErr = axiosErrorWith(401, '/auth/refresh')

    await expect(handler(authErr)).rejects.toBe(authErr)
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(mockUnauthorized).not.toHaveBeenCalled()
  })
})

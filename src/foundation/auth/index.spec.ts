import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getAccessToken,
  getCurrentUsername,
  getTokenExpiresAt,
  clearToken,
  setTokenResponse,
} from './token'

// Mock foundation/request — vi.hoisted ensures the factory can reference mockRequest
const mockRequest = vi.hoisted(() => vi.fn())
vi.mock('@/foundation/request', () => ({
  request: mockRequest,
}))

import { login, logout, refresh, fetchChallenge } from './index'
import type { LoginChallengeDTO } from './rsa'

const CHALLENGE: LoginChallengeDTO = {
  captchaImage: 'data:image/png;base64,MOCK',
  captchaId: 'uuid-1',
  publicKey: 'MOCK_SPKI',
  keyVersion: 'v1',
  expiresIn: 300,
  serverTime: Date.now(),
}

// WebCrypto 加密是异步外部能力，测试中打桩（契约由 rsa.spec 覆盖）
vi.mock('./rsa', () => ({
  encryptPassword: vi.fn(async (_key: string, password: string) => 'encrypted:' + password),
}))

describe('auth operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearToken()
  })

  describe('fetchChallenge', () => {
    it('should call GET /auth/challenge and return challenge DTO', async () => {
      mockRequest.mockResolvedValueOnce(CHALLENGE)
      const challenge = await fetchChallenge()
      expect(mockRequest).toHaveBeenCalledWith({ method: 'GET', url: '/auth/challenge' })
      expect(challenge.captchaId).toBe('uuid-1')
      expect(challenge.publicKey).toBe('MOCK_SPKI')
    })
  })

  describe('login', () => {
    it('should encrypt password and POST five-field login payload', async () => {
      mockRequest.mockResolvedValueOnce({ accessToken: 'jwt-token', expiresIn: 900 })
      await login({
        username: 'admin',
        password: 'admin123',
        captcha: 'ab3d',
        challenge: CHALLENGE,
      })
      expect(mockRequest).toHaveBeenCalledTimes(1)
      const call = mockRequest.mock.calls[0][0] as {
        method: string
        url: string
        data: Record<string, string>
      }
      expect(call.method).toBe('POST')
      expect(call.url).toBe('/auth/login')
      expect(call.data.username).toBe('admin')
      expect(call.data.password).toBe('encrypted:admin123')
      expect(call.data.captcha).toBe('ab3d')
      expect(call.data.captchaId).toBe('uuid-1')
      expect(call.data.timestamp).toMatch(/^\d+$/)
      expect(getAccessToken()).toBe('jwt-token')
      expect(getCurrentUsername()).toBe('admin')
      expect(getTokenExpiresAt()).toBeGreaterThan(Date.now())
    })

    it('should propagate login failure and not store token', async () => {
      mockRequest.mockRejectedValueOnce(new Error('验证码错误'))
      await expect(
        login({ username: 'admin', password: 'admin123', captcha: 'zzzz', challenge: CHALLENGE }),
      ).rejects.toThrow('验证码错误')
      expect(getAccessToken()).toBeNull()
      expect(getCurrentUsername()).toBeNull()
    })
  })

  describe('logout', () => {
    it('should call POST /auth/logout and clear local state', async () => {
      // 使用 setTokenResponse 直接建立登录态，避免 login() 消耗 mock 调用
      setTokenResponse('jwt', 900, 'admin')
      expect(getAccessToken()).toBe('jwt')

      mockRequest.mockResolvedValueOnce(null)
      await logout()
      expect(mockRequest).toHaveBeenCalledWith({ method: 'POST', url: '/auth/logout' })
      expect(getAccessToken()).toBeNull()
      expect(getCurrentUsername()).toBeNull()
    })

    it('should clear local state even if logout API fails (try...catch...finally)', async () => {
      setTokenResponse('jwt', 900, 'admin')

      mockRequest.mockRejectedValueOnce(new Error('Network error'))
      await logout() // catch 块吞掉异常，不应抛
      expect(getAccessToken()).toBeNull()
      expect(getCurrentUsername()).toBeNull()
    })
  })

  describe('refresh', () => {
    it('should call POST /auth/refresh and update token', async () => {
      mockRequest.mockResolvedValueOnce({ accessToken: 'new-jwt', expiresIn: 900 })
      await refresh()
      expect(mockRequest).toHaveBeenCalledWith({ method: 'POST', url: '/auth/refresh' })
      expect(getAccessToken()).toBe('new-jwt')
    })

    it('should deduplicate concurrent calls (single-flight)', async () => {
      // 模拟慢速 refresh：返回一个外部可 resolve 的 Promise
      let resolveFirst!: (value: unknown) => void
      const firstCall = new Promise<unknown>((resolve) => {
        resolveFirst = resolve
      })
      mockRequest.mockReturnValueOnce(firstCall)

      const r1 = refresh()
      const r2 = refresh() // 并发：应共享 r1 的调用
      const r3 = refresh()

      resolveFirst({ accessToken: 'shared-token', expiresIn: 900 })
      await Promise.all([r1, r2, r3])

      // mockRequest 只被调用一次（单飞）
      expect(mockRequest).toHaveBeenCalledTimes(1)
      expect(getAccessToken()).toBe('shared-token')
    })

    it('should release lock on failure and allow retry', async () => {
      mockRequest.mockRejectedValueOnce(new Error('refresh failed'))
      await expect(refresh()).rejects.toThrow('refresh failed')

      // 锁已释放，下一次调用可以重试
      mockRequest.mockResolvedValueOnce({ accessToken: 'retry-token', expiresIn: 900 })
      await refresh()
      expect(getAccessToken()).toBe('retry-token')
    })
  })
})

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

import { login, logout, refresh } from './index'

describe('auth operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearToken()
  })

  describe('login', () => {
    it('should call POST /auth/login and store token response', async () => {
      mockRequest.mockResolvedValueOnce({ accessToken: 'jwt-token', expiresIn: 900 })
      await login({ username: 'admin', password: 'admin123' })
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/auth/login',
        data: { username: 'admin', password: 'admin123' },
      })
      expect(getAccessToken()).toBe('jwt-token')
      expect(getCurrentUsername()).toBe('admin')
      expect(getTokenExpiresAt()).toBeGreaterThan(Date.now())
    })

    it('should propagate login failure and not store token', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Network error'))
      await expect(login({ username: 'admin', password: 'wrong' })).rejects.toThrow('Network error')
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

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAccessToken,
  setAccessToken,
  getCurrentUsername,
  setCurrentUsername,
  getTokenExpiresAt,
  isTokenNearExpiry,
  setTokenResponse,
  clearToken,
} from './token'

describe('token storage', () => {
  beforeEach(() => {
    clearToken()
  })

  describe('legacy exports (unchanged signatures)', () => {
    it('setAccessToken / getAccessToken round-trip', () => {
      setAccessToken('legacy-token')
      expect(getAccessToken()).toBe('legacy-token')
      setAccessToken(null)
      expect(getAccessToken()).toBeNull()
    })

    it('setCurrentUsername / getCurrentUsername round-trip', () => {
      setCurrentUsername('alice')
      expect(getCurrentUsername()).toBe('alice')
      setCurrentUsername(null)
      expect(getCurrentUsername()).toBeNull()
    })
  })

  describe('setTokenResponse', () => {
    it('should set access token, expiresAt, and username', () => {
      setTokenResponse('test-token', 900, 'admin')
      expect(getAccessToken()).toBe('test-token')
      expect(getTokenExpiresAt()).toBeGreaterThan(Date.now())
      expect(getTokenExpiresAt()).toBeLessThanOrEqual(Date.now() + 900_000)
      expect(getCurrentUsername()).toBe('admin')
    })

    it('should not overwrite username when not provided (refresh scenario)', () => {
      setTokenResponse('t1', 900, 'alice')
      expect(getCurrentUsername()).toBe('alice')
      setTokenResponse('t2', 900) // refresh 场景：不传 username
      expect(getAccessToken()).toBe('t2')
      expect(getCurrentUsername()).toBe('alice') // 用户名保持
    })
  })

  describe('isTokenNearExpiry', () => {
    it('should return false when no token (expiresAt is null)', () => {
      expect(isTokenNearExpiry()).toBe(false)
    })

    it('should return false when token far from expiry', () => {
      setTokenResponse('t', 900) // 15 分钟后才到期
      expect(isTokenNearExpiry()).toBe(false)
    })

    it('should return true when token is within 60s buffer', () => {
      // expiresIn=0 → 到期戳设在过去 → 一定在缓冲区内
      setTokenResponse('near-expiry', 0)
      expect(isTokenNearExpiry()).toBe(true)
    })

    it('should return true when token is already expired', () => {
      // expiresIn=-60 → 到期戳设在 60 秒前 → 已到期
      setTokenResponse('expired', -60)
      expect(isTokenNearExpiry()).toBe(true)
    })
  })

  describe('clearToken', () => {
    it('should clear all token state', () => {
      setTokenResponse('t', 900, 'admin')
      clearToken()
      expect(getAccessToken()).toBeNull()
      expect(getTokenExpiresAt()).toBeNull()
      expect(getCurrentUsername()).toBeNull()
    })
  })

  describe('invariant: token never in localStorage/sessionStorage', () => {
    it('setTokenResponse should not write to localStorage', () => {
      setTokenResponse('t', 900, 'admin')
      expect(localStorage.getItem('accessToken')).toBeNull()
      expect(localStorage.getItem('token')).toBeNull()
    })

    it('setAccessToken should not write to localStorage', () => {
      setAccessToken('t')
      expect(localStorage.getItem('accessToken')).toBeNull()
    })

    it('clearToken should not affect unrelated localStorage keys', () => {
      localStorage.setItem('other-key', 'val')
      setTokenResponse('t', 900, 'admin')
      clearToken()
      expect(localStorage.getItem('other-key')).toBe('val')
    })
  })
})

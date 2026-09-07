import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken, setAccessToken } from './token'
import { initializeDevDebugAuth, resolveDevDebugUserId } from './dev-debug'

describe('dev-only debug auth seam', () => {
  afterEach(() => {
    setAccessToken(null)
    vi.unstubAllEnvs()
  })

  it('accepts a positive decimal user id and uses the existing memory token slot', () => {
    vi.stubEnv('VITE_DEBUG_AUTH_ENABLED', 'true')
    vi.stubEnv('VITE_DEBUG_AUTH_USER_ID', '2095440402252939265')

    expect(resolveDevDebugUserId()).toBe('2095440402252939265')
    expect(initializeDevDebugAuth()).toBe('2095440402252939265')
    expect(getAccessToken()).toBe('test_2095440402252939265')
  })

  it('rejects empty, zero, negative, decimal and payload-shaped values', () => {
    vi.stubEnv('VITE_DEBUG_AUTH_ENABLED', 'true')
    for (const value of ['', '0', '-1', '1.0', '1;role=admin', '{"userId":1}']) {
      expect(resolveDevDebugUserId(true, value)).toBeNull()
    }
    expect(getAccessToken()).toBeNull()
  })

  it('does not inject when the explicit development switch is disabled', () => {
    vi.stubEnv('VITE_DEBUG_AUTH_ENABLED', 'false')
    vi.stubEnv('VITE_DEBUG_AUTH_USER_ID', '1')

    expect(initializeDevDebugAuth()).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it('debug initialization and switch-off perform zero persistence writes', () => {
    const localSetItem = vi.spyOn(window.localStorage, 'setItem')
    const sessionSetItem = vi.spyOn(window.sessionStorage, 'setItem')
    const cookieSetter = vi.spyOn(Document.prototype, 'cookie', 'set')

    vi.stubEnv('VITE_DEBUG_AUTH_ENABLED', 'true')
    vi.stubEnv('VITE_DEBUG_AUTH_USER_ID', '2095490569284018177')
    expect(initializeDevDebugAuth()).toBe('2095490569284018177')

    vi.stubEnv('VITE_DEBUG_AUTH_ENABLED', 'false')
    expect(initializeDevDebugAuth()).toBeNull()

    expect(localSetItem).not.toHaveBeenCalled()
    expect(sessionSetItem).not.toHaveBeenCalled()
    expect(cookieSetter).not.toHaveBeenCalled()
    console.log(
      '[E2-debug-auth] init=1 switch_off=1 localStorage_setItem=0 sessionStorage_setItem=0 cookie_set=0',
    )
  })
})

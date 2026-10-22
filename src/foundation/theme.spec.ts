import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, normalizeTheme, readTheme, themeColor } from './theme'

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('style')
  })
  it('normalizes saved input and rejects CSS injection or invalid names', () => {
    expect(normalizeTheme({ name: 'custom', customColor: '#B45309', token: 'not-theme' })).toEqual({
      name: 'custom',
      customColor: '#b45309',
    })
    expect(normalizeTheme({ name: 'custom', customColor: '#fff; color:red' }).name).toBe('purple')
    expect(normalizeTheme({ name: 'untrusted', customColor: '#ffffff' }).name).toBe('purple')
    localStorage.setItem('sw.appearance.theme', '{')
    expect(readTheme().name).toBe('purple')
  })
  it('updates semantic variables and persists only the selected color preference', () => {
    applyTheme({ name: 'blue', customColor: '#b45309' })
    expect(document.documentElement.style.getPropertyValue('--sw-color-primary')).toBe('#2563eb')
    expect(readTheme()).toEqual({ name: 'blue', customColor: '#b45309' })
    expect(themeColor({ name: 'teal', customColor: '#b45309' })).toBe('#087f8c')
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i))).toEqual([
      'sw.appearance.theme',
    ])
    applyTheme({ name: 'purple', customColor: '#b45309' })
    expect(document.documentElement.style.getPropertyValue('--sw-color-primary-soft')).toBe(
      '#ece9ff',
    )
  })
  it('remains usable when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(() => applyTheme({ name: 'custom', customColor: '#123456' })).not.toThrow()
    expect(document.documentElement.style.getPropertyValue('--sw-color-primary')).toBe('#123456')
    vi.restoreAllMocks()
  })
})

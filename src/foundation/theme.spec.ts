import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTheme,
  DEFAULT_THEME,
  isReadableThemeColor,
  normalizeTheme,
  previewThemeCssVariables,
  readTheme,
  resetTheme,
  THEME_STORAGE_KEY,
  themeColor,
  themeCssVariables,
} from './theme'

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-theme')
  })
  it('normalizes saved input and rejects CSS injection or invalid names', () => {
    expect(normalizeTheme({ name: 'custom', customColor: '#B45309', token: 'not-theme' })).toEqual({
      name: 'custom',
      customColor: '#b45309',
    })
    expect(normalizeTheme({ name: 'custom', customColor: '#fff; color:red' }).name).toBe('blue')
    expect(normalizeTheme({ name: 'custom', customColor: '#ffffff' }).name).toBe('blue')
    expect(normalizeTheme({ name: 'untrusted', customColor: '#ffffff' }).name).toBe('blue')
    localStorage.setItem(THEME_STORAGE_KEY, '{')
    expect(readTheme()).toEqual(DEFAULT_THEME)
  })
  it('uses blue on first use and migrates legacy purple preference to default blue', () => {
    expect(readTheme()).toEqual({ name: 'blue', customColor: '#b45309' })
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ name: 'purple', customColor: '#123456' }),
    )
    expect(readTheme()).toEqual(DEFAULT_THEME)
  })
  it('updates semantic variables and persists only the selected color preference', () => {
    applyTheme({ name: 'blue', customColor: '#b45309' })
    expect(document.documentElement.style.getPropertyValue('--sw-color-primary')).toBe('#2563eb')
    expect(document.documentElement.style.getPropertyValue('--sw-color-primary-soft')).toBe(
      '#eff6ff',
    )
    expect(document.documentElement.style.getPropertyValue('--sw-nav-topbar-portal-bg')).toBe(
      '#1d4ed8',
    )
    expect(document.documentElement.style.getPropertyValue('--sw-nav-topbar-text')).toBe('#e2e8f0')
    expect(readTheme()).toEqual({ name: 'blue', customColor: '#b45309' })
    expect(themeColor({ name: 'teal', customColor: '#b45309' })).toBe('#087f8c')
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i))).toEqual([
      THEME_STORAGE_KEY,
    ])
  })
  it('remains usable when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(() => applyTheme({ name: 'custom', customColor: '#123456' })).not.toThrow()
    expect(document.documentElement.style.getPropertyValue('--sw-color-primary')).toBe('#123456')
    vi.restoreAllMocks()
  })
  it('exposes a complete local variable set and clears explicit preference on reset', () => {
    const variables = themeCssVariables({ name: 'teal', customColor: '#b45309' })
    expect(variables['--sw-color-primary']).toBe('#087f8c')
    expect(variables['--sw-nav-topbar-portal-bg']).toContain('#087f8c')
    expect(variables['--sw-nav-topbar-text']).toContain('#087f8c')
    expect(variables['--el-color-primary']).toBe('#087f8c')
    expect(variables['--el-color-primary-light-9']).toContain('#087f8c')
    expect(isReadableThemeColor('#2563eb')).toBe(true)
    expect(isReadableThemeColor('#ffffff')).toBe(false)

    applyTheme({ name: 'custom', customColor: '#123456' })
    resetTheme()
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.dataset.theme).toBe('blue')
    expect(document.documentElement.style.getPropertyValue('--sw-color-primary')).toBe('#2563eb')
  })
  it('keeps an unreadable custom color in local preview while strict variables still normalize', () => {
    expect(
      previewThemeCssVariables({ name: 'custom', customColor: '#FFFFFF' })['--sw-color-primary'],
    ).toBe('#ffffff')
    expect(
      themeCssVariables({ name: 'custom', customColor: '#ffffff' })['--sw-color-primary'],
    ).toBe('#2563eb')
    expect(
      themeCssVariables({ name: 'custom', customColor: '#123456' })['--sw-color-primary'],
    ).toBe('#123456')
  })
})

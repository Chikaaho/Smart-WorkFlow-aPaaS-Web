/** 主题偏好只保存颜色，不接触会话或身份数据。 */
export const THEME_COLORS = { purple: '#6f2dff', blue: '#2563eb', teal: '#087f8c' } as const
export type ThemeName = keyof typeof THEME_COLORS | 'custom'
export interface ThemePreference {
  name: ThemeName
  customColor: string
}
const STORAGE_KEY = 'sw.appearance.theme'
const DEFAULT_THEME: ThemePreference = { name: 'purple', customColor: '#b45309' }
const VALID_COLOR = /^#[0-9a-f]{6}$/i

export function normalizeTheme(value: unknown): ThemePreference {
  if (!value || typeof value !== 'object') return { ...DEFAULT_THEME }
  const { name, customColor } = value as Partial<ThemePreference>
  if (name !== 'purple' && name !== 'blue' && name !== 'teal' && name !== 'custom')
    return { ...DEFAULT_THEME }
  if (typeof customColor !== 'string' || !VALID_COLOR.test(customColor)) return { ...DEFAULT_THEME }
  return { name, customColor: customColor.toLowerCase() }
}

export function readTheme(): ThemePreference {
  try {
    return normalizeTheme(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_THEME }
  }
}

export function themeColor(theme: ThemePreference): string {
  return theme.name === 'custom' ? normalizeTheme(theme).customColor : THEME_COLORS[theme.name]
}

export function applyTheme(value: ThemePreference, persist = true): void {
  const theme = normalizeTheme(value)
  const color = themeColor(theme)
  const style = document.documentElement.style
  style.setProperty('--sw-color-primary', color)
  style.setProperty(
    '--sw-color-primary-soft',
    theme.name === 'purple' ? '#ece9ff' : `color-mix(in srgb, ${color} 10%, white)`,
  )
  style.setProperty('--sw-color-primary-softer', `color-mix(in srgb, ${color} 14%, white)`)
  style.setProperty('--sw-color-primary-light', `color-mix(in srgb, ${color} 40%, white)`)
  style.setProperty('--sw-nav-sidebar-light-active-bg', 'var(--sw-color-primary-soft)')
  style.setProperty('--sw-nav-sidebar-light-active-text', color)
  style.setProperty('--sw-nav-item-active-bg', color)
  style.setProperty('--sw-nav-hover-bg', `color-mix(in srgb, ${color} 28%, transparent)`)
  style.setProperty(
    '--sw-nav-topbar-portal-bg',
    theme.name === 'purple' ? '#40369a' : `color-mix(in srgb, ${color} 60%, #111b3b)`,
  )
  style.setProperty(
    '--sw-nav-topbar-portal-active-bg',
    theme.name === 'purple' ? '#332b81' : `color-mix(in srgb, ${color} 45%, #111b3b)`,
  )
  document.documentElement.dataset.theme = theme.name
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
    } catch {
      /* 本次会话仍生效。 */
    }
  }
}

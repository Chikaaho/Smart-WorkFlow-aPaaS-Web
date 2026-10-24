/** 主题偏好只保存颜色，不接触会话或身份数据。 */
export const THEME_COLORS = { purple: '#6f2dff', blue: '#2563eb', teal: '#087f8c' } as const
export type ThemeName = keyof typeof THEME_COLORS | 'custom'
export interface ThemePreference {
  name: ThemeName
  customColor: string
}
export const THEME_STORAGE_KEY = 'sw.appearance.theme'
export const DEFAULT_THEME: Readonly<ThemePreference> = Object.freeze({
  name: 'blue',
  customColor: '#b45309',
})
const VALID_COLOR = /^#[0-9a-f]{6}$/i

function defaultTheme(): ThemePreference {
  return { ...DEFAULT_THEME }
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function channelLuminance(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

/** 自定义品牌色同时用于白底文字和白字按钮，至少需要 4.5:1 的对比度。 */
export function isReadableThemeColor(value: string): boolean {
  if (!VALID_COLOR.test(value)) return false
  const red = Number.parseInt(value.slice(1, 3), 16)
  const green = Number.parseInt(value.slice(3, 5), 16)
  const blue = Number.parseInt(value.slice(5, 7), 16)
  const luminance =
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  return 1.05 / (luminance + 0.05) >= 4.5
}

export function normalizeTheme(value: unknown): ThemePreference {
  if (!value || typeof value !== 'object') return defaultTheme()
  const { name, customColor } = value as Partial<ThemePreference>
  if (name !== 'purple' && name !== 'blue' && name !== 'teal' && name !== 'custom')
    return defaultTheme()
  if (typeof customColor !== 'string' || !isReadableThemeColor(customColor)) return defaultTheme()
  return { name, customColor: customColor.toLowerCase() }
}

export function readTheme(): ThemePreference {
  try {
    const saved = storage()?.getItem(THEME_STORAGE_KEY)
    return saved ? normalizeTheme(JSON.parse(saved)) : defaultTheme()
  } catch {
    return defaultTheme()
  }
}

export function themeColor(theme: ThemePreference): string {
  return theme.name === 'custom' ? normalizeTheme(theme).customColor : THEME_COLORS[theme.name]
}

/** 同一组语义变量同时供全局主题和弹窗局部预览使用。 */
export function themeCssVariables(value: ThemePreference): Record<`--${string}`, string> {
  const theme = normalizeTheme(value)
  const color = themeColor(theme)
  const purple = theme.name === 'purple'
  const light3 = `color-mix(in srgb, ${color} 70%, white)`
  const light5 = `color-mix(in srgb, ${color} 50%, white)`
  const light7 = `color-mix(in srgb, ${color} 30%, white)`
  const light8 = `color-mix(in srgb, ${color} 20%, white)`
  const light9 = `color-mix(in srgb, ${color} 10%, white)`
  return {
    '--sw-color-primary': color,
    '--sw-color-primary-light': purple ? '#bfa7ff' : `color-mix(in srgb, ${color} 40%, white)`,
    '--sw-color-primary-soft': purple ? '#ece9ff' : `color-mix(in srgb, ${color} 10%, white)`,
    '--sw-color-primary-softer': purple ? '#e9e1ff' : `color-mix(in srgb, ${color} 14%, white)`,
    '--sw-nav-sidebar-light-active-bg': purple
      ? '#ece9ff'
      : `color-mix(in srgb, ${color} 10%, white)`,
    '--sw-nav-sidebar-light-active-text': color,
    '--sw-nav-item-active-bg': color,
    '--sw-nav-subitem-active-bg': purple ? '#29235c' : `color-mix(in srgb, ${color} 20%, #111b3b)`,
    '--sw-nav-hover-bg': `color-mix(in srgb, ${color} 28%, transparent)`,
    '--sw-nav-topbar-portal-bg': purple ? '#40369a' : `color-mix(in srgb, ${color} 60%, #111b3b)`,
    '--sw-nav-topbar-portal-active-bg': purple
      ? '#332b81'
      : `color-mix(in srgb, ${color} 45%, #111b3b)`,
    '--sw-nav-topbar-admin-active-bg': purple
      ? '#27345c'
      : `color-mix(in srgb, ${color} 30%, #111b3b)`,
    '--sw-nav-sidebar-active-bg': purple ? '#27345c' : `color-mix(in srgb, ${color} 30%, #111b3b)`,
    '--sw-nav-topbar-text': purple ? '#ece9ff' : `color-mix(in srgb, ${color} 10%, white)`,
    '--sw-nav-topbar-active-indicator': purple
      ? '#d8c9ff'
      : `color-mix(in srgb, ${color} 30%, white)`,
    '--el-color-primary': color,
    '--el-color-primary-light-3': light3,
    '--el-color-primary-light-5': light5,
    '--el-color-primary-light-7': light7,
    '--el-color-primary-light-8': light8,
    '--el-color-primary-light-9': light9,
    '--el-color-primary-dark-2': `color-mix(in srgb, ${color} 85%, black)`,
  }
}

export function applyTheme(value: ThemePreference, persist = true): void {
  const theme = normalizeTheme(value)
  const style = document.documentElement.style
  for (const [property, token] of Object.entries(themeCssVariables(theme))) {
    style.setProperty(property, token)
  }
  document.documentElement.dataset.theme = theme.name
  if (persist) {
    try {
      storage()?.setItem(THEME_STORAGE_KEY, JSON.stringify(theme))
    } catch {
      /* 本次会话仍生效。 */
    }
  }
}

/** 恢复默认并清除显式偏好；当前会话立即使用蓝色。 */
export function resetTheme(): void {
  try {
    storage()?.removeItem(THEME_STORAGE_KEY)
  } catch {
    /* 存储不可用时只处理当前会话。 */
  }
  applyTheme(DEFAULT_THEME, false)
}

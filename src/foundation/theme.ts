/** 主题偏好只保存颜色，不接触会话或身份数据。 */
export const THEME_COLORS = { blue: '#2563eb', teal: '#087f8c' } as const
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

/**
 * 全局蓝色主色参考值（direction-blue-primary-020）：
 * 浅主题底 #EFF6FF、门户顶栏 #1D4ED8、门户激活 #1E40AF、导航浅文字 #E2E8F0。
 * 青色/自定义仍按混色公式派生；管理端深色导航基色 #111B3B 不变。
 */
const BLUE_REFERENCE = {
  softBg: '#eff6ff',
  portalTop: '#1d4ed8',
  portalActive: '#1e40af',
  navLightText: '#e2e8f0',
} as const

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

/**
 * 旧版本内置紫色预设已退出产品目标：历史 `purple` 偏好平滑承接为默认蓝色，
 * 不要求用户清理本地数据；用户显式设置的自定义 HEX 按 `custom` 原样保留。
 */
export function normalizeTheme(value: unknown): ThemePreference {
  if (!value || typeof value !== 'object') return defaultTheme()
  const { name, customColor } = value as Partial<ThemePreference>
  if (name !== 'blue' && name !== 'teal' && name !== 'custom') return defaultTheme()
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

function buildCssVariables(theme: ThemePreference): Record<`--${string}`, string> {
  const color = theme.name === 'custom' ? theme.customColor : THEME_COLORS[theme.name]
  const isBlue = theme.name === 'blue'
  const light3 = `color-mix(in srgb, ${color} 70%, white)`
  const light5 = `color-mix(in srgb, ${color} 50%, white)`
  const light7 = `color-mix(in srgb, ${color} 30%, white)`
  const light8 = `color-mix(in srgb, ${color} 20%, white)`
  const light9 = `color-mix(in srgb, ${color} 10%, white)`
  return {
    '--sw-color-primary': color,
    '--sw-color-primary-light': `color-mix(in srgb, ${color} 40%, white)`,
    '--sw-color-primary-soft': isBlue ? BLUE_REFERENCE.softBg : light9,
    '--sw-color-primary-softer': `color-mix(in srgb, ${color} 14%, white)`,
    '--sw-nav-sidebar-light-active-bg': isBlue ? BLUE_REFERENCE.softBg : light9,
    '--sw-nav-sidebar-light-active-text': color,
    '--sw-nav-item-active-bg': color,
    '--sw-nav-subitem-active-bg': `color-mix(in srgb, ${color} 20%, #111b3b)`,
    '--sw-nav-hover-bg': `color-mix(in srgb, ${color} 28%, transparent)`,
    '--sw-nav-topbar-portal-bg': isBlue
      ? BLUE_REFERENCE.portalTop
      : `color-mix(in srgb, ${color} 60%, #111b3b)`,
    '--sw-nav-topbar-portal-active-bg': isBlue
      ? BLUE_REFERENCE.portalActive
      : `color-mix(in srgb, ${color} 45%, #111b3b)`,
    '--sw-nav-topbar-admin-active-bg': `color-mix(in srgb, ${color} 30%, #111b3b)`,
    '--sw-nav-sidebar-active-bg': `color-mix(in srgb, ${color} 30%, #111b3b)`,
    '--sw-nav-topbar-text': isBlue
      ? BLUE_REFERENCE.navLightText
      : `color-mix(in srgb, ${color} 10%, white)`,
    '--sw-nav-topbar-active-indicator': `color-mix(in srgb, ${color} 30%, white)`,
    '--el-color-primary': color,
    '--el-color-primary-light-3': light3,
    '--el-color-primary-light-5': light5,
    '--el-color-primary-light-7': light7,
    '--el-color-primary-light-8': light8,
    '--el-color-primary-light-9': light9,
    '--el-color-primary-dark-2': `color-mix(in srgb, ${color} 85%, black)`,
  }
}

/** 同一组语义变量同时供全局主题和弹窗局部预览使用。 */
export function themeCssVariables(value: ThemePreference): Record<`--${string}`, string> {
  return buildCssVariables(normalizeTheme(value))
}

/**
 * 主题窗本地预览：取色面/HEX 尚未落到合法可读色时也按输入值展开变量，
 * 让拖拽和输入即时反馈；点「完成」仍走 normalizeTheme/applyTheme 的严格校验。
 */
export function previewThemeCssVariables(value: ThemePreference): Record<`--${string}`, string> {
  const name: ThemeName =
    value.name === 'custom' ? 'custom' : value.name === 'teal' ? 'teal' : 'blue'
  const customColor = VALID_COLOR.test(value.customColor)
    ? value.customColor.toLowerCase()
    : DEFAULT_THEME.customColor
  return buildCssVariables({ name, customColor })
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

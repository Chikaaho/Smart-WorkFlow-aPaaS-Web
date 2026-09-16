/**
 * 语言仓库（P61 §3.3）。
 *
 * 单一权威：登录页与登录后应用壳读写同一份偏好；未选择时以浏览器语言为候选，
 * 无法识别时回退 zh-CN。只在当前浏览器持久化（与「token 仅内存」边界无关）。
 * 同一会话中 Web 文案、Element Plus 内建文案与 Server 返回消息使用同一语言。
 */
import { createI18n } from 'vue-i18n'
import zhCnLocale from 'element-plus/es/locale/lang/zh-cn'
import enLocale from 'element-plus/es/locale/lang/en'
import zhCN from './zh-CN'
import enUS from './en-US'

export { useI18n } from 'vue-i18n'

export type AppLocale = 'zh-CN' | 'en-US'

export const SUPPORTED_LOCALES: AppLocale[] = ['zh-CN', 'en-US']

const STORAGE_KEY = 'sw.locale'
const HTML_LANG_ATTR = 'lang'

const MESSAGES = { 'zh-CN': zhCN, 'en-US': enUS }

function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as string[]).includes(value)
}

/** 浏览器语言 → 受支持语言；无法识别回退 zh-CN。 */
export function detectBrowserLocale(): AppLocale {
  const candidates =
    typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : []
  for (const candidate of candidates) {
    if (!candidate) continue
    if (/^zh/i.test(candidate)) return 'zh-CN'
    if (/^en/i.test(candidate)) return 'en-US'
  }
  return 'zh-CN'
}

export function loadLocale(): AppLocale {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (isAppLocale(stored)) return stored
  } catch {
    // 隐私模式等场景读不到 localStorage：按未选择处理
  }
  return detectBrowserLocale()
}

export function saveLocale(locale: AppLocale): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale)
  } catch {
    // 写入失败不影响当前会话
  }
}

/** Element Plus 内建文案跟随同一语言，避免局部中英混杂。 */
export function elementPlusLocale(locale: AppLocale) {
  return locale === 'en-US' ? enLocale : zhCnLocale
}

export const i18n = createI18n({
  legacy: false,
  locale: loadLocale(),
  fallbackLocale: 'zh-CN',
  messages: MESSAGES,
})

/** 当前语言（供请求层设置 Accept-Language）。 */
export function currentLocale(): AppLocale {
  return i18n.global.locale.value as AppLocale
}

/** 切换语言：i18n、Element Plus、`<html lang>` 与持久化同步生效。 */
export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  saveLocale(locale)
  applyHtmlLang(locale)
}

function applyHtmlLang(locale: AppLocale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(HTML_LANG_ATTR, locale)
  }
}

// 启动即同步 <html lang>，保证无障碍标签与语言一致
applyHtmlLang(loadLocale())

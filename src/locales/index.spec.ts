import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import {
  i18n,
  loadLocale,
  setLocale,
  detectBrowserLocale,
  elementPlusLocale,
  SUPPORTED_LOCALES,
  type AppLocale,
} from './index'

/**
 * P61 §3.3：语言仓库契约。
 *
 * 钉死：只支持 zh-CN / en-US 两种语言；未选择时按浏览器语言候选，识别不了回退 zh-CN；
 * 选择在当前浏览器持久化；切换后 i18n 与 Element Plus 内建文案同步生效；
 * `<html lang>` 跟随当前语言（无障碍标签不得与语言脱节）。
 */

const LOCALE_SWITCH = defineComponent({
  setup() {
    return () => h('div', { 'data-locale': i18n.global.locale.value })
  },
})

describe('locale warehouse', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear()
    i18n.global.locale.value = 'zh-CN'
  })

  it('只支持 zh-CN 与 en-US 两种语言（方向 §3.3 不扩充）', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'en-US'])
  })

  it('默认回退 zh-CN：无存储且无法识别浏览器语言', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR'] } as unknown as Navigator)
    expect(detectBrowserLocale()).toBe('zh-CN')
    vi.unstubAllGlobals()
  })

  it('浏览器语言为英文时候选 en-US', () => {
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] } as unknown as Navigator)
    expect(detectBrowserLocale()).toBe('en-US')
    vi.unstubAllGlobals()
  })

  it('持久化偏好优先于浏览器语言，且往返一致', () => {
    setLocale('en-US')
    expect(globalThis.localStorage?.getItem('sw.locale')).toBe('en-US')
    expect(loadLocale()).toBe('en-US')
    setLocale('zh-CN')
    expect(loadLocale()).toBe('zh-CN')
  })

  it('存储中的非法值不生效，回退到浏览器语言候选而不是采用非法值', () => {
    globalThis.localStorage?.setItem('sw.locale', 'fr-FR')
    const resolved = loadLocale()
    expect(resolved).not.toBe('fr-FR')
    expect(SUPPORTED_LOCALES).toContain(resolved)
  })

  it('切换语言会同步 i18n 与 <html lang>', async () => {
    const wrapper = mount(LOCALE_SWITCH, { global: { plugins: [i18n] } })
    expect(wrapper.attributes('data-locale')).toBe('zh-CN')

    setLocale('en-US')
    await nextTick()
    expect(i18n.global.locale.value).toBe('en-US')
    expect(wrapper.attributes('data-locale')).toBe('en-US')
    expect(document.documentElement.getAttribute('lang')).toBe('en-US')

    setLocale('zh-CN')
    await nextTick()
    expect(document.documentElement.getAttribute('lang')).toBe('zh-CN')
    wrapper.unmount()
  })

  it('Element Plus 内建文案跟随同一语言（避免局部中英混杂）', () => {
    const zh = elementPlusLocale('zh-CN')
    const en = elementPlusLocale('en-US')
    // 两套语言包必须是不同对象且各自带 name，证明确实切换了语言包
    expect(zh).not.toBe(en)
    expect(String(zh.name)).toMatch(/zh|cn/i)
    expect(String(en.name)).toMatch(/en/i)
  })

  it('两种语言都有同一组键（缺键会静默回退，破坏双语承诺）', () => {
    const zh = i18n.global.messages.value['zh-CN'] as Record<string, unknown>
    const en = i18n.global.messages.value['en-US'] as Record<string, unknown>
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    for (const section of Object.keys(zh)) {
      const zhSection = zh[section] as Record<string, unknown>
      const enSection = (en[section] ?? {}) as Record<string, unknown>
      expect(Object.keys(enSection).sort()).toEqual(Object.keys(zhSection).sort())
    }
  })

  it('locale 类型只允许受支持的两种值', () => {
    const values: AppLocale[] = ['zh-CN', 'en-US']
    expect(values.every((v) => SUPPORTED_LOCALES.includes(v))).toBe(true)
  })
})

/**
 * P61 R1 测试全局 setup。
 *
 * 组件文案已进入 i18n 目录（`t('...')`），因此所有 `mount()` 都需要 i18n 插件。
 * 这里统一注入，避免逐个 spec 重复配置；断言层面再按需改为断言语义而非完整文案。
 */
import { config } from '@vue/test-utils'
import { i18n, setLocale } from '@/locales'

config.global.plugins = [...(config.global.plugins ?? []), i18n]

// 用例默认语言固定为 zh-CN，保证断言稳定（语言切换用例自行 setLocale）
setLocale('zh-CN')

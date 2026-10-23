import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/locales'
import { enumLabel, ENUM_LABEL_KEYS, type EnumDomain } from './enum-label'

const originalLocale = i18n.global.locale.value
afterEach(() => {
  i18n.global.locale.value = originalLocale
})

describe('workflow monitor status labels', () => {
  it('resolves every registered monitor state in both languages', () => {
    const domains: EnumDomain[] = [
      'WORKFLOW_TRIGGER',
      'WORKFLOW_ACTION_REF',
      'WORKFLOW_CHILD_BATCH',
      'WORKFLOW_CHILD_ITEM',
      'WORKFLOW_WAIT_POLICY',
    ]
    for (const locale of ['zh-CN', 'en-US'] as const) {
      i18n.global.locale.value = locale
      for (const domain of domains) {
        for (const [value, key] of Object.entries(ENUM_LABEL_KEYS[domain])) {
          expect(i18n.global.te(key)).toBe(true)
          expect(enumLabel(domain, value)).not.toBe(value)
          expect(enumLabel(domain, value)).not.toBe(key)
        }
      }
    }
  })
  it('follows language changes while preserving unknown and empty states', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(enumLabel('WORKFLOW_CHILD_BATCH', 'SETTLED')).toBe('已结算')
    i18n.global.locale.value = 'en-US'
    expect(enumLabel('WORKFLOW_CHILD_BATCH', 'SETTLED')).toBe('Settled')
    expect(enumLabel('WORKFLOW_CHILD_BATCH', 'FUTURE_STATE')).toBe('FUTURE_STATE')
    expect(enumLabel('WORKFLOW_CHILD_BATCH', null)).toBe('')
  })
})

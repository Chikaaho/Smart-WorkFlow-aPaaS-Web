import { describe, it, expect } from 'vitest'
import { i18n } from '@/locales'
import { getErrorMessage, ERROR_CODE_KEYS } from './error-code-map'

describe('foundation/request/error-code-map', () => {
  describe('ERROR_CODE_KEYS', () => {
    it('covers all 4 form validation codes (1400–1403)', () => {
      expect(i18n.global.t(ERROR_CODE_KEYS[1400])).toBe('未知字段')
      expect(i18n.global.t(ERROR_CODE_KEYS[1401])).toMatch(/必填/)
      expect(i18n.global.t(ERROR_CODE_KEYS[1402])).toMatch(/类型/)
      expect(i18n.global.t(ERROR_CODE_KEYS[1403])).toMatch(/字典/)
    })

    it('covers all 6 form data query codes (1500–1505)', () => {
      expect(i18n.global.t(ERROR_CODE_KEYS[1500])).toMatch(/表单/)
      expect(i18n.global.t(ERROR_CODE_KEYS[1501])).toMatch(/字段/)
      expect(i18n.global.t(ERROR_CODE_KEYS[1502])).toMatch(/筛选/)
      expect(i18n.global.t(ERROR_CODE_KEYS[1503])).toMatch(/筛选条件/)
      expect(i18n.global.t(ERROR_CODE_KEYS[1504])).toMatch(/筛选/)
      expect(i18n.global.t(ERROR_CODE_KEYS[1505])).toMatch(/引用/)
    })

    it('has non-empty string values for all keys', () => {
      // 表里存的是键：断言每个键都能解析出非空文案（并在切换语言后仍正确）
      for (const key of Object.values(ERROR_CODE_KEYS)) {
        expect(typeof key).toBe('string')
        expect(key.length).toBeGreaterThan(0)
        expect(String(i18n.global.t(key))).not.toBe(key)
      }
    })
  })

  describe('getErrorMessage', () => {
    it('returns backend message when non-empty', () => {
      expect(getErrorMessage(1401, '申请人不能为空')).toBe('申请人不能为空')
    })

    it('falls back to the key map when backend message is empty', () => {
      expect(getErrorMessage(1401, '')).toBe(i18n.global.t(ERROR_CODE_KEYS[1401]))
    })

    it('falls back to the key map when backend message is undefined', () => {
      expect(getErrorMessage(1401, undefined)).toBe(i18n.global.t(ERROR_CODE_KEYS[1401]))
    })

    it('returns generic fallback for unknown code with no backend message', () => {
      const result = getErrorMessage(1999, '')
      expect(result).toContain('1999')
    })

    it('prefers backend message even for unknown codes', () => {
      expect(getErrorMessage(1999, '自定义错误')).toBe('自定义错误')
    })
  })
})

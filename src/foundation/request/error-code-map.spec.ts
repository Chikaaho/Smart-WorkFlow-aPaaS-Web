import { describe, it, expect } from 'vitest'
import { getErrorMessage, ERROR_CODE_MAP } from './error-code-map'

describe('foundation/request/error-code-map', () => {
  describe('ERROR_CODE_MAP', () => {
    it('covers all 4 form validation codes (1400–1403)', () => {
      expect(ERROR_CODE_MAP[1400]).toBe('未知字段')
      expect(ERROR_CODE_MAP[1401]).toMatch(/必填/)
      expect(ERROR_CODE_MAP[1402]).toMatch(/类型/)
      expect(ERROR_CODE_MAP[1403]).toMatch(/字典/)
    })

    it('covers all 6 form data query codes (1500–1505)', () => {
      expect(ERROR_CODE_MAP[1500]).toMatch(/表单/)
      expect(ERROR_CODE_MAP[1501]).toMatch(/字段/)
      expect(ERROR_CODE_MAP[1502]).toMatch(/筛选/)
      expect(ERROR_CODE_MAP[1503]).toMatch(/操作符/)
      expect(ERROR_CODE_MAP[1504]).toMatch(/操作符/)
      expect(ERROR_CODE_MAP[1505]).toMatch(/引用/)
    })

    it('has non-empty string values for all keys', () => {
      for (const msg of Object.values(ERROR_CODE_MAP)) {
        expect(msg).toBeTruthy()
      }
    })
  })

  describe('getErrorMessage', () => {
    it('returns backend message when non-empty', () => {
      expect(getErrorMessage(1401, '申请人不能为空')).toBe('申请人不能为空')
    })

    it('falls back to ERROR_CODE_MAP when backend message is empty', () => {
      expect(getErrorMessage(1401, '')).toBe(ERROR_CODE_MAP[1401])
    })

    it('falls back to ERROR_CODE_MAP when backend message is undefined', () => {
      expect(getErrorMessage(1401, undefined)).toBe(ERROR_CODE_MAP[1401])
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

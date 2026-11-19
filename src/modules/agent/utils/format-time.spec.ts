import { describe, it, expect } from 'vitest'
import { formatOccurredTime } from './format-time'

describe('agent/utils/format-time formatOccurredTime（1.1.3/B3）', () => {
  it('ISO 原值格式化为 yyyy-MM-dd HH:mm:ss，不带 T 与微秒', () => {
    expect(formatOccurredTime('2026-11-14T16:04:57')).toBe('2026-11-14 16:04:57')
    expect(formatOccurredTime('2026-11-14T16:04:57.123')).toBe('2026-11-14 16:04:57')
  })

  it('空值与空串显示 -', () => {
    expect(formatOccurredTime(null)).toBe('-')
    expect(formatOccurredTime(undefined)).toBe('-')
    expect(formatOccurredTime('')).toBe('-')
  })

  it('无法解析的原文按前 19 位兜底展示，不抛错', () => {
    expect(formatOccurredTime('not-a-date-value-overflow-long-text')).toBe('not-a-date-value-ov')
  })
})

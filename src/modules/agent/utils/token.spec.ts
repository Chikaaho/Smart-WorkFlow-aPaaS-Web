import { describe, expect, it } from 'vitest'
import { sumTokens, toTokenNumber } from './token'

describe('agent token normalization', () => {
  it('F1S2-G4: 字符串数值按数值相加（728 + 104 = 832）', () => {
    expect(sumTokens('728', '104')).toBe(832)
  })

  it('F1S2-G4: 数字与字符串混合时仍按数值相加', () => {
    expect(sumTokens(12, '8')).toBe(20)
    expect(sumTokens('1', '1')).toBe(2)
  })

  it('F1S2-G4: 任一侧未知时合计为 null，不以 0 补齐', () => {
    expect(sumTokens(null, '104')).toBeNull()
    expect(sumTokens('728', undefined)).toBeNull()
    expect(sumTokens('', '104')).toBeNull()
  })

  it('toTokenNumber 保留 0，并将非法文本视为未知', () => {
    expect(toTokenNumber('0')).toBe(0)
    expect(toTokenNumber(0)).toBe(0)
    expect(toTokenNumber('abc')).toBeNull()
    expect(toTokenNumber('-1')).toBeNull()
  })
})

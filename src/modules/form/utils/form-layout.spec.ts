import { describe, expect, it } from 'vitest'
import type { FormSchemaField } from '@/contracts/form-schema'
import {
  FORM_GRID_COLUMNS,
  getFormFieldColSpan,
  remainingSpanAtInsert,
  isValidFormFieldColSpan,
  normalizeFormFieldColSpan,
  packFormGridRows,
} from './form-layout'

function field(type: FormSchemaField['type'] = 'TEXT', colSpan?: unknown) {
  return { type, colSpan } as Pick<FormSchemaField, 'type' | 'colSpan'>
}

describe('form-layout', () => {
  it('accepts only integer spans from 1 through 24', () => {
    expect(FORM_GRID_COLUMNS).toBe(24)
    expect([1, 12, 24].every(isValidFormFieldColSpan)).toBe(true)
    expect([0, 25, -1, 1.5, '12', null, undefined].some(isValidFormFieldColSpan)).toBe(false)
  })

  it('keeps valid spans and normalizes missing or invalid values by field type', () => {
    expect(normalizeFormFieldColSpan(1, 'TEXT')).toBe(1)
    expect(getFormFieldColSpan(field('TEXT'))).toBe(12)
    expect(getFormFieldColSpan(field('RICH_TEXT'))).toBe(24)
    expect(getFormFieldColSpan(field('LABEL'))).toBe(24)
    expect(getFormFieldColSpan(field('TABLE', 0))).toBe(24)
  })

  it('packs fields in deterministic source order without fillable holes', () => {
    expect(
      packFormGridRows([
        field('TEXT', 12),
        field('NUMBER', 12),
        field('TEXT', 24),
        field('TEXT', 1),
        field('TEXT', 23),
        field('TEXT', 13),
      ]),
    ).toEqual([[12, 12], [24], [1, 23], [13]])
  })
})

// ========== BF20261013-004：插入点行内剩余 span ==========

describe('remainingSpanAtInsert 插入点行内剩余列数', () => {
  const f = (span: number) => ({ type: 'TEXT' as const, colSpan: span })

  it('空画布/头部插入=整行 24', () => {
    expect(remainingSpanAtInsert([], 0)).toBe(24)
    expect(remainingSpanAtInsert([f(12), f(12)], 0)).toBe(24)
  })

  it('半行行尾插入=剩余 12（并排插入所见即所得）', () => {
    // A(12) 后插入：该行已用 12 → 剩余 12
    expect(remainingSpanAtInsert([f(12), f(24)], 1)).toBe(12)
  })

  it('行满位置插入=换行整行 24', () => {
    expect(remainingSpanAtInsert([f(12), f(12)], 2)).toBe(24)
  })

  it('两行之间插入按插入点所在行累计（跨行字段把累计清零）', () => {
    // A(24) 后插入：A 跨行起点 → used=24 → 剩余 0 → 返回 24（作为新行）
    expect(remainingSpanAtInsert([f(24), f(12)], 1)).toBe(24)
    // A(24) B(12)：在 B 后（index 2）插入 → 插入点在第二行（B 行）已用 12 → 剩余 12
    expect(remainingSpanAtInsert([f(24), f(12)], 2)).toBe(12)
  })

  it('index 超界按末尾处理', () => {
    expect(remainingSpanAtInsert([f(12)], 5)).toBe(12)
  })
})

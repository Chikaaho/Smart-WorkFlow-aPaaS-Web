import { describe, expect, it } from 'vitest'
import type { FormSchemaField } from '@/contracts/form-schema'
import {
  FORM_GRID_COLUMNS,
  getFormFieldColSpan,
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

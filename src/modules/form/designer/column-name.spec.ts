import { describe, it, expect } from 'vitest'
import {
  isValidColumnName,
  isColumnNameUnique,
  slugifyColumnName,
  generateColumnName,
} from './column-name'

describe('isValidColumnName', () => {
  it('accepts lowercase/underscore-leading names', () => {
    expect(isValidColumnName('name')).toBe(true)
    expect(isValidColumnName('_name')).toBe(true)
    expect(isValidColumnName('field_1')).toBe(true)
    expect(isValidColumnName('a1_b2')).toBe(true)
  })

  it('rejects illegal names', () => {
    expect(isValidColumnName('1name')).toBe(false) // 数字开头
    expect(isValidColumnName('Name')).toBe(false) // 大写
    expect(isValidColumnName('na me')).toBe(false) // 空格
    expect(isValidColumnName('na-me')).toBe(false) // 连字符
    expect(isValidColumnName('')).toBe(false)
    expect(isValidColumnName('姓名')).toBe(false) // 中文
  })
})

describe('isColumnNameUnique', () => {
  it('detects duplicates within a form', () => {
    expect(isColumnNameUnique('a', ['b', 'c'])).toBe(true)
    expect(isColumnNameUnique('a', ['a', 'b'])).toBe(false)
    expect(isColumnNameUnique('a', [])).toBe(true)
  })
})

describe('slugifyColumnName', () => {
  it('slugifies english labels', () => {
    expect(slugifyColumnName('User Name')).toBe('user_name')
    expect(slugifyColumnName('Total-Amount')).toBe('total_amount')
    expect(slugifyColumnName('  spaced  ')).toBe('spaced')
  })

  it('prefixes underscore when starting with a digit', () => {
    expect(slugifyColumnName('123abc')).toBe('_123abc')
  })

  it('returns empty string when no legal chars (e.g. pure chinese)', () => {
    expect(slugifyColumnName('姓名')).toBe('')
    expect(slugifyColumnName('！@#')).toBe('')
  })
})

describe('generateColumnName', () => {
  it('uses slug from label when possible', () => {
    expect(generateColumnName('User Name', [], 1)).toBe('user_name')
  })

  it('falls back to field_{seq} for chinese labels', () => {
    expect(generateColumnName('姓名', [], 3)).toBe('field_3')
  })

  it('suffixes to stay unique', () => {
    expect(generateColumnName('name', ['name'], 1)).toBe('name_2')
    expect(generateColumnName('name', ['name', 'name_2'], 1)).toBe('name_3')
  })

  it('dedupes the fallback name too', () => {
    expect(generateColumnName('姓名', ['field_2'], 2)).toBe('field_2_2')
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIELD_LABEL_POSITION,
  fieldLabelPositionClass,
  isFieldLabelPosition,
} from './form-schema'

/**
 * 字段标题位置契约：五种合法位置 + 缺省值 + 共用类名。
 * 设计态（form-create 包装层）与填报态（DynamicField）共用同一份类名，
 * 本文件钉死命名，任一侧改动都会在此暴露。
 */
describe('form-schema 字段标题位置', () => {
  it('缺省位置为上方左对齐', () => {
    expect(DEFAULT_FIELD_LABEL_POSITION).toBe('top-left')
    expect(fieldLabelPositionClass(undefined)).toBe('sw-label-pos--top-left')
    expect(fieldLabelPositionClass(null)).toBe('sw-label-pos--top-left')
  })

  it('五种合法位置各有稳定类名', () => {
    const positions = ['left', 'right', 'top-left', 'top-right', 'top-center'] as const
    expect(positions.map((position) => fieldLabelPositionClass(position))).toEqual([
      'sw-label-pos--left',
      'sw-label-pos--right',
      'sw-label-pos--top-left',
      'sw-label-pos--top-right',
      'sw-label-pos--top-center',
    ])
  })

  it('枚举守卫只接受五种合法位置', () => {
    for (const position of ['left', 'right', 'top-left', 'top-right', 'top-center']) {
      expect(isFieldLabelPosition(position)).toBe(true)
    }
    for (const illegal of ['top', 'center', 'LEFT', '', 1, null, undefined, {}]) {
      expect(isFieldLabelPosition(illegal)).toBe(false)
    }
  })
})

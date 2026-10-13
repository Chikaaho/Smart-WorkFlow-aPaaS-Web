import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIELD_LABEL_POSITION,
  DEFAULT_FIELD_TEXT_ALIGN,
  fieldLabelPositionClass,
  isFieldLabelPosition,
  isFieldTextAlign,
  parseFormFieldOptions,
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

/**
 * 文字组件正文对齐：三种合法取值 + 缺省左对齐。
 */
describe('form-schema 文字对齐', () => {
  it('缺省左对齐', () => {
    expect(DEFAULT_FIELD_TEXT_ALIGN).toBe('left')
  })

  it('枚举守卫只接受左 / 居中 / 右', () => {
    for (const align of ['left', 'center', 'right']) {
      expect(isFieldTextAlign(align)).toBe(true)
    }
    for (const illegal of ['justify', 'CENTER', '', 1, null, undefined, {}]) {
      expect(isFieldTextAlign(illegal)).toBe(false)
    }
  })
})

/**
 * BF20261013-008：候选选项键值对解析。
 * 新形状 {key,value} 原样保留（含空行=编辑中间态）；历史 string[] 兼容为 key=value=原串；
 * 垃圾行丢弃、非数组归空——设计态编辑器与运行时控件共用同一解析。
 */
describe('form-schema 候选选项解析', () => {
  it('键值对数组原样保留（含空行）', () => {
    expect(
      parseFormFieldOptions([
        { key: 'canyin', value: '餐饮' },
        { key: '', value: '' },
        { key: 'jiaotong', value: '交通' },
      ]),
    ).toEqual([
      { key: 'canyin', value: '餐饮' },
      { key: '', value: '' },
      { key: 'jiaotong', value: '交通' },
    ])
  })

  it('历史字符串数组兼容为 key=value=原字符串', () => {
    expect(parseFormFieldOptions(['餐饮', '交通'])).toEqual([
      { key: '餐饮', value: '餐饮' },
      { key: '交通', value: '交通' },
    ])
  })

  it('非字符串/非对象垃圾行丢弃，非数组归空', () => {
    expect(parseFormFieldOptions(['餐饮', 42, null, { key: 1, value: 'x' }])).toEqual([
      { key: '餐饮', value: '餐饮' },
    ])
    expect(parseFormFieldOptions(undefined)).toEqual([])
    expect(parseFormFieldOptions('餐饮')).toEqual([])
  })
})

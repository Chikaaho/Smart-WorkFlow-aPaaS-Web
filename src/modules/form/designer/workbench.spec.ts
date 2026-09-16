import { describe, it, expect } from 'vitest'
import { i18n } from '@/locales'
import {
  resolveSaveState,
  saveStateKey,
  isDefinitionDirty,
  parseWorkbenchTab,
  LEAVE_GUARD_MESSAGE_KEY,
} from './workbench'

/**
 * 表单工作台纯函数单测（P52）。
 * 保存状态机五态语义与脏判定、工作区解析、离开保护文案单一来源。
 *
 * 断言对象是**状态标识与目录键**，不是某个语言的字面量：文案由 zh-CN/en-US 权威目录持有，
 * 双语一致性与键集对齐由目录单源与双语契约测试保证（避免每个页面各写一份文案断言）。
 */
describe('modules/form/designer/workbench', () => {
  describe('resolveSaveState', () => {
    it('saving 阶段恒为 saving（慢响应/重复点击不得闪态）', () => {
      expect(resolveSaveState(true, 'saving')).toBe('saving')
      expect(resolveSaveState(false, 'saving')).toBe('saving')
    })

    it('saved 阶段为 saveSuccess', () => {
      expect(resolveSaveState(false, 'saved')).toBe('saveSuccess')
    })

    it('error 阶段为 saveFailed，即使内容仍脏也不显示成功', () => {
      expect(resolveSaveState(true, 'error')).toBe('saveFailed')
      expect(resolveSaveState(false, 'error')).toBe('saveFailed')
    })

    it('idle 时按脏标记区分 unchanged / unsaved', () => {
      expect(resolveSaveState(false, 'idle')).toBe('unchanged')
      expect(resolveSaveState(true, 'idle')).toBe('unsaved')
    })
  })

  describe('saveStateKey', () => {
    it('五态分别指向 common 段的稳定目录键', () => {
      expect(saveStateKey('unchanged')).toBe('common.unchanged')
      expect(saveStateKey('unsaved')).toBe('common.unsaved')
      expect(saveStateKey('saving')).toBe('common.saving')
      expect(saveStateKey('saveSuccess')).toBe('common.saveSuccess')
      expect(saveStateKey('saveFailed')).toBe('common.saveFailed')
    })

    it('每个键在 zh-CN 与 en-US 目录中都有非空文案', () => {
      for (const state of [
        'unchanged',
        'unsaved',
        'saving',
        'saveSuccess',
        'saveFailed',
      ] as const) {
        const key = saveStateKey(state)
        for (const locale of ['zh-CN', 'en-US'] as const) {
          const value = i18n.global.t(key, {}, { locale })
          expect(typeof value === 'string' && value.length > 0 && value !== key).toBe(true)
        }
      }
    })
  })

  describe('isDefinitionDirty', () => {
    it('基线与当前一致 → 不脏', () => {
      expect(isDefinitionDirty('{"a":1}', '{"a":1}')).toBe(false)
    })

    it('基线与当前不同 → 脏', () => {
      expect(isDefinitionDirty('{"a":1}', '{"a":2}')).toBe(true)
    })

    it('空串与空串一致 → 不脏', () => {
      expect(isDefinitionDirty('', '')).toBe(false)
    })
  })

  describe('parseWorkbenchTab', () => {
    it('query 值 processes → processes 工作区', () => {
      expect(parseWorkbenchTab('processes')).toBe('processes')
    })

    it('design / 缺失 / 非法值 → 回退 design（深链恢复不落非法工作区）', () => {
      expect(parseWorkbenchTab('design')).toBe('design')
      expect(parseWorkbenchTab(undefined)).toBe('design')
      expect(parseWorkbenchTab('hack')).toBe('design')
      expect(parseWorkbenchTab(123)).toBe('design')
    })
  })

  it('离开保护文案键在双语目录中均存在且提示未保存修改可能丢失', () => {
    const zh = i18n.global.t(LEAVE_GUARD_MESSAGE_KEY, {}, { locale: 'zh-CN' })
    const en = i18n.global.t(LEAVE_GUARD_MESSAGE_KEY, {}, { locale: 'en-US' })
    expect(String(zh)).toContain('未保存')
    expect(String(zh)).not.toBe(LEAVE_GUARD_MESSAGE_KEY)
    expect(String(en)).not.toBe(LEAVE_GUARD_MESSAGE_KEY)
    expect(String(en).length).toBeGreaterThan(0)
  })
})

import { describe, it, expect } from 'vitest'
import {
  resolveSaveState,
  isDefinitionDirty,
  parseWorkbenchTab,
  LEAVE_GUARD_MESSAGE,
} from './workbench'

/**
 * 表单工作台纯函数单测（P52）。
 * 保存状态机五态语义与脏判定、工作区解析、离开保护文案单一来源。
 */
describe('modules/form/designer/workbench', () => {
  describe('resolveSaveState', () => {
    it('saving 阶段恒为「保存中」（慢响应/重复点击不得闪态）', () => {
      expect(resolveSaveState(true, 'saving')).toBe('保存中')
      expect(resolveSaveState(false, 'saving')).toBe('保存中')
    })

    it('saved 阶段为「保存成功」', () => {
      expect(resolveSaveState(false, 'saved')).toBe('保存成功')
    })

    it('error 阶段为「保存失败」，即使内容仍脏也不显示成功', () => {
      expect(resolveSaveState(true, 'error')).toBe('保存失败')
      expect(resolveSaveState(false, 'error')).toBe('保存失败')
    })

    it('idle 时按脏标记区分「未修改 / 未保存」', () => {
      expect(resolveSaveState(false, 'idle')).toBe('未修改')
      expect(resolveSaveState(true, 'idle')).toBe('未保存')
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

  it('离开保护文案提示未保存修改可能丢失', () => {
    expect(LEAVE_GUARD_MESSAGE).toContain('未保存')
  })
})

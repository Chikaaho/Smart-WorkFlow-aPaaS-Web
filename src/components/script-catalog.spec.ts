import { describe, expect, it } from 'vitest'
import { FORM_SCRIPT_FUNCTIONS } from './script-catalog'
import { FIELD_SCRIPT_FUNCTION_NAMES } from '@/modules/form/utils/field-scripts'

describe('表单脚本函数目录与运行时一致性', () => {
  it('目录中的每个表单函数都有字段脚本宿主实现', () => {
    const implemented = new Set<string>(FIELD_SCRIPT_FUNCTION_NAMES)
    const missing = FORM_SCRIPT_FUNCTIONS.map((fn) => fn.name.replace(/^#/, '')).filter(
      (name) => !implemented.has(name),
    )
    expect(missing).toEqual([])
  })

  it('目录函数包含参数/返回值说明与可插入示例', () => {
    for (const fn of FORM_SCRIPT_FUNCTIONS) {
      expect(fn.desc.length).toBeGreaterThan(0)
      expect(fn.snippet.length).toBeGreaterThan(0)
      expect(fn.category.length).toBeGreaterThan(0)
    }
  })
})

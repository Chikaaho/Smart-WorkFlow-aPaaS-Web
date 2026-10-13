import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { createFieldScripts, validateFieldScript } from './field-scripts'
import type { FormSchema } from '@/contracts/form-schema'

/**
 * BF20261013-021：表单字段脚本运行时用例。
 */
function schemaWithScripts(): FormSchema {
  return {
    title: 't',
    fields: [
      { type: 'TEXT', name: 'field_a', label: 'A' },
      {
        type: 'TEXT',
        name: 'field_b',
        label: 'B',
        script: { code: '#设置字段值(field_c, #获取字段值(field_a) + "!");' },
      },
      { type: 'TEXT', name: 'field_c', label: 'C' },
      {
        type: 'TEXT',
        name: 'field_d',
        label: 'D',
        script: { code: '#设置隐藏(field_d, true);', onLoad: true },
      },
    ],
  }
}

describe('createFieldScripts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('字段值变化触发该字段脚本：# 糖读写字段值', async () => {
    const schema = schemaWithScripts()
    const model = reactive<Record<string, unknown>>({ field_a: 'x', field_b: '', field_c: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.field_b = 'changed'
    await nextTick()
    expect(model.field_c).toBe('x!')
    runtime.dispose()
  })

  it('设置必填/隐藏/只读写入覆盖层', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'src',
          label: 'S',
          script: { code: '#设置必填(dst, true); #设置只读(dst, true);' },
        },
        { type: 'TEXT', name: 'dst', label: 'D' },
      ],
    }
    const model = reactive<Record<string, unknown>>({ src: '', dst: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.src = '1'
    await nextTick()
    expect(runtime.overrides.required.dst).toBe(true)
    expect(runtime.overrides.readonly.dst).toBe(true)
    runtime.dispose()
  })

  it('onLoad 脚本仅在 runOnLoad 时执行', async () => {
    const schema = schemaWithScripts()
    const model = reactive<Record<string, unknown>>({
      field_a: '',
      field_b: '',
      field_c: '',
      field_d: '',
    })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    await nextTick()
    expect(runtime.overrides.hidden.field_d).toBeUndefined()
    runtime.runOnLoad()
    expect(runtime.overrides.hidden.field_d).toBe(true)
    runtime.dispose()
  })

  it('enabled=false（只读查看态）不执行脚本', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'a',
          label: 'A',
          script: { code: '#设置字段值(b, "ran");', onLoad: true },
        },
        { type: 'TEXT', name: 'b', label: 'B' },
      ],
    }
    const model = reactive<Record<string, unknown>>({ a: '', b: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model, enabled: () => false })
    model.a = '1'
    await nextTick()
    runtime.runOnLoad()
    expect(model.b).toBe('')
    runtime.dispose()
  })

  it('未知字段名报错且不打断运行', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        { type: 'TEXT', name: 'a', label: 'A', script: { code: '#设置字段值(not_exist, 1);' } },
      ],
    }
    const errorSpy = vi.spyOn(ElMessage, 'error').mockImplementation(() => ({}) as never)
    const model = reactive<Record<string, unknown>>({ a: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.a = 'x'
    await nextTick()
    expect(runtime.lastError()).toContain('字段不存在')
    expect(errorSpy).toHaveBeenCalled()
    runtime.dispose()
  })

  it('互写级联在 12 步内收敛（死循环不会无限执行）', async () => {
    const schema: FormSchema = {
      title: 't',
      fields: [
        {
          type: 'TEXT',
          name: 'x',
          label: 'X',
          script: { code: '#设置字段值(y, String(#获取字段值(y)) + "x");' },
        },
        {
          type: 'TEXT',
          name: 'y',
          label: 'Y',
          script: { code: '#设置字段值(x, String(#获取字段值(x)) + "y");' },
        },
      ],
    }
    const model = reactive<Record<string, unknown>>({ x: '', y: '' })
    const runtime = createFieldScripts({ getSchema: () => schema, model })
    model.x = 'a'
    for (let i = 0; i < 40; i++) {
      await nextTick()
    }
    // 断言：联动真实发生（y 被写入）且未无限增长（字符串长度有界）
    expect(String(model.y)).toContain('x')
    expect(String(model.x).length).toBeLessThan(40)
    expect(String(model.y).length).toBeLessThan(40)
    runtime.dispose()
  })

  it('validateFieldScript：合法编译通过与语法错误诊断', () => {
    expect(validateFieldScript('#设置字段值(a, 1);')).toBeNull()
    expect(validateFieldScript('return #;')).toContain('应为函数名')
    expect(validateFieldScript('if (')).not.toBeNull()
  })
})
